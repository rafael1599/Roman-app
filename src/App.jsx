import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { InventoryProvider, useInventory } from './hooks/useInventoryData';
import { LayoutMain } from './components/layout/LayoutMain';
import { InventoryScreen } from './screens/InventoryScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import Settings from './screens/Settings';
import { ViewModeProvider } from './context/ViewModeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';

// Content accesible solo tras login
const AuthenticatedContent = () => {
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

// Maneja estado de sesión y loader
const AuthGuard = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <Loader2 className="animate-spin text-accent w-10 h-10" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // Solo cargar datos si hay usuario
  return (
    <InventoryProvider>
      <AuthenticatedContent />
    </InventoryProvider>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AuthGuard />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
