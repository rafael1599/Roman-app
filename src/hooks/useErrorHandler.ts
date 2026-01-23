import { useState, useCallback } from 'react';

interface ErrorState {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string;
}

/**
 * Hook for managing global error state
 * Used to display validation and system errors in the ErrorModal
 */
export function useErrorHandler() {
  const [error, setError] = useState<ErrorState>({
    isOpen: false,
    title: '',
    message: '',
    details: undefined,
  });

  const showError = useCallback((message: string, details?: string, title = 'Error') => {
    setError({
      isOpen: true,
      title,
      message,
      details,
    });
  }, []);

  const clearError = useCallback(() => {
    setError({
      isOpen: false,
      title: '',
      message: '',
      details: undefined,
    });
  }, []);

  return {
    error,
    showError,
    clearError,
  };
}
