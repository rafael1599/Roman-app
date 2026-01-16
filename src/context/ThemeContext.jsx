import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        // 1. Check localStorage
        try {
            const savedTheme = localStorage.getItem('theme');
            // If it was saved with JSON.stringify, it might have extra quotes
            if (savedTheme) {
                const cleaned = savedTheme.replace(/^"(.*)"$/, '$1');
                if (cleaned === 'light' || cleaned === 'dark') return cleaned;
                return savedTheme;
            }
        } catch (e) {
            console.error('Error reading theme from localStorage', e);
        }

        // 2. Check system preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }

        return 'light'; // Default
    });

    useEffect(() => {
        // Apply theme to document
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;

        // Apply 'dark' class for tailwind (now enabled in tailwind.config.js)
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
