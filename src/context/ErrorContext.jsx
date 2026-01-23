import React, { createContext, useContext } from 'react';
import { useErrorHandler } from '../hooks/useErrorHandler';

const ErrorContext = createContext(null);

export const ErrorProvider = ({ children }) => {
  const { error, showError, clearError } = useErrorHandler();

  return (
    <ErrorContext.Provider value={{ error, showError, clearError }}>
      {children}
    </ErrorContext.Provider>
  );
};

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};
