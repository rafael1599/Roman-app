import Box from 'lucide-react/dist/esm/icons/box';
import Scan from 'lucide-react/dist/esm/icons/scan';
import History from 'lucide-react/dist/esm/icons/history';
import { useLocation, useNavigate } from 'react-router-dom';
import { useViewMode } from '../../context/ViewModeContext';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  isCompact?: boolean;
}

const NavItem = ({ icon: Icon, label, isActive, onClick, isCompact }: NavItemProps) => (
  <button
    onClick={onClick}
    aria-label={label}
    className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 active:scale-90 ${isActive ? 'text-accent' : 'text-muted'
      } ${isCompact ? 'px-1' : ''}`}
  >
    <div
      className={`rounded-xl transition-all duration-300 ${isActive ? 'bg-accent/10 shadow-lg shadow-accent/5' : ''} ${isCompact ? 'p-1' : 'p-1.5'}`}
    >
      <Icon size={isCompact ? 18 : 22} strokeWidth={isActive ? 2.5 : 2} />
    </div>
    {!isCompact && (
      <span
        className={`text-[10px] font-extrabold uppercase tracking-tight mt-1 transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-0.5'}`}
        style={{ fontFamily: 'var(--font-heading)' }}
      >
        {label}
      </span>
    )}
  </button>
);

export const BottomNavigation = () => {
  const { viewMode, setViewMode, isNavHidden, isSearching } = useViewMode();
  const navigate = useNavigate();
  const location = useLocation();

  if (isNavHidden) return null;

  const handleStockClick = () => {
    setViewMode('stock');
    if (location.pathname !== '/') navigate('/');
  };

  const handlePickingClick = () => {
    setViewMode('picking');
    if (location.pathname !== '/') navigate('/');
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-main/90 backdrop-blur-xl border-t border-subtle flex items-center justify-around z-50 pb-safe transition-all duration-300 ${isSearching ? 'h-12 px-1' : 'h-20 px-2'
      }`}>
      <NavItem
        icon={Box}
        label="STOCK"
        isActive={location.pathname === '/' && viewMode === 'stock'}
        onClick={handleStockClick}
        isCompact={isSearching}
      />
      <NavItem
        icon={Scan}
        label="PICKING"
        isActive={location.pathname === '/' && viewMode === 'picking'}
        onClick={handlePickingClick}
        isCompact={isSearching}
      />
      <NavItem
        icon={History}
        label="HISTORY"
        isActive={location.pathname === '/history'}
        onClick={() => navigate('/history')}
        isCompact={isSearching}
      />
    </div>
  );
};
