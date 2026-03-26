import { useEffect, useRef } from 'react';

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
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

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
  const tagRef = useRef('');

  useEffect(() => {
    if (!isLocked || !onBack) return;

    const tag = `modal-${Date.now()}-${Math.random()}`;
    tagRef.current = tag;
    history.pushState({ modal: tag }, '');
    pushedRef.current = true;

    const handlePopState = (e: PopStateEvent) => {
      // Only respond if we're the topmost modal (our entry was just popped)
      // or if the state no longer contains our tag (meaning we were popped)
      if (!pushedRef.current) return;

      // Check if current state still has a modal tag that's newer than ours
      const currentState = e.state as { modal?: string } | null;
      if (currentState?.modal && currentState.modal !== tag) return;

      pushedRef.current = false;
      onBackRef.current?.();
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
  }, [isLocked]); // eslint-disable-line react-hooks/exhaustive-deps
};
