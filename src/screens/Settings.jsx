import { Settings as SettingsIcon } from 'lucide-react';
import MapBuilder from '../features/smart-picking/components/MapBuilder';

export default function Settings() {
    return (
        <div className="min-h-screen bg-gray-950 p-3 sm:p-6 pb-20">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
                    <SettingsIcon className="text-green-400 flex-shrink-0" size={28} />
                    <h1 className="text-2xl sm:text-3xl font-bold text-green-400">Settings</h1>
                </div>

                {/* Warehouse Map */}
                <MapBuilder />
            </div>
        </div>
    );
}
