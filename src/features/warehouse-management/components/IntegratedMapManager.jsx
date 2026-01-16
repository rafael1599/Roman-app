import { useState } from 'react';
import { useWarehouseZones } from '../../../hooks/useWarehouseZones';
import { useOptimizationReports } from '../../../hooks/useOptimizationReports';
import { UnifiedZoneMap } from './UnifiedZoneMap';
import { OptimizationReportCard } from './OptimizationReportCard';
import { LocationList } from './LocationList';
import { Map as MapIcon, BarChart3, MapPin } from 'lucide-react';

export const IntegratedMapManager = () => {
    const {
        allLocations,
        zones,
        getZone,
        updateZone,
        batchUpdateZones,
        autoAssignZones,
        saveAllChanges,
        hasUnsavedChanges,
        loading: zonesLoading
    } = useWarehouseZones();
    const { latestReport, generateReport, loading: reportsLoading } = useOptimizationReports();

    const [activeTab, setActiveTab] = useState('locations'); // 'locations' | 'zones' | 'reports'

    if (zonesLoading) {
        return <div className="p-12 text-center text-neutral-500 animate-pulse">Loading Warehouse Data...</div>;
    }

    return (
        <div className="bg-neutral-900/50 border border-neutral-800 rounded-3xl overflow-hidden backdrop-blur-sm">
            {/* Header Tabs */}
            <div className="flex border-b border-neutral-800 bg-black/20">
                <TabButton
                    active={activeTab === 'locations'}
                    onClick={() => setActiveTab('locations')}
                    icon={MapPin}
                    label="Edit Locations"
                />
                <TabButton
                    active={activeTab === 'zones'}
                    onClick={() => setActiveTab('zones')}
                    icon={MapIcon}
                    label="Zone Map"
                    badge={hasUnsavedChanges ? '●' : null}
                />
                <TabButton
                    active={activeTab === 'reports'}
                    onClick={() => setActiveTab('reports')}
                    icon={BarChart3}
                    label="Reports"
                />
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-6">
                {activeTab === 'locations' && (
                    <LocationList />
                )}

                {activeTab === 'zones' && (
                    <UnifiedZoneMap
                        locations={allLocations}
                        zones={zones}
                        getZone={getZone}
                        updateZone={updateZone}
                        batchUpdateZones={batchUpdateZones}
                        autoAssignZones={autoAssignZones}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onSave={saveAllChanges}
                    />
                )}

                {activeTab === 'reports' && (
                    <div className="max-w-4xl mx-auto">
                        <OptimizationReportCard
                            report={latestReport}
                            onGenerateNew={generateReport}
                        />
                    </div>
                )}
            </div>
        </div >
    );
};

const TabButton = ({ active, onClick, icon: Icon, label, badge }) => (
    <button
        onClick={onClick}
        className={`
            flex-1 py-5 px-4 flex items-center justify-center gap-2
            font-black uppercase tracking-wider text-xs sm:text-sm transition-all relative
            ${active
                ? 'bg-neutral-900 text-white border-b-2 border-blue-500'
                : 'text-neutral-500 hover:text-white hover:bg-white/5 border-b-2 border-transparent'
            }
        `}
    >
        <Icon size={18} className={active ? 'text-blue-500' : 'opacity-50'} />
        <span className="hidden sm:inline">{label}</span>
        {badge && (
            <span className="absolute top-2 right-2 text-orange-400 text-lg animate-pulse">{badge}</span>
        )}
    </button>
);
