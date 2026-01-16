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
        <div className="flex flex-col min-h-screen bg-main pb-20">
            {/* Header / Brand */}
            <header className="px-4 py-3 flex justify-between items-center bg-card sticky top-0 z-[60] border-b border-subtle">
                <div className="flex items-center gap-3">
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/settings')}
                            className="w-10 h-10 ios-btn-surface text-muted hover:text-accent transition-colors"
                            aria-label="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    )}
                    <h1 className="text-xl font-bold text-content tracking-tight">ROMAN <span className="text-accent">INV</span></h1>
                </div>

                <div className="flex items-center gap-2">
                    {onExport && (
                        <button onClick={onExport} className="p-2 bg-surface border border-subtle rounded-md text-accent active:bg-surface/80 transition-colors" aria-label="Export Data">
                            <Save className="w-5 h-5" />
                        </button>
                    )}

                    <button
                        onClick={() => setIsUserMenuOpen(true)}
                        className="flex items-center gap-2 p-1.5 bg-surface border border-subtle rounded-full hover:border-accent transition-all active:scale-95"
                    >
                        <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-black">
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
