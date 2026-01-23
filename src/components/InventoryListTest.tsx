import { useInventoryList } from '../hooks/useInventory';
import { Loader2, Package, MapPin } from 'lucide-react';

/**
 * Proof of Concept component to verify the data flow:
 * Supabase -> Service -> react-query Hook -> UI -> IndexedDB
 */
export function InventoryListTest() {
    const { data: items, isLoading, isError, error, isFetching } = useInventoryList({ limit: 10 });

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-main/50 rounded-xl border border-white/10">
                <Loader2 className="animate-spin text-accent w-8 h-8 mb-4" />
                <p className="text-white/60 font-medium italic">Hydrating cache from Supabase...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                <p className="font-bold mb-2">Sync Error</p>
                <p className="text-sm opacity-80">{(error as Error).message}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Package className="w-5 h-5 text-accent" />
                    Inventory Test Mode
                    {isFetching && <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full animate-pulse">Syncing...</span>}
                </h3>
                <p className="text-xs text-white/40">Showing top 10 items</p>
            </div>

            <div className="grid gap-3">
                {items?.map((item) => (
                    <div
                        key={item.id}
                        className="group p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all duration-300 hover:translate-x-1"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-mono text-accent font-bold mb-1">{item.SKU}</p>
                                <div className="flex items-center gap-4 text-xs text-white/60">
                                    <span className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {item.Location || 'No Loc'}
                                    </span>
                                    <span>Qty: <span className="text-white font-medium">{item.Quantity}</span></span>
                                </div>
                            </div>
                            <div className="text-[10px] px-2 py-1 bg-white/5 rounded uppercase tracking-wider text-white/30">
                                {item.Warehouse}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {!items?.length && (
                <p className="text-center text-white/40 py-8 italic border border-dashed border-white/10 rounded-xl">
                    No inventory found in the specified range.
                </p>
            )}
        </div>
    );
}
