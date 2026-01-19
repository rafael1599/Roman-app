import React from 'react';
import { Search, Scan } from 'lucide-react';

export const SearchInput = ({ value, onChange, placeholder = "Search SKU or Location...", mode = 'stock', onScanClick }) => {
    return (
        <div className="sticky top-0 z-40 bg-main/80 backdrop-blur-md p-4 border-b border-subtle">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="w-full bg-surface border border-subtle text-content rounded-lg pl-10 pr-12 py-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors placeholder:text-muted/50 text-lg"
                />

                {mode === 'picking' && (
                    <button
                        onClick={onScanClick}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-card text-accent rounded-md hover:opacity-80 transition-colors"
                    >
                        <Scan size={20} />
                    </button>
                )}
            </div>
        </div>
    );
};
