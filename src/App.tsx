import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { InventoryProvider, useInventory } from './hooks/InventoryProvider';
import { LayoutMain } from './components/layout/LayoutMain';
import { ErrorProvider, useError } from './context/ErrorContext'; // Import ErrorProvider and useError
import { ConfirmationProvider, useConfirmation } from './context/ConfirmationContext'; // Import ConfirmationProvider and useConfirmation
import { ErrorModal } from './components/ui/ErrorModal'; // Import ErrorModal
import { ConfirmationModal } from './components/ui/ConfirmationModal'; // Import ConfirmationModal
const InventoryScreen = React.lazy(() =>
  import('./screens/InventoryScreen.tsx').then((m) => ({ default: m.InventoryScreen }))
);
const HistoryScreen = React.lazy(() =>
  import('./screens/HistoryScreen.tsx').then((m) => ({ default: m.HistoryScreen }))
);
const Settings = React.lazy(() => import('./screens/Settings.tsx'));
const LoginScreen = React.lazy(() => import('./screens/LoginScreen').then(m => ({ default: m.LoginScreen })));
const OrdersScreen = React.lazy(() => import('./screens/OrdersScreen').then(m => ({ default: m.OrdersScreen })));

import { ViewModeProvider } from './context/ViewModeContext';
import { PickingProvider } from './context/PickingContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { Suspense } from 'react';

// Content accessible only after login
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
            <Route path="/orders" element={<OrdersScreen />} />
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

// Handles session state and loader
const AuthGuard = () => {
  const { user, loading } = useAuth();
  const { error, clearError } = useError(); // Use the error context
  const { confirmationState } = useConfirmation(); // Use the confirmation context state

  if (loading) {
    return (
      <div className="min-h-screen bg-main flex items-center justify-center">
        <Loader2 className="animate-spin text-accent w-10 h-10" />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-main flex items-center justify-center">
          <Loader2 className="animate-spin text-accent w-10 h-10 opa-20" />
        </div>
      }>
        <LoginScreen />
      </Suspense>
    );
  }

  // Only load data if user is authenticated
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

import { cleanupCorruptedMutations } from './lib/query-client';

function App() {
  React.useEffect(() => {
    // Self-healing: Remove stuck mutations on app boot
    cleanupCorruptedMutations();
  }, []);

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
