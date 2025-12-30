import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Download, Save, Settings } from 'lucide-react';

export const LayoutMain = ({ children, onExport }) => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col min-h-screen bg-neutral-950 pb-20">
            {/* Header / Brand - Optional but good for structure */}
            <header className="px-4 py-3 flex justify-between items-center bg-neutral-950">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-400 hover:text-green-400 active:bg-neutral-800 transition-colors"
                        aria-label="Settings"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                    <h1 className="text-xl font-bold text-gray-100 tracking-tight">ROMAN <span className="text-green-400">INV</span></h1>
                </div>
                {onExport && (
                    <button onClick={onExport} className="p-2 bg-neutral-900 border border-neutral-800 rounded-md text-green-400 active:bg-neutral-800 transition-colors" aria-label="Export Data">
                        <Save className="w-5 h-5" />
                    </button>
                )}
            </header>

            {/* Content */}
            <main className="flex-1 w-full">
                {children}
            </main>

            <BottomNavigation />
        </div>
    );
};
