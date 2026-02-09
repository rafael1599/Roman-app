import React, { useState } from 'react';
import Search from 'lucide-react/dist/esm/icons/search';
import Scan from 'lucide-react/dist/esm/icons/scan';
import Type from 'lucide-react/dist/esm/icons/type';
import Hash from 'lucide-react/dist/esm/icons/hash';
import X from 'lucide-react/dist/esm/icons/x';

interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    mode?: 'stock' | 'picking';
    onScanClick?: () => void;
    autoFocus?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder = 'Search SKU or Location...',
    mode = 'stock',
    onScanClick,
    autoFocus = false,
}) => {
    const [keyboardMode, setKeyboardMode] = useState<'text' | 'numeric'>(() => {
        const saved = localStorage.getItem('kb_pref_main_search');
        return (saved as 'text' | 'numeric') || 'numeric';
    });

    const toggleMode = () => {
        const newMode = keyboardMode === 'text' ? 'numeric' : 'text';
        setKeyboardMode(newMode);
        localStorage.setItem('kb_pref_main_search', newMode);
    };

    return (
        <div className="sticky top-0 z-40 bg-main/80 backdrop-blur-md p-4 border-b border-subtle">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-5 h-5" />
                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        inputMode={keyboardMode}
                        autoFocus={autoFocus}
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck="false"
                        className={`w-full bg-surface border border-subtle text-content rounded-xl pl-10 py-3.5 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all placeholder:text-muted/40 text-base font-semibold tracking-tight ${mode === 'picking' ? 'pr-24' : 'pr-12'}`}
                        style={{ fontFamily: 'var(--font-body)' }}
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {value && (
                            <button
                                onClick={() => onChange('')}
                                className="p-2 text-muted hover:text-content transition-colors active:scale-90"
                                aria-label="Clear search"
                            >
                                <X size={18} />
                            </button>
                        )}

                        {mode === 'picking' && (
                            <button
                                onClick={onScanClick}
                                className="p-2 bg-card text-accent rounded-lg border border-subtle shadow-sm active:scale-95 transition-all"
                            >
                                <Scan size={18} />
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={toggleMode}
                    className={`flex items-center justify-center w-12 border rounded-xl active:scale-90 transition-all ${keyboardMode === 'numeric'
                        ? 'bg-accent/10 border-accent/20 text-accent'
                        : 'bg-surface border-subtle text-muted'
                        }`}
                    title={
                        keyboardMode === 'numeric' ? 'Switch to Text Keyboard' : 'Switch to Numeric Keyboard'
                    }
                >
                    {keyboardMode === 'numeric' ? <Type size={20} /> : <Hash size={20} />}
                </button>
            </div>
        </div>
    );
};
