import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

/**
 * Autocomplete Input Component
 * Shows suggestions as user types with additional information
 * Mobile: Shows modal with suggestions
 * Desktop: Shows dropdown below input
 */
export default function AutocompleteInput({
    value,
    onChange,
    suggestions = [],
    placeholder = '',
    label = '',
    minChars = 2,
    onSelect,
    disabled = false,
    className = '',
    renderItem = null
}) {
    const [inputValue, setInputValue] = useState(value || '');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isMobile, setIsMobile] = useState(false);
    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Update input value when prop changes
    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    // Filter suggestions based on input
    useEffect(() => {
        if (inputValue.length >= minChars) {
            // Check if input is an exact match with any suggestion
            const isExactMatch = suggestions.some(item =>
                item?.value?.toLowerCase() === inputValue.toLowerCase()
            );

            // If it's an exact match, don't show suggestions
            if (isExactMatch) {
                setFilteredSuggestions([]);
                setShowSuggestions(false);
            } else {
                // Filter suggestions
                const filtered = suggestions.filter(item =>
                    item?.value?.toLowerCase().includes(inputValue.toLowerCase())
                );
                setFilteredSuggestions(filtered);
                setShowSuggestions(filtered.length > 0);
            }
        } else {
            setFilteredSuggestions([]);
            setShowSuggestions(false);
        }
        setSelectedIndex(-1);
    }, [inputValue, suggestions, minChars]);

    // Handle click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target) &&
                !inputRef.current.contains(event.target)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue);
    };

    const handleSelect = (suggestion) => {
        setInputValue(suggestion.value);
        onChange(suggestion.value);
        setShowSuggestions(false);
        if (onSelect) {
            onSelect(suggestion);
        }
    };

    const handleKeyDown = (e) => {
        if (!showSuggestions) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < filteredSuggestions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0) {
                    handleSelect(filteredSuggestions[selectedIndex]);
                }
                break;
            case 'Escape':
                setShowSuggestions(false);
                break;
        }
    };

    const handleClear = () => {
        setInputValue('');
        onChange('');
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    return (
        <div className="relative">
            {/* Label */}
            {label && (
                <label className="block text-sm font-semibold text-accent mb-2">
                    {label}
                </label>
            )}

            {/* Input */}
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (inputValue.length >= minChars && filteredSuggestions.length > 0) {
                            setShowSuggestions(true);
                        }
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={className || "w-full px-4 py-3 bg-main border border-subtle rounded-lg text-content placeholder-muted/50 focus:border-accent focus:outline-none transition-colors"}
                />

                {/* Clear button */}
                {inputValue && !disabled && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={18} />
                    </button>
                )}

                {/* Search icon when empty */}
                {!inputValue && (
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                )}
            </div>

            {/* Desktop Dropdown */}
            {showSuggestions && !isMobile && filteredSuggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className="absolute z-[60] w-full mt-2 bg-card border border-subtle rounded-lg shadow-xl max-h-64 overflow-y-auto"
                >
                    {filteredSuggestions.map((suggestion, index) => (
                        <button
                            key={suggestion.value}
                            onClick={() => handleSelect(suggestion)}
                            className={`w-full px-4 py-3 text-left hover:bg-surface transition-colors border-b border-subtle last:border-b-0 ${index === selectedIndex ? 'bg-surface' : ''
                                }`}
                        >
                            {renderItem ? renderItem(suggestion) : (
                                <>
                                    <div className="font-semibold text-content">{suggestion.value}</div>
                                    {suggestion.info && (
                                        <div className="text-sm text-muted mt-1">{suggestion.info}</div>
                                    )}
                                </>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Mobile Modal */}
            {showSuggestions && isMobile && filteredSuggestions.length > 0 && (
                <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
                    {/* Header */}
                    <div className="bg-main border-b border-subtle p-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Search className="text-accent" size={20} />
                            <h3 className="text-lg font-bold text-accent">Select {label}</h3>
                        </div>
                        <button
                            onClick={() => setShowSuggestions(false)}
                            className="text-muted hover:text-content"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Search preview */}
                    <div className="bg-card border-b border-subtle p-4">
                        <div className="text-sm text-muted">Searching for:</div>
                        <div className="text-lg font-semibold text-content mt-1">{inputValue}</div>
                        <div className="text-sm text-accent mt-1">
                            {filteredSuggestions.length} result{filteredSuggestions.length !== 1 ? 's' : ''}
                        </div>
                    </div>

                    {/* Suggestions List */}
                    <div className="flex-1 overflow-y-auto">
                        {filteredSuggestions.map((suggestion) => (
                            <button
                                key={suggestion.value}
                                onClick={() => handleSelect(suggestion)}
                                className="w-full px-4 py-4 text-left hover:bg-surface active:bg-surface transition-colors border-b border-subtle touch-manipulation"
                            >
                                {renderItem ? renderItem(suggestion) : (
                                    <>
                                        <div className="font-semibold text-content text-lg">{suggestion.value}</div>
                                        {suggestion.info && (
                                            <div className="text-sm text-muted mt-2">{suggestion.info}</div>
                                        )}
                                    </>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="bg-main border-t border-subtle p-4">
                        <button
                            onClick={() => setShowSuggestions(false)}
                            className="w-full px-6 py-3 bg-surface hover:opacity-80 text-content rounded-lg font-semibold transition-colors touch-manipulation"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
