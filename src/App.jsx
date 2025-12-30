import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InventoryProvider, useInventory } from './hooks/useInventoryData';
import { LayoutMain } from './components/layout/LayoutMain';
import { LudlowScreen } from './screens/LudlowScreen';
import { AtsScreen } from './screens/AtsScreen';
import SmartPicking from './screens/SmartPicking';
import Settings from './screens/Settings';

// Wrapper to provide context to LayoutMain for export button
const AppContent = () => {
  const { exportData } = useInventory();

  return (
    <LayoutMain onExport={exportData}>
      <Routes>
        <Route path="/" element={<LudlowScreen />} />
        <Route path="/ats" element={<AtsScreen />} />
        <Route path="/picking" element={<SmartPicking />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </LayoutMain>
  );
};

function App() {
  return (
    <InventoryProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </InventoryProvider>
  );
}

export default App;
