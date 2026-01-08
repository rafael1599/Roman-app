import { useState, useEffect, useMemo } from 'react';
import { X, ArrowRightLeft, Move, Search, CheckCircle, Scan, TrendingUp, Zap } from 'lucide-react';
import { useInventory } from '../../../hooks/useInventoryData';
// Import new hooks
import { useWarehouseZones } from '../../../hooks/useWarehouseZones';
import AutocompleteInput from '../../../components/ui/AutocompleteInput';
import { CapacityBar } from '../../../components/ui/CapacityBar';
// Import logic functions
import {
    calculateConsolidationPriority,
    calculateSkuVelocity,
    calculateHybridLocationScore,
    sortLocationsByConsolidation
} from '../../../utils/capacityUtils';
import { SLOTTING_CONFIG } from '../../../config/slotting';

export const MovementModal = ({ isOpen, onClose, onMove, initialSourceItem = null }) => {
    // 1. Context Hooks
    const { inventoryData, ludlowData, atsData, locationCapacities, fetchLogs } = useInventory();
    const { zones, getZone } = useWarehouseZones(); // Need zones to visualize or calculate score context

    // 2. Local State
    const [step, setStep] = useState(1); // 1: Select SKU/Source, 2: Destination, 3: Scan
    const [scanValue, setScanValue] = useState('');
    const [formData, setFormData] = useState({
        SKU: '',
        sourceItem: null,
        targetWarehouse: 'LUDLOW', // Default, should be dynamic or based on source selection
        targetLocation: '',
        quantity: 0
    });

    // 3. Data Loading: Velocity
    const [skuVelocity, setSkuVelocity] = useState(null);
    const [allVelocities, setAllVelocities] = useState([]);
    const [isLoadingVelocity, setIsLoadingVelocity] = useState(false);

    // Reset when opening
    useEffect(() => {
        if (isOpen) {
            setScanValue('');
            // Reset velocity state
            setSkuVelocity(null);

            if (initialSourceItem) {
                setFormData({
                    SKU: initialSourceItem.SKU,
                    sourceItem: initialSourceItem,
                    targetWarehouse: initialSourceItem.Warehouse,
                    targetLocation: '',
                    quantity: initialSourceItem.Quantity
                });
                setStep(1);
            } else {
                setStep(1);
                setFormData({
                    SKU: '',
                    sourceItem: null,
                    targetWarehouse: 'LUDLOW',
                    targetLocation: '',
                    quantity: 0
                });
            }
        }
    }, [isOpen, initialSourceItem]);

    // Async Effect: Fetch Logs & Calculate Velocity when SKU is selected (for optimization)
    useEffect(() => {
        if (formData.SKU && isOpen) {
            const loadVelocity = async () => {
                setIsLoadingVelocity(true);
                try {
                    // Fetch logs (ideally cached or optimized via Context)
                    // We assume fetchLogs returns raw array for now
                    const logs = await fetchLogs(); // Ensure this is exposed in context

                    if (logs && logs.length > 0) {
                        const v = calculateSkuVelocity(formData.SKU, logs);
                        setSkuVelocity(v);

                        // Also calculate all velocities for normalization (could be optimized significantly)
                        // For MVP: Just calculate for current items in view or use a simple heuristic max
                        // Here we take a sample to avoid blocking UI
                        const sampleVelocities = inventoryData
                            .slice(0, 50) // sample
                            .map(i => calculateSkuVelocity(i.SKU, logs))
                            .filter(val => val !== null);

                        setAllVelocities(sampleVelocities);
                    }
                } catch (e) {
                    console.error("Error loading velocity", e);
                } finally {
                    setIsLoadingVelocity(false);
                }
            };

            loadVelocity();
        }
    }, [formData.SKU, isOpen, fetchLogs, inventoryData]);


    // Suggestions for SKU
    const skuSuggestions = useMemo(() => {
        const uniqueSKUs = new Map();
        inventoryData.forEach(item => {
            if (item.SKU && !uniqueSKUs.has(item.SKU)) {
                uniqueSKUs.set(item.SKU, {
                    value: item.SKU,
                    info: `${item.Quantity || 0} units`
                });
            }
        });
        return Array.from(uniqueSKUs.values());
    }, [inventoryData]);

    // Find all instances of the selected SKU
    const sourceInstances = useMemo(() => {
        if (!formData.SKU) return [];
        const all = inventoryData.filter(i => i.SKU === formData.SKU && i.Quantity > 0);
        if (formData.sourceItem) {
            return all.filter(i => i.id === formData.sourceItem.id);
        }
        return all;
    }, [formData.SKU, formData.sourceItem, inventoryData]);

    // Smart Suggestion for target location (Existing location match)
    const suggestedTarget = useMemo(() => {
        if (!formData.SKU || !formData.targetWarehouse) return null;
        const targetInv = formData.targetWarehouse === 'ATS' ? atsData : ludlowData;

        // Is there an existing location with this SKU?
        const matching = targetInv.find(i => i.SKU === formData.SKU);
        return matching ? matching.Location : null;
    }, [formData.SKU, formData.targetWarehouse, ludlowData, atsData]);

    // --- NEW: INTELLIGENT LOCATION SUGGESTIONS ---
    // Calculates score based on: Velocity + Proximity + Consolidation
    const locationSuggestions = useMemo(() => {
        const targetInv = formData.targetWarehouse === 'ATS' ? atsData : ludlowData;
        const shippingArea = SLOTTING_CONFIG.SHIPPING_AREAS[formData.targetWarehouse];

        const locationMap = new Map();

        // 1. Gather all unique valid locations from inventory
        targetInv.forEach(item => {
            if (item.Location) {
                const key = `${item.Warehouse}-${item.Location}`;
                const capData = locationCapacities[key] || { current: 0, max: 550 };
                const zone = getZone(item.Warehouse, item.Location);

                if (!locationMap.has(item.Location)) {
                    // Calculate Hybrid Score
                    const score = calculateHybridLocationScore(
                        {
                            name: item.Location,
                            current: capData.current,
                            max: capData.max,
                            zone
                        },
                        skuVelocity, // Calculated async
                        shippingArea,
                        allVelocities
                    );

                    locationMap.set(item.Location, {
                        value: item.Location,
                        current: capData.current,
                        max: capData.max,
                        zone: zone, // e.g. 'HOT', 'COLD'
                        score: score, // 0-100
                        priorityLabel: score > 80 ? '🔥 BEST' : score > 50 ? '✅ GOOD' : '⚠️ FAIR'
                    });
                }
            }
        });

        // 2. Sort by Hybrid Score (Descending: High score is best)
        return Array.from(locationMap.values()).sort((a, b) => b.score - a.score);

    }, [formData.targetWarehouse, ludlowData, atsData, locationCapacities, skuVelocity, allVelocities, getZone]);

    if (!isOpen) return null;

    const handleSelectSource = (item) => {
        setFormData(prev => ({
            ...prev,
            sourceItem: item,
            quantity: item.Quantity,
            targetWarehouse: item.Warehouse // Default target to same warehouse 
        }));
    };

    const handleConfirmMove = () => {
        if (formData.targetLocation) setStep(3);
    };

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        if (scanValue.toUpperCase() !== formData.targetLocation.toUpperCase()) {
            alert(`Scan error: Mismatch! Expected ${formData.targetLocation}`);
            return;
        }
        onMove({
            ...formData,
            quantity: parseInt(formData.quantity)
        });
        onClose();
    };

    // Helper for zone colors
    const getZoneColor = (zone) => {
        if (zone === 'HOT') return 'text-red-500';
        if (zone === 'WARM') return 'text-orange-500';
        return 'text-blue-500';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl relative flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-tighter">
                            <ArrowRightLeft className="text-blue-500" />
                            Relocate Stock
                        </h2>
                        <div className="flex items-center gap-3">
                            <p className="text-neutral-500 text-xs uppercase font-bold tracking-widest mt-1">
                                {step === 3 ? "VERIFICATION" : `Step ${step}/3`}
                            </p>
                            {/* Velocity Badge */}
                            {skuVelocity !== null && (
                                <span className="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] uppercase font-black px-2 py-0.5 rounded flex items-center gap-1">
                                    <Zap size={10} />
                                    {skuVelocity.toFixed(1)} picks/day
                                </span>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    {step === 1 ? (
                        <div className="space-y-6">
                            <AutocompleteInput
                                label="SELECT SKU"
                                value={formData.SKU}
                                onChange={(val) => setFormData(prev => ({ ...prev, SKU: val, sourceItem: null }))}
                                suggestions={skuSuggestions}
                                placeholder="Search..."
                            />

                            {sourceInstances.length > 0 && (
                                <div className="space-y-3">
                                    <label className="block text-xs font-black text-neutral-500 uppercase tracking-widest">Select Source</label>
                                    <div className="space-y-2">
                                        {sourceInstances.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleSelectSource(item)}
                                                className={`w-full p-4 rounded-xl border transition-all text-left flex items-center justify-between ${formData.sourceItem?.id === item.id
                                                    ? 'bg-green-500/10 border-green-500'
                                                    : 'bg-neutral-800/50 border-neutral-700 hover:border-neutral-500'
                                                    }`}
                                            >
                                                <div>
                                                    <div className="text-white font-black">{item.Location}</div>
                                                    <div className="text-neutral-400 text-xs uppercase">{item.Warehouse}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-green-500 font-bold">{item.Quantity}</div>
                                                    <div className="text-neutral-500 text-[10px] uppercase">Available</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {formData.sourceItem && (
                                <div className="animate-in slide-in-from-top-4 duration-300">
                                    <label className="block text-xs font-black text-neutral-500 uppercase tracking-widest mb-3 text-center">Quantity to Move</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            value={formData.quantity}
                                            onChange={(e) => setFormData(prev => ({ ...prev, quantity: Math.min(prev.sourceItem.Quantity, parseInt(e.target.value) || 0) }))}
                                            className="flex-1 bg-neutral-950 border-2 border-neutral-800 rounded-2xl py-4 text-center text-3xl font-black text-green-500 focus:border-green-500 outline-none"
                                            max={formData.sourceItem.Quantity}
                                            min={1}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : step === 2 ? (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-xs font-black text-neutral-500 uppercase tracking-widest mb-3">Target Warehouse</label>
                                <div className="flex gap-2">
                                    {['LUDLOW', 'ATS'].map((wh) => (
                                        <button
                                            key={wh}
                                            onClick={() => setFormData(prev => ({ ...prev, targetWarehouse: wh, targetLocation: '' }))}
                                            className={`flex-1 py-3 rounded-xl font-black text-xs transition-all border ${formData.targetWarehouse === wh
                                                ? 'bg-green-500 text-black border-green-500 shadow-lg shadow-green-500/20'
                                                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                                                }`}
                                        >
                                            {wh}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Smart Suggestion - Enhanced with Score info */}
                            {suggestedTarget && (
                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <TrendingUp className="text-blue-400" size={16} />
                                        <span className="text-blue-400 text-xs font-black uppercase tracking-wider">Merge Opportunity</span>
                                    </div>
                                    <p className="text-neutral-300 text-sm mb-3">
                                        SKU already exists in <span className="font-bold text-white">{suggestedTarget}</span>.
                                    </p>
                                    <button
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, targetLocation: suggestedTarget }));
                                            setStep(3);
                                        }}
                                        className="w-full py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-lg font-black text-xs uppercase"
                                    >
                                        Merge into {suggestedTarget}
                                    </button>
                                </div>
                            )}

                            <AutocompleteInput
                                label="TARGET LOCATION (Smart Ranked)"
                                value={formData.targetLocation}
                                onChange={(val) => setFormData(prev => ({ ...prev, targetLocation: val }))}
                                suggestions={locationSuggestions}
                                placeholder="A1, Row 5..."
                                renderItem={(suggestion) => (
                                    <div className="py-2">
                                        <div className="flex justify-between items-center mb-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="font-black text-white">{suggestion.value}</span>
                                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white/5 ${getZoneColor(suggestion.zone)}`}>
                                                    {suggestion.zone}
                                                </span>
                                            </div>
                                            <span className={`text-[9px] font-bold uppercase ${suggestion.score > 80 ? 'text-green-400' : 'text-neutral-500'
                                                }`}>
                                                {suggestion.priorityLabel} ({Math.round(suggestion.score)})
                                            </span>
                                        </div>
                                        <CapacityBar current={suggestion.current} max={suggestion.max} showText={false} />
                                    </div>
                                )}
                            />
                        </div>
                    ) : (
                        <div className="space-y-6 text-center py-4">
                            <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-dashed border-blue-500/ animate-pulse">
                                <Scan className="text-blue-500" size={32} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-white uppercase tracking-tighter">Scan to Verify</h3>
                                <p className="text-neutral-500 text-sm mt-2">
                                    Target: <span className="text-white font-bold">{formData.targetLocation}</span>
                                </p>
                            </div>
                            <input
                                autoFocus
                                type="text"
                                value={scanValue}
                                onChange={(e) => setScanValue(e.target.value)}
                                placeholder="Scan location barcode..."
                                className="w-full bg-neutral-950 border-2 border-neutral-800 rounded-xl py-4 text-center text-xl font-mono text-white focus:border-blue-500 outline-none uppercase"
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                            />
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-neutral-800 bg-neutral-900/50 rounded-b-xl">
                    {step === 1 ? (
                        <button
                            disabled={!formData.sourceItem || formData.quantity <= 0}
                            onClick={() => setStep(2)}
                            className="w-full py-4 bg-white hover:bg-neutral-200 disabled:opacity-20 text-black font-black uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2"
                        >
                            Next <Move size={20} />
                        </button>
                    ) : step === 2 ? (
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setStep(1)} className="py-4 bg-neutral-800 text-white font-black uppercase rounded-2xl">Back</button>
                            <button
                                disabled={!formData.targetLocation}
                                onClick={handleConfirmMove}
                                className="py-4 bg-blue-500 text-white font-black uppercase rounded-2xl"
                            >
                                Confirm
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => setStep(2)} className="py-4 bg-neutral-800 text-white font-black uppercase rounded-2xl">Back</button>
                            <button
                                disabled={!scanValue}
                                onClick={handleSubmit}
                                className="py-4 bg-green-500 disabled:opacity-50 text-black font-black uppercase rounded-2xl"
                            >
                                Finalize
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
