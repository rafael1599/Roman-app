import React from 'react';
import { Search } from 'lucide-react';

export const SearchInput = ({ value, onChange, placeholder = "Search SKU or Location..." }) => {
    return (
        <div className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur-md p-4 border-b border-neutral-800">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-neutral-900 border border-neutral-800 text-gray-100 rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400 transition-colors placeholder-neutral-600 text-lg"
                />
            </div>
        </div>
    );
};
