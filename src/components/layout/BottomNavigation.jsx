import { Box, Scan, History } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useViewMode } from '../../context/ViewModeContext';

const NavItem = ({ icon: Icon, label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-300 ${isActive ? 'text-green-400 scale-105' : 'text-neutral-500 hover:text-neutral-300'
            }`}
    >
        <Icon size={20} className={isActive ? 'drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]' : ''} />
        <span className="text-[9px] font-black uppercase tracking-widest mt-1.5">{label}</span>
    </button>
);

export const BottomNavigation = () => {
    const { viewMode, setViewMode } = useViewMode();
    const navigate = useNavigate();
    const location = useLocation();

    const handleStockClick = () => {
        setViewMode('stock');
        if (location.pathname !== '/') navigate('/');
    };

    const handlePickingClick = () => {
        setViewMode('picking');
        if (location.pathname !== '/') navigate('/');
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 h-20 bg-black/90 backdrop-blur-xl border-t border-neutral-800 flex items-center justify-around z-50 pb-safe px-2">
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
