import React from 'react';
import { Search, Scan } from 'lucide-react';

export const SearchInput = ({ value, onChange, placeholder = "Search SKU or Location...", mode = 'stock', onScanClick }) => {
    return (
        <div className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md p-4 border-b border-neutral-800">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-neutral-900 border border-neutral-800 text-gray-100 rounded-lg pl-10 pr-12 py-3 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors placeholder-neutral-600 text-lg"
                />

                {mode === 'picking' && (
                    <button
                        onClick={onScanClick}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-neutral-800 text-green-400 rounded-md hover:bg-neutral-700 transition-colors"
                    >
                        <Scan size={20} />
                    </button>
                )}
            </div>
        </div>
    );
};
