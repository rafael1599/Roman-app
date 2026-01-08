import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InventoryProvider, useInventory } from './hooks/useInventoryData';
import { LayoutMain } from './components/layout/LayoutMain';
import { InventoryScreen } from './screens/InventoryScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import Settings from './screens/Settings';
import { ViewModeProvider } from './context/ViewModeContext';

// Wrapper to provide context to LayoutMain for export button
const AppContent = () => {
  const { exportData } = useInventory();

  return (
    <ViewModeProvider>
      <LayoutMain onExport={exportData}>
        <Routes>
          <Route path="/" element={<InventoryScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </LayoutMain>
    </ViewModeProvider>
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
