import { useEffect, useCallback, useRef } from 'react';

/**
 * Locks body scroll when active. Supports nested modals via a ref counter
 * so scroll is only restored when the last modal unmounts.
 *
 * Also hooks into browser back button / swipe-back gesture to close the modal,
 * preventing users from getting stuck when the X button is not visible.
 */
let lockCount = 0;

export const useScrollLock = (isLocked: boolean, onBack?: () => void) => {
  const pushedRef = useRef(false);
  const stableOnBack = useCallback(() => onBack?.(), [onBack]);

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

  // Back button / swipe-back closes the modal
  useEffect(() => {
    if (!isLocked || !onBack) return;

    const tag = `modal-${lockCount}`;
    history.pushState({ modal: tag }, '');
    pushedRef.current = true;

    const handlePopState = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        stableOnBack();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // If modal closed programmatically (not via back), remove our history entry
      if (pushedRef.current) {
        pushedRef.current = false;
        history.back();
      }
    };
  }, [isLocked, onBack, stableOnBack]);
};
