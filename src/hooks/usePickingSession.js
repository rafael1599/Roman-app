import { usePickingSession as usePickingContext } from '../context/PickingContext';

/**
 * Proxy hook to use the centralized PickingContext.
 * This ensures that components importing from this path still work,
 * but share the same state.
 */
export const usePickingSession = () => {
    return usePickingContext();
};
