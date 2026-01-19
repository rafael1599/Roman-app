import React, { useState, useEffect } from 'react';
import { Search, Scan, Type, Hash } from 'lucide-react';

export const SearchInput = ({ value, onChange, placeholder = "Search SKU or Location...", mode = 'stock', onScanClick }) => {
    const [keyboardMode, setKeyboardMode] = useState(() => {
        const saved = localStorage.getItem('kb_pref_main_search');
        return saved || 'numeric';
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
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck="false"
                        className="w-full bg-surface border border-subtle text-content rounded-lg pl-10 pr-12 py-3 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors placeholder:text-muted/50 text-lg font-mono"
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
                <button
                    onClick={toggleMode}
                    className={`flex items-center justify-center w-12 border rounded-lg active:scale-95 transition-all ${keyboardMode === 'numeric'
                            ? 'bg-accent/10 border-accent/30 text-accent'
                            : 'bg-surface border-subtle text-muted'
                        }`}
                    title={keyboardMode === 'numeric' ? "Switch to Text Keyboard" : "Switch to Numeric Keyboard"}
                >
                    {keyboardMode === 'numeric' ? <Type size={20} /> : <Hash size={20} />}
                </button>
            </div>
        </div>
    );
};
