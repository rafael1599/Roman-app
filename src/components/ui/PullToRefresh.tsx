import { useState, useEffect, useRef, ReactNode } from 'react';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';

interface PullToRefreshProps {
    children: ReactNode;
    onRefresh: () => Promise<void> | void;
    disabled?: boolean;
}

export const PullToRefresh = ({ children, onRefresh, disabled }: PullToRefreshProps) => {
    const [pullDistance, setPullDistance] = useState(0);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPulling, setIsPulling] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef(0);
    const THRESHOLD = 80;

    useEffect(() => {
        if (disabled) return;

        const handleTouchStart = (e: TouchEvent) => {
            // Only start pulling if we are at the top of the page
            if (window.scrollY <= 0) {
                startY.current = e.touches[0].pageY;
                setIsPulling(true);
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (!isPulling || isRefreshing) return;

            const currentY = e.touches[0].pageY;
            const diff = currentY - startY.current;

            if (diff > 0 && window.scrollY <= 0) {
                // Apply resistance
                const distance = Math.min(diff * 0.4, THRESHOLD + 20);
                setPullDistance(distance);

                // Prevent default only if we are actually pulling down at the top
                if (distance > 5) {
                    if (e.cancelable) e.preventDefault();
                }
            } else {
                setPullDistance(0);
                setIsPulling(false);
            }
        };

        const handleTouchEnd = async () => {
            if (!isPulling) return;

            if (pullDistance >= THRESHOLD) {
                setIsRefreshing(true);
                setPullDistance(THRESHOLD); // Keep it visible while refreshing

                try {
                    await onRefresh();
                } finally {
                    // Add a small delay for better feel
                    setTimeout(() => {
                        setIsRefreshing(false);
                        setPullDistance(0);
                    }, 500);
                }
            } else {
                setPullDistance(0);
            }
            setIsPulling(false);
        };

        const container = containerRef.current;
        if (container) {
            container.addEventListener('touchstart', handleTouchStart, { passive: true });
            container.addEventListener('touchmove', handleTouchMove, { passive: false });
            container.addEventListener('touchend', handleTouchEnd);
        }

        return () => {
            if (container) {
                container.removeEventListener('touchstart', handleTouchStart);
                container.removeEventListener('touchmove', handleTouchMove);
                container.removeEventListener('touchend', handleTouchEnd);
            }
        };
    }, [isPulling, pullDistance, isRefreshing, onRefresh, disabled]);

    const opacity = Math.min(pullDistance / THRESHOLD, 1);
    const rotation = (pullDistance / THRESHOLD) * 360;

    return (
        <div ref={containerRef} className="relative w-full h-full min-h-[inherit]">
            <div
                className="absolute left-0 right-0 flex justify-center pointer-events-none z-50 transition-transform duration-200"
                style={{
                    transform: `translateY(${pullDistance}px)`,
                    top: -40,
                    opacity: opacity
                }}
            >
                <div className="bg-white dark:bg-zinc-800 p-2 rounded-full shadow-lg border border-subtle">
                    <RefreshCw
                        className={`${isRefreshing ? 'animate-spin' : ''} text-accent`}
                        size={20}
                        style={{ transform: !isRefreshing ? `rotate(${rotation}deg)` : undefined }}
                    />
                </div>
            </div>
            <div
                className="transition-transform duration-200"
                style={pullDistance > 0 ? { transform: `translateY(${pullDistance}px)` } : undefined}
            >
                {children}
            </div>
        </div>
    );
};
