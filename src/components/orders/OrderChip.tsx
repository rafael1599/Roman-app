import React from 'react';

interface OrderChipProps {
    orderNumber: string;
    status: string;
    isSelected: boolean;
    onClick: () => void;
}

export const OrderChip: React.FC<OrderChipProps> = ({ orderNumber, status, isSelected, onClick }) => {
    const displayStatus = status === 'ready_to_double_check' ? 'READY' :
        status === 'active' ? 'PICKING' :
            status.toUpperCase();

    return (
        <button
            onClick={onClick}
            className={`
                min-w-[140px] h-20 rounded-[2rem] font-bold ios-transition shrink-0 flex flex-col justify-center items-center relative overflow-hidden group
                ${isSelected
                    ? 'bg-main text-main shadow-[0_20px_40px_rgba(0,0,0,0.05)] scale-105 z-10 border border-accent-primary/20'
                    : 'bg-surface hover:bg-main text-muted border border-subtle active:scale-95'
                }
            `}
        >
            <span className={`
                text-[9px] uppercase tracking-[0.2em] leading-none mb-1 font-black
                ${isSelected ? 'opacity-40 text-main' : 'text-emerald-500 opacity-100'}
            `}>
                {isSelected ? 'SELECTED' : displayStatus}
            </span>
            <span className={`font-mono text-2xl font-black tracking-tighter ${isSelected ? 'text-main' : 'text-main/80'}`}>
                {orderNumber}
            </span>

            {/* Subtle glow for selected */}
            {isSelected && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-emerald-500 animate-soft-in"></div>
            )}
        </button>
    );
};
