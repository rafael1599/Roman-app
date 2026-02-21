import { ReactNode, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import Settings from 'lucide-react/dist/esm/icons/settings';
import UserIcon from 'lucide-react/dist/esm/icons/user';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../context/ViewModeContext';
import { UserMenu } from './UserMenu';
import { DoubleCheckHeader } from '../../features/picking/components/DoubleCheckHeader';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { PickingCartDrawer } from '../../features/picking/components/PickingCartDrawer';

interface LayoutMainProps {
  children: ReactNode;
  onExport?: () => void;
}

export const LayoutMain = ({ children, onExport }: LayoutMainProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const isOrdersPage = location.pathname === '/orders';
  const { isAdmin, profile } = useAuth();
  const { isSearching } = useViewMode();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const pbClass = isOrdersPage ? 'pb-0' : (isSearching ? 'pb-12' : 'pb-20');

  return (
    <div className={`flex flex-col min-h-screen bg-main transition-all duration-300 ${pbClass}`}>
      {/* Header / Brand (Scrolls with the page) */}
      {!isOrdersPage && (
        <header
          className={`
                    relative w-full bg-card border-b border-subtle z-50 transition-all duration-300 overflow-hidden
                    ${isScrolled || isSearching ? 'opacity-0 h-0 border-none' : 'opacity-100 h-auto'}
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
              <div
                className="flex items-center gap-1.5 cursor-pointer group"
                onClick={() => navigate('/')}
              >
                <h1 className="text-2xl font-extrabold tracking-tighter flex items-center gap-0.5" style={{ fontFamily: 'var(--font-heading)' }}>
                  <span className="text-accent">P</span>
                  <span className="text-content">ICK</span>
                  <span className="text-accent">D</span>
                </h1>
                <div className="w-8 h-8 relative group">
                  <div className="absolute inset-0 bg-accent/10 blur-lg rounded-full animate-pulse group-hover:bg-accent/20 transition-all opacity-0 group-hover:opacity-100" />
                  <img
                    src="/PickD.png"
                    alt="Logo"
                    className="w-full h-full relative z-10 object-contain animate-pickd-check"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <DoubleCheckHeader />

              <SyncStatusIndicator />

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
      )}

      <UserMenu
        isOpen={isUserMenuOpen}
        onClose={() => setIsUserMenuOpen(false)}
        onExport={onExport}
        navigate={navigate}
      />

      {/* Content */}
      <main className="flex-1 w-full relative">{children}</main>

      {!isOrdersPage && <BottomNavigation />}
      <PickingCartDrawer />
    </div>
  );
};
