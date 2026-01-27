import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useInventory } from './useInventoryData';
import { useWarehouseZones } from './useWarehouseZones';
import { calculateSkuVelocity, InventoryLogSimple } from '../utils/capacityUtils';

// --- Types ---

export interface LocationInfo {
    sku: string;
    quantity: number;
    location: string | null;
    warehouse: string;
    [key: string]: any;
}

export interface SuggestionPromo {
    sku: string;
    location: string | null;
    warehouse: string;
}

export interface Suggestion {
    type: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    reason: string;
    details: string;
    promote: SuggestionPromo;
    demote: SuggestionPromo;
    action_label: string;
}

export interface OptimizationReport {
    id?: number;
    report_date: string;
    report_type: string;
    suggestions: {
        items: Suggestion[];
    };
    total_suggestions: number;
}

interface GenerateReportResult {
    success: boolean;
    count?: number;
    message?: string;
    error?: string;
}

interface ProductWithVelocity extends LocationInfo {
    velocity: number;
}

// --- Hook ---

export const useOptimizationReports = () => {
    const [latestReport, setLatestReport] = useState<OptimizationReport | null>(null);
    const [allReports, setAllReports] = useState<OptimizationReport[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const { inventoryData } = useInventory();
    const { zones } = useWarehouseZones(); // Access zone data

    // Fetch reports from Supabase
    useEffect(() => {
        const fetchReports = async () => {
            try {
                const { data, error } = await supabase
                    .from('optimization_reports' as any)
                    .select('*')
                    .order('report_date', { ascending: false })
                    .limit(10);

                if (error) throw error;

                setAllReports(((data as any) as OptimizationReport[]) || []);
                setLatestReport(((data as any)?.[0] as OptimizationReport) || null);
            } catch (err) {
                console.error('Error fetching reports:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, []);

    // Generate New Report (Logic Engine)
    const generateReport = async (): Promise<GenerateReportResult> => {
        try {
            // 1. Fetch ALL recent logs for accurate velocity
            // We need raw logs from DB, fetchLogs from context might be paginated or filtered
            // Direct query here for robustness
            const { data: logs, error: logError } = await supabase
                .from('inventory_logs')
                .select('*')
                .eq('action_type', 'DEDUCT') // Only care about consumption
                .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
                .order('created_at', { ascending: false });

            if (logError) throw logError;

            // Cast logs to expected type
            const typedLogs = (logs as any) as InventoryLogSimple[];

            // 2. Calculate Velocity for all SKUs
            const uniqueSkus = [...new Set(inventoryData.map((i) => i.sku))];
            const velocities: Record<string, number | null> = {};
            uniqueSkus.forEach((sku) => {
                velocities[sku] = calculateSkuVelocity(sku, typedLogs); // Returns null if < threshold
            });

            // 3. Group products by Current Zone
            const productsByZone: Record<string, ProductWithVelocity[]> = {
                HOT: [],
                WARM: [],
                COLD: [],
                UNASSIGNED: [],
            };

            inventoryData.forEach((item) => {
                // Ensure location and warehouse are strings for the key
                const loc = item.location || 'UNKNOWN';
                const warehouse = item.warehouse || 'UNKNOWN';

                const key = `${warehouse}-${loc}`;
                const zoneData = zones[key];
                const zone = zoneData?.zone || 'UNASSIGNED';

                // Only consider valid zones for rebalancing
                // Check if the zone key exists in our accumulator, otherwise default to UNASSIGNED if we want to track it, 
                // or just ignore if it's not a standard zone.
                // The original logic pushed to specific keys. Let's make it robust.
                const targetZone = productsByZone[zone] ? zone : 'UNASSIGNED';

                if (productsByZone[targetZone]) {
                    productsByZone[targetZone].push({
                        ...item,
                        velocity: velocities[item.sku] || 0, // Treat null as 0 for sorting
                    });
                }
            });

            const suggestions: Suggestion[] = [];

            // 4. STRATEGY: GRADUATION (Hot <-> Warm Swaps)
            // Identify SLOW items in HOT zone and FAST items in WARM zone

            // Sort Hot items by ASCENDING velocity (slowest first)
            const hotItems = productsByZone.HOT.sort((a, b) => a.velocity - b.velocity);

            // Sort Warm items by DESCENDING velocity (fastest first)
            const warmItems = productsByZone.WARM.sort((a, b) => b.velocity - a.velocity);

            // Find candidates
            // We limit to top 5 suggestions to not overwhelm
            let count = 0;
            const MAX_SUGGESTIONS = 5;

            // Only consider items with legitimate velocity data (> 0)
            const slowHotCandidates = hotItems.filter((i) => i.velocity < 2); // Arbitrary low threshold
            const fastWarmCandidates = warmItems.filter((i) => i.velocity > 5); // Arbitrary high threshold

            // Simple pairing logic
            for (const fastItem of fastWarmCandidates) {
                if (count >= MAX_SUGGESTIONS) break;

                // Find a slow item in same warehouse to swap with
                const swapCandidate = slowHotCandidates.find(
                    (slow) => slow.warehouse === fastItem.warehouse // Must be within same warehouse
                    // && slow.quantity <= fastItem.quantity // Optional: ensure fit? Ignored for suggestion phase
                );

                if (swapCandidate) {
                    // Check if difference is significant (e.g. 2x faster)
                    if (fastItem.velocity > swapCandidate.velocity * 2) {
                        suggestions.push({
                            type: 'GRADUATION',
                            priority: 'HIGH',
                            reason: `Turnover Optimization`,
                            details: `Swap ${fastItem.sku} (Fast: ${fastItem.velocity.toFixed(1)}/day) from WARM with ${swapCandidate.sku} (Slow: ${swapCandidate.velocity.toFixed(1)}/day) from HOT.`,
                            promote: {
                                sku: fastItem.sku,
                                location: fastItem.location,
                                warehouse: fastItem.warehouse,
                            },
                            demote: {
                                sku: swapCandidate.sku,
                                location: swapCandidate.location,
                                warehouse: swapCandidate.warehouse,
                            },
                            action_label: `Move ${fastItem.sku} to ${swapCandidate.location}`,
                        });

                        // Remove candidate so we don't suggest swapping same item twice
                        const idx = slowHotCandidates.indexOf(swapCandidate);
                        if (idx > -1) slowHotCandidates.splice(idx, 1);

                        count++;
                    }
                }
            }

            // 5. Save Report
            if (suggestions.length > 0) {
                const { data, error } = await supabase
                    .from('optimization_reports' as any)
                    .upsert(
                        {
                            // Upsert to overwrite if generated multiple times same day
                            report_date: new Date().toISOString().split('T')[0],
                            report_type: 'weekly_rebalance',
                            suggestions: { items: suggestions },
                            total_suggestions: suggestions.length,
                        } as any,
                        { onConflict: 'report_date, report_type' }
                    )
                    .select();

                if (error) throw error;
                setLatestReport((data as any)?.[0] as OptimizationReport);
                return { success: true, count: suggestions.length };
            } else {
                return { success: true, count: 0, message: 'No optimization needed.' };
            }
        } catch (err: any) {
            console.error('Error generating report:', err);
            return { success: false, error: err.message };
        }
    };

    return {
        latestReport,
        allReports,
        loading,
        generateReport,
    };
};
