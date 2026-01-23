import React, { createContext, useContext, useState } from 'react';

const ViewModeContext = createContext();

export const ViewModeProvider = ({ children }) => {
  const [viewMode, setViewMode] = useState('stock'); // 'stock' | 'picking'
  const [externalDoubleCheckId, setExternalDoubleCheckId] = useState(null);
  const [isNavHidden, setIsNavHidden] = useState(false);

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        setViewMode,
        externalDoubleCheckId,
        setExternalDoubleCheckId,
        isNavHidden,
        setIsNavHidden,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const context = useContext(ViewModeContext);
  if (!context) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
};
