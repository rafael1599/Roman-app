/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Semantic colors mapped to CSS variables
                main: 'var(--bg-main)',
                surface: 'var(--bg-surface)',
                card: 'var(--bg-card)',
                content: 'var(--text-main)',
                muted: 'var(--text-muted)',
                subtle: 'var(--border-subtle)',
                accent: 'var(--accent-primary)',

                // Keep existing for backward compatibility or direct use
                neutral: {
                    800: 'var(--border-subtle)', // Alias for easier refactor
                    900: 'var(--bg-card)',
                    950: 'var(--bg-surface)',
                }
            }
        },
    },
    plugins: [],
}
