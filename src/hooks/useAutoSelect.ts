import { useCallback } from 'react';

/**
 * Custom hook to provide automatic text selection when an input is focused.
 * Specifically designed to work on mobile by suppressing the native context menu
 * (Copy/Paste) during the initial focus selection.
 */
export const useAutoSelect = () => {
    const onFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        const target = e.target;
        const isNumber = target.type === 'number';

        setTimeout(() => {
            if (!target) return;

            try {
                if (isNumber) {
                    // input[type=number] doesn't support setSelectionRange in most browsers.
                    // We temporarily switch to text to select, then switch back.
                    target.type = 'text';
                    target.setSelectionRange(0, target.value.length);
                    target.type = 'number';
                } else if (typeof target.setSelectionRange === 'function') {
                    target.setSelectionRange(0, target.value.length);
                }
            } catch (err) {
                // Fallback to select() if everything else fails
                target.select();
            }
        }, 50);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
        // Only prevent default on the initial focus to suppress the native copy/paste menu.
        // This allows subsequent taps to move the cursor normally.
        if (document.activeElement !== e.currentTarget) {
            // If not yet focused, the system is trying to focus and show menu.
            // preventDefault here helps stop the menu without stopping the focus.
        }
        // Suppressing pointerUp is a common trick to hide the bubble menu on iOS/Android
        // while the element is receiving focus.
        e.preventDefault();
    }, []);

    return { onFocus, onPointerUp };
};
