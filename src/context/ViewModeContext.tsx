import { createContext, useContext, useState, ReactNode } from 'react';

type ViewMode = 'stock' | 'picking';

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  externalDoubleCheckId: string | number | null;
  setExternalDoubleCheckId: (id: string | number | null) => void;
  isNavHidden: boolean;
  setIsNavHidden: (hidden: boolean) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export const ViewModeProvider = ({ children }: { children: ReactNode }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('stock');
  const [externalDoubleCheckId, setExternalDoubleCheckId] = useState<string | number | null>(null);
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
