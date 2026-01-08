import React from 'react';
import { calculateCapacityRatio } from '../../utils/capacityUtils';

/**
 * CapacityBar: A pure UI component that communicates the fill state of a location.
 * 
 * Props:
 * - current: number (current units in location)
 * - max: number (total capacity)
 * - showText: boolean (whether to show numerical info)
 */
export const CapacityBar = ({ current = 0, max = 550, showText = true }) => {
    const ratio = calculateCapacityRatio(current, max);
    const percentage = Math.min(ratio * 100, 100);

    return (
        <div className="w-full">
            {showText && (
                <div className="flex justify-start mb-1">
                    <span className="text-[10px] font-black text-neutral-400 tabular-nums">
                        {current} / {max}
                    </span>
                </div>
            )}

            <div className="h-2 w-full bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50">
                <div
                    className="h-full transition-all duration-500 ease-out"
                    style={{
                        width: `${percentage}%`,
                        background: 'linear-gradient(to right, #3b82f6, #06b6d4, #10b981)',
                        backgroundSize: `${100 / Math.max(ratio, 0.01)}% 100%`
                    }}
                />
            </div>
        </div>
    );
};
