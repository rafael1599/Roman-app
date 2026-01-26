import React, { ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Save, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserMenu } from './UserMenu';
import { DoubleCheckHeader } from '../../features/picking/components/DoubleCheckHeader';
import { SyncStatusIndicator } from './SyncStatusIndicator';

interface LayoutMainProps {
  children: ReactNode;
  onExport?: () => void;
}

export const LayoutMain = ({ children, onExport }: LayoutMainProps) => {
  const navigate = useNavigate();
  const { isAdmin, profile } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
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
            <h1 className="text-xl font-bold text-content tracking-tight uppercase italic underline decoration-accent decoration-4">
              ROMAN <span className="text-accent not-italic">INV</span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {onExport && isAdmin && (
              <button
                onClick={onExport}
                className="p-2 bg-surface border border-subtle rounded-md text-accent active:bg-surface/80 transition-colors"
                aria-label="Export Data"
              >
                <Save className="w-5 h-5" />
              </button>
            )}

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

      <UserMenu
        isOpen={isUserMenuOpen}
        onClose={() => setIsUserMenuOpen(false)}
        onExport={onExport}
      />

      {/* Content */}
      <main className="flex-1 w-full relative">{children}</main>

      <BottomNavigation />
    </div>
  );
};
