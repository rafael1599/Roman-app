import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { PickingSessionView } from './PickingSessionView';

export const PickingCartDrawer = ({ cartItems, onUpdateQty, onRemoveItem, onSetQty, onDeduct }) => {
    const [isOpen, setIsOpen] = useState(false);

    const totalItems = cartItems.length;
    const totalQty = cartItems.reduce((acc, item) => acc + (item.pickingQty || 0), 0);

    // Reset when cart becomes empty
    useEffect(() => {
        if (totalItems === 0) {
            setIsOpen(false);
        }
    }, [totalItems]);

    if (totalItems === 0) return null;

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
                    onClick={() => setIsOpen(false)}
                />
            )}
            <div className={`fixed left-0 right-0 z-[60] transition-all duration-300 ease-in-out ${isOpen ? 'bottom-0' : 'bottom-20'
                }`}>
                {/* Collapsed State - Mini Bar */}
                {!isOpen && (
                    <div
                        onClick={() => setIsOpen(true)}
                        className="mx-4 bg-accent text-main p-3 rounded-t-2xl shadow-2xl flex items-center justify-center gap-2 cursor-pointer active:opacity-90 transition-colors"
                    >
                        <ChevronUp size={20} />
                        <div className="font-bold uppercase tracking-tight text-sm">
                            {totalQty} Units to Pick
                        </div>
                    </div>
                )}

                {/* Expanded Content - Direct Pallet View */}
                {isOpen && (
                    <div className="bg-card border-t border-subtle h-[80vh] flex flex-col shadow-2xl rounded-t-2xl overflow-hidden">
                        <PickingSessionView
                            cartItems={cartItems}
                            onDeduct={onDeduct}
                            onUpdateQty={onUpdateQty}
                            onRemoveItem={onRemoveItem}
                            onClose={() => setIsOpen(false)}
                        />
                    </div>
                )}
            </div>
        </>
    );
};
