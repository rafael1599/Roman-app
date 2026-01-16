import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Download, Save, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useInventory } from '../../hooks/useInventoryData';
import { UserMenu } from './UserMenu';

export const LayoutMain = ({ children, onExport }) => {
    const navigate = useNavigate();
    const { isAdmin, profile } = useAuth();
    const { syncInventoryLocations } = useInventory();
    const [isUserMenuOpen, setIsUserMenuOpen] = React.useState(false);
    const [isScrolled, setIsScrolled] = React.useState(false);

    React.useEffect(() => {
        const handleScroll = () => {
            // Umbral de scroll para mostrar el botón flotante (cuando la cabecera ya no es visible)
            setIsScrolled(window.scrollY > 80);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-main pb-20">
            {/* Header / Brand (Scrolls with the page) */}
            <header
                className={`
                    relative w-full bg-card border-b border-subtle z-50 transition-opacity duration-300
                    ${isScrolled ? 'opacity-0' : 'opacity-100'}
                `}
            >
                <div className="flex justify-between items-center px-4 py-3">
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
                        <h1 className="text-xl font-bold text-content tracking-tight uppercase italic underline decoration-accent decoration-4">ROMAN <span className="text-accent not-italic">INV</span></h1>
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
                            <div className="w-7 h-7 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent text-xs font-black uppercase">
                                {profile?.full_name?.charAt(0) || <UserIcon size={14} />}
                            </div>
                        </button>
                    </div>
                </div>
            </header>

            {/* Floating Action Button (REMOVED as it overlapped search) */}

            <UserMenu
                isOpen={isUserMenuOpen}
                onClose={() => setIsUserMenuOpen(false)}
                onExport={onExport}
                onSync={syncInventoryLocations}
            />

            {/* Content */}
            <main className="flex-1 w-full relative">
                {children}
            </main>

            <BottomNavigation />
        </div>
    );
};
