import { useState, useCallback } from 'react';

export interface UseActiveFieldReturn {
  activeField: string | null;
  setActiveField: (name: string | null) => void;
  isActive: (name: string) => boolean;
}

/**
 * Manages which field is currently being edited.
 * Only one field can be active at a time.
 * When switching fields, the previous one auto-confirms via blur.
 */
export function useActiveField(initialField: string | null = null): UseActiveFieldReturn {
  const [activeField, setActiveFieldState] = useState<string | null>(initialField);

  const setActiveField = useCallback((name: string | null) => {
    setActiveFieldState(name);
  }, []);

  const isActive = useCallback((name: string) => activeField === name, [activeField]);

  return { activeField, setActiveField, isActive };
}
