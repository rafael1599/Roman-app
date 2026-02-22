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
                    ? 'bg-white text-black shadow-[0_20px_40px_rgba(255,255,255,0.1)] scale-105 z-10'
                    : 'bg-white/5 hover:bg-white/10 text-zinc-400 border border-white/10 active:scale-95'
                }
            `}
        >
            <span className={`
                text-[9px] uppercase tracking-[0.2em] leading-none mb-1 font-black
                ${isSelected ? 'opacity-40 text-black' : 'text-emerald-500 opacity-100'}
            `}>
                {isSelected ? 'SELECTED' : displayStatus}
            </span>
            <span className={`font-mono text-2xl font-black tracking-tighter ${isSelected ? '' : 'text-white/90'}`}>
                {orderNumber}
            </span>

            {/* Subtle glow for selected */}
            {isSelected && (
                <div className="absolute inset-x-0 bottom-0 h-1.5 bg-emerald-500 animate-soft-in"></div>
            )}
        </button>
    );
};
