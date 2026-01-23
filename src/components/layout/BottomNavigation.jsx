import { Box, Scan, History } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useViewMode } from '../../context/ViewModeContext';

const NavItem = ({ icon: Icon, label, isActive, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-400 active:scale-90 ${
      isActive ? 'text-accent' : 'text-muted'
    }`}
  >
    <div
      className={`p-1.5 rounded-2xl transition-all duration-400 ${isActive ? 'bg-accent/10 shadow-lg shadow-accent/5' : ''}`}
    >
      <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
    </div>
    <span
      className={`text-[9px] font-black uppercase tracking-[0.15em] mt-1 transition-all duration-400 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-0.5'}`}
    >
      {label}
    </span>
  </button>
);

export const BottomNavigation = () => {
  const { viewMode, setViewMode, isNavHidden } = useViewMode();
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
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-main/90 backdrop-blur-xl border-t border-subtle flex items-center justify-around z-50 pb-safe px-2">
      <NavItem
        icon={Box}
        label="STOCK"
        isActive={location.pathname === '/' && viewMode === 'stock'}
        onClick={handleStockClick}
      />
      <NavItem
        icon={Scan}
        label="PICKING"
        isActive={location.pathname === '/' && viewMode === 'picking'}
        onClick={handlePickingClick}
      />
      <NavItem
        icon={History}
        label="HISTORY"
        isActive={location.pathname === '/history'}
        onClick={() => navigate('/history')}
      />
    </div>
  );
};
