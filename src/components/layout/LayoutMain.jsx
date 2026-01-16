import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Download, Save, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenu } from './UserMenu';

export const LayoutMain = ({ children, onExport }) => {
    const navigate = useNavigate();
    const { isAdmin, profile } = useAuth();
    const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);

    return (
        <div className="flex flex-col min-h-screen bg-neutral-950 pb-20">
            {/* Header / Brand */}
            <header className="px-4 py-3 flex justify-between items-center bg-neutral-950 sticky top-0 z-[60] border-b border-neutral-900">
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/settings')}
                            className="p-2 bg-neutral-900 border border-neutral-800 rounded-md text-neutral-400 hover:text-green-400 active:bg-neutral-800 transition-colors"
                            aria-label="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-gray-100 tracking-tight">ROMAN <span className="text-green-400">INV</span></h1>
                </div>

                <div className="flex items-center gap-2">
                    {onExport && (
                        <button onClick={onExport} className="p-2 bg-neutral-900 border border-neutral-800 rounded-md text-green-400 active:bg-neutral-800 transition-colors" aria-label="Export Data">
                            <Save className="w-5 h-5" />
                        </button>
                    )}

                    <button
                        onClick={() => setIsUserMenuOpen(true)}
                        className="flex items-center gap-2 p-1.5 bg-neutral-900 border border-neutral-800 rounded-full hover:border-neutral-700 transition-all active:scale-95"
                    >
                        <div className="w-7 h-7 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 text-xs font-black">
                            {profile?.full_name?.charAt(0) || <UserIcon size={14} />}
                        </div>
                    </button>
                </div>

                <UserMenu isOpen={isUserMenuOpen} onClose={() => setIsUserMenuOpen(false)} />
            </header>

            {/* Content */}
            <main className="flex-1 w-full">
                {children}
            </main>

            <BottomNavigation />
        </div>
    );
};
