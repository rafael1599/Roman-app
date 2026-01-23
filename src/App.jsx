import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { InventoryProvider, useInventory } from './hooks/InventoryProvider';
import { LayoutMain } from './components/layout/LayoutMain';
import { ErrorProvider, useError } from './context/ErrorContext'; // Import ErrorProvider and useError
import { ConfirmationProvider, useConfirmation } from './context/ConfirmationContext'; // Import ConfirmationProvider and useConfirmation
import { ErrorModal } from './components/ui/ErrorModal'; // Import ErrorModal
import { ConfirmationModal } from './components/ui/ConfirmationModal'; // Import ConfirmationModal
const InventoryScreen = React.lazy(() =>
  import('./screens/InventoryScreen').then((m) => ({ default: m.InventoryScreen }))
);
const HistoryScreen = React.lazy(() =>
  import('./screens/HistoryScreen').then((m) => ({ default: m.HistoryScreen }))
);
const Settings = React.lazy(() => import('./screens/Settings'));

import { ViewModeProvider } from './context/ViewModeContext';
import { PickingProvider } from './context/PickingContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './screens/LoginScreen';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { Suspense } from 'react';

// Content accesible solo tras login
const AuthenticatedContent = () => {
  const { exportData } = useInventory();
  const { isAdmin } = useAuth();

  return (
    <ViewModeProvider>
      <LayoutMain onExport={exportData}>
        <Suspense
          fallback={
            <div className="min-h-[50vh] flex items-center justify-center">
              <Loader2 className="animate-spin text-accent w-8 h-8 opacity-20" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<InventoryScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
            <Route
              path="/settings"
              element={isAdmin ? <Settings /> : <Navigate to="/" replace />}
            />
            {/* Catch-all for unknown routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </LayoutMain>
    </ViewModeProvider>
  );
};

// Maneja estado de sesión y loader
const AuthGuard = () => {
  const { user, loading } = useAuth();
  const { error, clearError } = useError(); // Use the error context
  const { confirmationState, showConfirmation, hideConfirmation } = useConfirmation(); // Use the confirmation context state

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
    <>
      <InventoryProvider>
        <PickingProvider>
          <AuthenticatedContent />
        </PickingProvider>
      </InventoryProvider>
      <ErrorModal
        isOpen={error.isOpen}
        title={error.title}
        message={error.message}
        details={error.details}
        onClose={clearError}
      />
      {confirmationState.isOpen && (
        <ConfirmationModal
          isOpen={confirmationState.isOpen}
          title={confirmationState.title}
          message={confirmationState.message}
          onConfirm={confirmationState.onConfirm}
          onClose={confirmationState.onClose}
          confirmText={confirmationState.confirmText}
          cancelText={confirmationState.cancelText}
        />
      )}
    </>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ErrorProvider>
            <ConfirmationProvider>
              {' '}
              {/* Wrap with ConfirmationProvider */}
              <AuthGuard />
            </ConfirmationProvider>
          </ErrorProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
