import React, { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { createPortal } from 'react-dom';
import X from 'lucide-react/dist/esm/icons/x';
import Save from 'lucide-react/dist/esm/icons/save';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';

import { useInventory } from '../../../hooks/useInventoryData';
import { useLocationManagement } from '../../../hooks/useLocationManagement';
import { useConfirmation } from '../../../context/ConfirmationContext';
import { useViewMode } from '../../../context/ViewModeContext';
import { useAutoSelect } from '../../../hooks/useAutoSelect';

import AutocompleteInput from '../../../components/ui/AutocompleteInput.tsx';
import { InventoryItemWithMetadata, InventoryItemInput, InventoryItemInputSchema } from '../../../schemas/inventory.schema';
import { predictLocation } from '../../../utils/locationPredictor';
import { inventoryService } from '../../../services/inventory.service';

interface InventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: InventoryItemInput & { length_ft?: number; width_in?: number }) => void;
    onDelete?: () => void;
    initialData?: InventoryItemWithMetadata | null;
    mode?: 'add' | 'edit';
    screenType?: string;
}

const extendedSchema = InventoryItemInputSchema.extend({
    length_ft: z.coerce.number().optional().nullable(),
    width_in: z.coerce.number().optional().nullable(),
});

interface InventoryFormValues {
    sku: string;
    location: string;
    quantity: number;
    sku_note: string | null;
    warehouse: 'LUDLOW' | 'ATS' | 'DELETED ITEMS';
    length_ft?: number | null;
    width_in?: number | null;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onDelete,
    initialData,
    mode = 'add',
    screenType,
}) => {
    const { ludlowData, atsData, isAdmin, updateSKUMetadata } = useInventory();
    const { locations } = useLocationManagement();
    const { setIsNavHidden } = useViewMode();
    const { showConfirmation } = useConfirmation();
    const autoSelect = useAutoSelect();

    // const [confirmCreateNew, setConfirmCreateNew] = useState(false); // REMOVED: Ghost Location simplification


    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors, isValid }
    } = useForm<InventoryFormValues>({
        resolver: zodResolver(extendedSchema) as any,
        mode: 'onChange',
        defaultValues: {
            sku: '',
            location: '',
            quantity: 0,
            sku_note: '',
            warehouse: 'LUDLOW',
            length_ft: 5,
            width_in: 6,
        }
    });

    const formData = watch();

    // 2. Sync Initial Data
    useEffect(() => {
        if (isOpen) {
            setIsNavHidden?.(true);
            // setConfirmCreateNew(false); // REMOVED


            if (mode === 'edit' && initialData) {
                reset({
                    sku: initialData.sku || '',
                    location: initialData.location || '',
                    quantity: Number(initialData.quantity) || 0,
                    sku_note: initialData.sku_note || '',
                    warehouse: initialData.warehouse || (screenType as any) || 'LUDLOW',
                    length_ft: initialData.sku_metadata?.length_ft ?? 5,
                    width_in: initialData.sku_metadata?.width_in ?? 6,
                });
            } else {
                reset({
                    sku: '',
                    location: '',
                    quantity: 0,
                    sku_note: '',
                    warehouse: (screenType as any) || 'LUDLOW',
                    length_ft: 5,
                    width_in: 6,
                });
            }
        } else {
            setIsNavHidden?.(false);
        }
        return () => setIsNavHidden?.(false);
    }, [isOpen, initialData, mode, screenType, reset, setIsNavHidden]);

    // 3. Location Predictions & Suggestions
    const validLocationNames = useMemo(() => {
        if (!locations) return [];
        return Array.from(new Set(locations
            .filter((l) => l.warehouse === formData.warehouse)
            .map((l) => l.location)));
    }, [locations, formData.warehouse]);

    const prediction = useMemo(
        () => predictLocation(formData.location || '', validLocationNames),
        [formData.location, validLocationNames]
    );

    // const isNewLocation = useMemo(() => {
    //     if (!formData.location) return false;
    //     return !prediction.exactMatch;
    // }, [formData.location, prediction]);


    // useEffect(() => {
    //     setConfirmCreateNew(false);
    // }, [formData.location]);


    const currentInventory = formData.warehouse === 'ATS' ? atsData : ludlowData;

    const skuSuggestions = useMemo(() => {
        const uniqueSKUs = new Map<string, { value: string; info: string }>();
        currentInventory.forEach((item) => {
            if (item.sku && !uniqueSKUs.has(item.sku)) {
                uniqueSKUs.set(item.sku, {
                    value: item.sku,
                    info: `${item.quantity}u • ${item.location}`,
                });
            }
        });
        return Array.from(uniqueSKUs.values());
    }, [currentInventory]);

    const locationSuggestions = useMemo(() => {
        if (formData.location && prediction.matches.length > 0) {
            return Array.from(new Set(prediction.matches)).map(l => ({ value: l, info: 'DB Location' }));
        }
        const counts = new Map<string, number>();
        currentInventory.forEach(i => i.location && counts.set(i.location, (counts.get(i.location) || 0) + 1));
        return Array.from(counts.entries()).map(([loc, count]) => ({
            value: loc,
            info: `${count} items here`
        }));
    }, [currentInventory, formData.location, prediction.matches]);

    // 4. Real-time Validation & Presence Tracking
    const [validationState, setValidationState] = useState<{
        status: 'idle' | 'checking' | 'error' | 'warning' | 'info';
        message?: string;
    }>({ status: 'idle' });

    const [foundLocations, setFoundLocations] = useState<string[]>([]);

    // Constants for Validation Rules
    const MIN_SKU_CHARS = 7;

    const isSkuChanged = useMemo(() => {
        if (mode !== 'edit' || !initialData) return false;
        return formData.sku.trim() !== (initialData.sku || '').trim();
    }, [formData.sku, initialData, mode]);

    // Use a custom debounce hook or simple timeout for now
    useEffect(() => {
        // LEVEL 1: DIRTY CHECK (Has anything changed?)
        const normalize = (str: any) => (String(str || '')).trim();

        const currentSKU = normalize(formData.sku);
        const originalSKU = normalize(initialData?.sku);

        const currentLocation = normalize(formData.location);
        const originalLocation = normalize(initialData?.location);

        const currentWh = normalize(formData.warehouse);
        const originalWh = normalize((screenType as any) || 'LUDLOW');


        const skuChanged = currentSKU !== originalSKU;
        const locationChanged = currentLocation !== originalLocation;
        const warehouseChanged = currentWh !== originalWh;
        const hasAnyChange = skuChanged || locationChanged || warehouseChanged;

        // TIER 1: INSTANT LOCAL PRESENCE (Independent of everything)
        if (currentSKU.length >= 2) {
            const existingEntries = currentInventory.filter(i => normalize(i.sku) === currentSKU);
            const locs = Array.from(new Set(existingEntries.map(i => i.location || 'Unknown'))).filter(Boolean);
            setFoundLocations(locs);
        } else {
            setFoundLocations([]);
        }

        // TIER 2: COORDINATED SERVER VALIDATION (Debounced)
        if (mode === 'edit' && !hasAnyChange) {
            setValidationState({ status: 'idle' });
            return;
        }

        // TIER 2.1: GLOBAL RENAME CONFLICT (Instant Check)
        if (mode === 'edit' && isSkuChanged && currentSKU.length >= MIN_SKU_CHARS) {
            const globalConflict = currentInventory.find(i =>
                normalize(i.sku) === currentSKU &&
                String(i.id) !== String(initialData?.id)
            );
            if (globalConflict) {
                setValidationState({
                    status: 'error',
                    message: `⛔ SKU already exists in this warehouse (${globalConflict.location}). Cannot rename.`
                });
                return;
            }
        }

        // Length guard for server validation
        if (mode === 'add' || skuChanged) {
            if (currentSKU.length < MIN_SKU_CHARS) {
                setValidationState({ status: 'idle' });
                return;
            }
        }

        const timer = setTimeout(async () => {
            // Guard: Must have coordinates (SKU + Location + Warehouse)
            if (!currentSKU || !currentLocation || !currentWh) {
                // If we match SKU but location is still empty, we still want to show identity info in edit mode
                if (mode === 'edit' && isSkuChanged) {
                    setValidationState({
                        status: 'info',
                        message: 'ℹ️ Renaming: History will be transferred to the new SKU.'
                    });
                } else {
                    setValidationState({ status: 'idle' });
                }
                return;
            }

            // LEVEL 3: EXECUTION (API Call)
            setValidationState({ status: 'checking' });

            try {
                const excludeId = initialData?.id;

                const exists = await inventoryService.checkExistence(
                    currentSKU,
                    currentLocation,
                    currentWh,
                    excludeId
                );

                if (exists) {
                    if (mode === 'add') {
                        setValidationState({
                            status: 'warning',
                            message: '⚠️ Item already exists here. Quantity will be added and Description updated.'
                        });
                    } else if (mode === 'edit') {
                        if (isSkuChanged) {
                            setValidationState({
                                status: 'error',
                                message: '⛔ SKU already exists. Cannot rename.'
                            });
                        } else {
                            setValidationState({
                                status: 'warning',
                                message: 'ℹ️ Item exists in target location. Stock will be consolidated.'
                            });
                        }
                    }
                } else {
                    if (mode === 'edit' && isSkuChanged) {
                        setValidationState({
                            status: 'info',
                            message: 'ℹ️ Renaming: History will be transferred to the new SKU.'
                        });
                    } else {
                        setValidationState({ status: 'idle' });
                    }
                }
            } catch (err) {
                console.error('Validation check failed', err);
                setValidationState({ status: 'idle' });
            }
        }, 800);

        return () => clearTimeout(timer);
    }, [formData.sku, formData.location, formData.warehouse, mode, initialData, screenType, currentInventory, isSkuChanged]);

    // 4. Handlers
    const handleLocationBlur = (val: string) => {
        if (prediction.bestGuess && prediction.bestGuess !== val) {
            setValue('location', prediction.bestGuess);
            toast(`Auto-selected ${prediction.bestGuess}`, { icon: '✨' });
        }
    };

    const onFormSubmit = (data: any) => {
        // if (isNewLocation && !confirmCreateNew) {
        //     toast.error('Please confirm creating the new location.');
        //     return;
        // }


        // Rename Confirmation
        if (mode === 'edit' && initialData && data.sku !== initialData.sku) {
            showConfirmation(
                'Identity Change (SKU)',
                `Rename "${initialData.sku}" to "${data.sku}"?\nThis will update or merge the product row.`,
                () => executeSave(data),
                undefined,
                'Rename',
                'Cancel'
            );
            return;
        }

        executeSave(data);
    };

    const executeSave = (data: any) => {
        if (isAdmin) {
            updateSKUMetadata({
                sku: data.sku,
                length_ft: data.length_ft,
                width_in: data.width_in,
            }).catch(e => console.error('Metadata fail:', e));
        }
        onSave(data);
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-surface border border-subtle rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-subtle bg-main/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-content uppercase tracking-tight">
                            {mode === 'edit' ? 'Edit Item' : 'Add New Item'}
                        </h2>
                        {initialData?.sku && mode === 'edit' && (
                            <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">
                                Original: <span className="text-accent">{initialData.sku}</span>
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 -mr-2 text-muted hover:text-content transition-colors z-10">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto">
                    <form onSubmit={handleSubmit(onFormSubmit)} className="p-6 space-y-6">
                        {/* Warehouse Selection */}
                        <div>
                            <label className="block text-[10px] font-black text-accent mb-3 uppercase tracking-widest">Select Warehouse</label>
                            <div className="flex gap-2">
                                {['LUDLOW', 'ATS'].map((wh) => (
                                    <button
                                        key={wh}
                                        type="button"
                                        onClick={() => setValue('warehouse', wh as any)}
                                        className={`px-4 py-2 rounded-lg font-bold text-xs transition-all border ${formData.warehouse === wh
                                            ? 'bg-accent text-main border-accent shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)]'
                                            : 'bg-surface text-muted border-subtle hover:border-muted'
                                            }`}
                                    >
                                        {wh}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <AutocompleteInput
                            id="inventory_sku"
                            label="SKU"
                            value={formData.sku}
                            onChange={(v: string) => setValue('sku', v, { shouldValidate: true })}
                            suggestions={skuSuggestions}
                            placeholder="Enter SKU..."
                            minChars={2}
                            initialKeyboardMode="numeric"
                            onSelect={(s: any) => {
                                const match = currentInventory.find(i => i.sku === s.value);
                                if (match && mode === 'add') {
                                    setValue('location', match.location || '', { shouldValidate: true });
                                    setValue('sku_note', match.sku_note || '', { shouldValidate: true });
                                }
                            }}
                        />

                        {/* SKU Presence Info (Independent of Location) - Only on Add Mode */}
                        {mode === 'add' && foundLocations.length > 0 && (
                            <div className="mt-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                                <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-blue-400" />
                                <span>
                                    SKU detected in this warehouse at: <strong className="text-blue-200">{foundLocations.join(', ')}</strong>
                                </span>
                            </div>
                        )}

                        {/* Real-time Validation Feedback */}
                        {validationState.status !== 'idle' && (
                            <div className={`mt-2 flex items-start gap-2 p-3 rounded-xl text-[10px] font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-1 ${validationState.status === 'error' ? 'bg-red-500/10 border border-red-500/20 text-red-500' :
                                validationState.status === 'warning' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' :
                                    'bg-blue-500/10 border border-blue-500/20 text-blue-400'
                                }`}>
                                {validationState.status === 'checking' ? (
                                    <>
                                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mt-0.5" />
                                        Checking availability...
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                        <span className="leading-relaxed">
                                            {validationState.message}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <AutocompleteInput
                                id="inventory_location"
                                label="Location"
                                value={formData.location || ''}
                                onChange={(v: string) => setValue('location', v, { shouldValidate: true })}
                                onBlur={handleLocationBlur}
                                suggestions={locationSuggestions}
                                placeholder="Row/Bin..."
                                minChars={1}
                                initialKeyboardMode="numeric"
                            />

                        </div>


                        <AutocompleteInput
                            id="sku_note"
                            label="Internal Note"
                            value={formData.sku_note || ''}
                            onChange={(v: string) => setValue('sku_note', v, { shouldValidate: true })}
                            suggestions={[]}
                            placeholder="e.g. T, ø, P..."
                        />

                        <div>
                            <label htmlFor="inventory_quantity" className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Quantity</label>
                            <input
                                id="inventory_quantity"
                                type="number"
                                {...register('quantity', { valueAsNumber: true })}
                                {...autoSelect}
                                className="w-full bg-main border border-subtle rounded-xl px-4 py-4 text-content focus:border-accent focus:outline-none transition-colors font-mono text-center text-2xl font-black"
                                required
                            />
                        </div>

                        {isAdmin && (
                            <div className="grid grid-cols-2 gap-4 p-4 bg-accent/5 rounded-2xl border border-accent/10">
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Length (ft)</label>
                                    <input type="number" {...register('length_ft', { valueAsNumber: true })} {...autoSelect} step="0.1" className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none font-mono" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-accent mb-2 uppercase tracking-widest">Width (in)</label>
                                    <input type="number" {...register('width_in', { valueAsNumber: true })} {...autoSelect} step="0.1" className="w-full bg-main border border-subtle rounded-lg px-4 py-2 text-content focus:border-accent focus:outline-none font-mono" />
                                </div>
                            </div>
                        )}

                        {/* Validation Error Display */}
                        {errors.sku && <p className="text-red-500 text-[10px] font-bold uppercase">{String(errors.sku.message)}</p>}
                        {errors.quantity && <p className="text-red-500 text-[10px] font-bold uppercase">{String(errors.quantity.message)}</p>}
                        {errors.location && <p className="text-red-500 text-[10px] font-bold uppercase">{String(errors.location.message)}</p>}
                    </form>
                </div>

                <div className="p-6 border-t border-subtle bg-main/50 flex gap-3">
                    {mode === 'edit' && onDelete && (
                        <button
                            type="button"
                            onClick={() => {
                                showConfirmation('Delete Item', 'Are you sure you want to delete this item?', () => {
                                    onDelete();
                                    onClose();
                                });
                            }}
                            className="w-14 h-14 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0"
                        >
                            <Trash2 className="w-6 h-6" />
                        </button>
                    )}
                    <button
                        disabled={!isValid || !formData.sku?.trim() || !formData.location?.trim() || validationState.status === 'error' || validationState.status === 'checking'}
                        onClick={handleSubmit(onFormSubmit)}
                        className={`flex-1 font-black uppercase tracking-widest h-14 rounded-2xl flex items-center justify-center gap-2 transition-transform shadow-lg shadow-accent/20 ${(!isValid || !formData.sku?.trim() || !formData.location?.trim() || validationState.status === 'error' || validationState.status === 'checking')
                            ? 'bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed opacity-50'
                            : 'bg-accent hover:opacity-90 text-main active:scale-95'
                            }`}

                    >
                        <Save className="w-5 h-5" />
                        {mode === 'edit' ? 'Update' : 'Save'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
