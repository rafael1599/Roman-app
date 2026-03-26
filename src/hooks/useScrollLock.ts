import { useEffect } from 'react';

/**
 * Locks body scroll when active. Supports nested modals via a ref counter
 * so scroll is only restored when the last modal unmounts.
 */
let lockCount = 0;

export const useScrollLock = (isLocked: boolean) => {
  useEffect(() => {
    if (!isLocked) return;

    lockCount++;
    document.body.style.overflow = 'hidden';

    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = '';
      }
    };
  }, [isLocked]);
};
