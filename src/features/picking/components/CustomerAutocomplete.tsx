import { useState, useEffect, useRef } from 'react';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import Search from 'lucide-react/dist/esm/icons/search';
import X from 'lucide-react/dist/esm/icons/x';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import Plus from 'lucide-react/dist/esm/icons/plus';
import { useCustomerSearch } from '../../../hooks/useCustomerSearch';
import type { Customer } from '../../../types/schema';

interface CustomerAutocompleteProps {
    value: Customer | null;
    onChange: (customer: Customer | null) => void;
    placeholder?: string;
    className?: string;
}

export const CustomerAutocomplete = ({
    value,
    onChange,
    placeholder = "Search or enter customer name",
    className = ""
}: CustomerAutocompleteProps) => {
    const [query, setQuery] = useState(value?.name || '');
    const [isOpen, setIsOpen] = useState(false);
    const { customers, isLoading } = useCustomerSearch(query);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync query when value changes (e.g. session reset)
    useEffect(() => {
        setQuery(value?.name || '');
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (customer: Customer) => {
        setQuery(customer.name);
        onChange(customer);
        setIsOpen(false);
    };

    const handleManualInput = (name: string) => {
        setQuery(name);
        if (!name.trim()) {
            onChange(null);
        } else {
            // Create a temporary customer object for new names
            // Removed .trim() to allow spaces during typing
            onChange({ name: name } as Customer);
        }
    };

    const handleClear = () => {
        setQuery('');
        onChange(null);
        setIsOpen(false);
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-accent transition-colors">
                    <Building2 size={18} />
                </span>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        const val = e.target.value;
                        setQuery(val);
                        handleManualInput(val);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                    className="w-full bg-main border-2 border-subtle focus:border-accent text-content rounded-xl pl-12 pr-12 py-4 font-medium text-lg outline-none transition-all placeholder:text-muted/50"
                />

                {isLoading ? (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted animate-spin">
                        <Loader2 size={18} />
                    </span>
                ) : query ? (
                    <button
                        onClick={handleClear}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-content transition-colors p-1"
                    >
                        <X size={18} />
                    </button>
                ) : (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted/30">
                        <Search size={18} />
                    </span>
                )}
            </div>

            {isOpen && (query.length >= 2 || customers.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-main border-2 border-subtle rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                        {customers.map((cust) => (
                            <button
                                key={cust.id}
                                onClick={() => handleSelect(cust)}
                                className="w-full text-left px-5 py-3 hover:bg-subtle transition-colors flex items-center gap-3 group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                                    <Building2 size={14} />
                                </div>
                                <div>
                                    <div className="font-semibold text-content">{cust.name}</div>
                                    {cust.city && cust.state && (
                                        <div className="text-xs text-muted">{cust.city}, {cust.state}</div>
                                    )}
                                </div>
                            </button>
                        ))}

                        {query.length >= 2 && !customers.find(c => c.name.toLowerCase() === query.toLowerCase()) && (
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-full text-left px-5 py-3 hover:bg-accent/5 transition-colors flex items-center gap-3 border-t border-subtle group"
                            >
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                    <Plus size={14} />
                                </div>
                                <div>
                                    <div className="font-semibold text-content">Add "{query}"</div>
                                    <div className="text-xs text-muted">Create a new customer record</div>
                                </div>
                            </button>
                        )}

                        {query.length >= 2 && customers.length === 0 && !isLoading && (
                            <div className="px-5 py-4 text-center text-muted italic">
                                No matching customers found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
