import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useInventory } from './useInventoryData';
import { useWarehouseZones } from './useWarehouseZones';
import { SLOTTING_CONFIG } from '../config/slotting';
import { calculateSkuVelocity } from '../utils/capacityUtils';

export const useOptimizationReports = () => {
    const [latestReport, setLatestReport] = useState(null);
    const [allReports, setAllReports] = useState([]);
    const [loading, setLoading] = useState(true);

    const { inventoryData, locationCapacities, fetchLogs } = useInventory();
    const { zones } = useWarehouseZones(); // Access zone data

    // Fetch reports from Supabase
    useEffect(() => {
        const fetchReports = async () => {
            try {
                const { data, error } = await supabase
                    .from('optimization_reports')
                    .select('*')
                    .order('report_date', { ascending: false })
                    .limit(10);

                if (error) throw error;

                setAllReports(data || []);
                setLatestReport(data?.[0] || null);
            } catch (err) {
                console.error('Error fetching reports:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchReports();
    }, []);

    // Generate New Report (Logic Engine)
    const generateReport = async () => {
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

            // 2. Calculate Velocity for all SKUs
            const uniqueSkus = [...new Set(inventoryData.map(i => i.SKU))];
            const velocities = {};
            uniqueSkus.forEach(sku => {
                velocities[sku] = calculateSkuVelocity(sku, logs); // Returns null if < threshold
            });

            // 3. Group products by Current Zone
            const productsByZone = {
                HOT: [],
                WARM: [],
                COLD: [],
                UNASSIGNED: []
            };

            inventoryData.forEach(item => {
                const key = `${item.Warehouse}-${item.Location}`;
                const zone = zones[key]?.zone || 'UNASSIGNED';

                // Only consider valid zones for rebalancing
                if (productsByZone[zone]) {
                    productsByZone[zone].push({
                        ...item,
                        velocity: velocities[item.SKU] || 0 // Treat null as 0 for sorting
                    });
                }
            });

            const suggestions = [];

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
            const slowHotCandidates = hotItems.filter(i => i.velocity < 2); // Arbitrary low threshold
            const fastWarmCandidates = warmItems.filter(i => i.velocity > 5); // Arbitrary high threshold

            // Simple pairing logic
            for (const fastItem of fastWarmCandidates) {
                if (count >= MAX_SUGGESTIONS) break;

                // Find a slow item in same warehouse to swap with
                const swapCandidate = slowHotCandidates.find(slow =>
                    slow.Warehouse === fastItem.Warehouse // Must be within same warehouse
                    // && slow.Quantity <= fastItem.Quantity // Optional: ensure fit? Ignored for suggestion phase
                );

                if (swapCandidate) {
                    // Check if difference is significant (e.g. 2x faster)
                    if (fastItem.velocity > (swapCandidate.velocity * 2)) {
                        suggestions.push({
                            type: 'GRADUATION',
                            priority: 'HIGH',
                            reason: `Turnover Optimization`,
                            details: `Swap ${fastItem.SKU} (Fast: ${fastItem.velocity.toFixed(1)}/day) from WARM with ${swapCandidate.SKU} (Slow: ${swapCandidate.velocity.toFixed(1)}/day) from HOT.`,
                            promote: {
                                sku: fastItem.SKU,
                                location: fastItem.Location,
                                warehouse: fastItem.Warehouse
                            },
                            demote: {
                                sku: swapCandidate.SKU,
                                location: swapCandidate.Location,
                                warehouse: swapCandidate.Warehouse
                            },
                            action_label: `Move ${fastItem.SKU} to ${swapCandidate.Location}`
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
                    .from('optimization_reports')
                    .upsert({ // Upsert to overwrite if generated multiple times same day
                        report_date: new Date().toISOString().split('T')[0],
                        report_type: 'weekly_rebalance',
                        suggestions: { items: suggestions },
                        total_suggestions: suggestions.length
                    }, { onConflict: 'report_date, report_type' })
                    .select();

                if (error) throw error;
                setLatestReport(data[0]);
                return { success: true, count: suggestions.length };
            } else {
                return { success: true, count: 0, message: "No optimization needed." };
            }

        } catch (err) {
            console.error('Error generating report:', err);
            return { success: false, error: err.message };
        }
    };

    return {
        latestReport,
        allReports,
        loading,
        generateReport
    };
};
