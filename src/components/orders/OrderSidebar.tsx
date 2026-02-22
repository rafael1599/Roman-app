import React from 'react';
import MapPin from 'lucide-react/dist/esm/icons/map-pin';
import Hash from 'lucide-react/dist/esm/icons/hash';
import HandMetal from 'lucide-react/dist/esm/icons/hand-metal';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';

interface OrderSidebarProps {
    formData: any;
    setFormData: (data: any) => void;
    selectedOrder: any;
    user: any;
    takeOverOrder: (id: string) => Promise<void>;
    onRefresh: () => void;
    onShowPickingSummary?: () => void;
}

export const OrderSidebar: React.FC<OrderSidebarProps> = ({
    formData,
    setFormData,
    selectedOrder,
    user,
    takeOverOrder,
    onRefresh,
    onShowPickingSummary
}) => {
    if (!selectedOrder) return null;

    return (
        <aside className="w-full md:w-[360px] md:h-full border-r border-subtle flex flex-col p-6 md:p-8 shrink-0 md:overflow-y-auto bg-card backdrop-blur-3xl z-40 no-scrollbar rounded-3xl md:rounded-none mb-8 md:mb-0 relative overflow-hidden">
            {/* Soft Ambient Glow inside sidebar */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/5 blur-[80px] pointer-events-none" />

            <div className="flex items-center gap-3 mb-8">
                <button
                    onClick={() => window.history.back()}
                    className="w-12 h-12 flex items-center justify-center bg-surface hover:bg-main border border-subtle rounded-2xl text-muted transition-all active:scale-95 shadow-sm"
                    title="Back"
                >
                    <ChevronLeft size={20} />
                </button>
                <button
                    onClick={onShowPickingSummary}
                    className="flex-1 flex items-center justify-center gap-2 h-12 bg-[rgb(245,158,11)]/10 hover:bg-[rgb(245,158,11)]/20 border border-[rgb(245,158,11)]/30 rounded-2xl text-[10px] font-black uppercase tracking-widest text-[rgb(245,158,11)] transition-all active:scale-95 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                >
                    <span>Picking Summary</span>
                </button>
            </div>



            {selectedOrder.user_id !== user?.id && ['active', 'ready_to_double_check', 'double_checking'].includes(selectedOrder.status) && (
                <div className="p-5 bg-amber-500/10 border border-amber-500/20 rounded-squircle mb-6 space-y-3">
                    <div className="flex items-center gap-2 text-amber-600">
                        <HandMetal size={16} />
                        <p className="text-xs font-black uppercase tracking-tight">Owned by {selectedOrder.user?.full_name || 'Another User'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={async () => {
                            await takeOverOrder(selectedOrder.id);
                            onRefresh();
                        }}
                        className="w-full py-3 bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-sm active:scale-95 transition-all"
                    >
                        Take Over Order
                    </button>
                </div>
            )}

            <form className="flex flex-col gap-5" onSubmit={(e) => e.preventDefault()}>
                <div className="space-y-2 group">
                    <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] transition-colors group-focus-within:text-accent-primary">
                        Customer Name
                    </label>
                    <input
                        type="text"
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        placeholder="Customer name..."
                        className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium focus:border-accent focus:bg-surface shadow-sm"
                    />
                </div>

                <div className="space-y-2 group">
                    <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] flex items-center gap-1 group-focus-within:text-accent">
                        <MapPin size={10} /> Shipping Address
                    </label>
                    <input
                        type="text"
                        value={formData.street}
                        onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                        placeholder="Street address..."
                        className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium focus:border-accent focus:bg-surface shadow-sm"
                    />
                </div>

                <div className="space-y-2 group">
                    <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] group-focus-within:text-accent">
                        City
                    </label>
                    <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="City..."
                        className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium focus:border-accent focus:bg-surface shadow-sm"
                    />
                </div>

                <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2 group">
                        <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] group-focus-within:text-accent">
                            State
                        </label>
                        <input
                            type="text"
                            maxLength={2}
                            value={formData.state}
                            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                            placeholder="CA"
                            className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium text-center focus:border-accent focus:bg-surface shadow-sm"
                        />
                    </div>
                    <div className="space-y-2 group">
                        <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] group-focus-within:text-accent">
                            Zip Code
                        </label>
                        <input
                            type="text"
                            value={formData.zip}
                            onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                            placeholder="00000"
                            className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium focus:border-accent focus:bg-surface shadow-sm"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mt-4">
                    <div className="flex flex-col gap-2 group">
                        <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] text-center group-focus-within:text-accent">
                            Pallets
                        </label>
                        <input
                            type="number"
                            min="1"
                            value={formData.pallets}
                            onChange={(e) => setFormData({ ...formData, pallets: e.target.value })}
                            className="w-full bg-main border border-subtle rounded-3xl py-5 text-center font-heading text-3xl font-bold text-[#22c55e] ios-transition focus:border-[#22c55e] shadow-sm focus:bg-surface"
                        />
                    </div>
                    <div className="flex flex-col gap-2 group">
                        <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] text-center group-focus-within:text-accent">
                            Total Units
                        </label>
                        <input
                            type="number"
                            min="0"
                            value={formData.units}
                            onChange={(e) => setFormData({ ...formData, units: e.target.value })}
                            className="w-full bg-main border border-subtle rounded-3xl py-5 text-center font-heading text-3xl font-bold text-content ios-transition focus:border-accent shadow-sm focus:bg-surface"
                        />
                    </div>
                </div>

                <div className="space-y-2 group mt-2">
                    <label className="text-xs uppercase text-text-muted font-black tracking-[0.2em] flex items-center gap-1 group-focus-within:text-accent">
                        <Hash size={10} /> Load Number
                    </label>
                    <input
                        type="text"
                        placeholder="E.G. 127035968"
                        value={formData.loadNumber}
                        onChange={(e) => setFormData({ ...formData, loadNumber: e.target.value.toUpperCase() })}
                        className="w-full bg-main border border-subtle rounded-3xl px-5 py-4 text-lg text-content ios-transition font-medium focus:border-accent focus:bg-surface shadow-sm"
                    />
                </div>
            </form>
        </aside>
    );
};
