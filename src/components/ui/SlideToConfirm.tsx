import React, { useState, useRef, useEffect } from 'react';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import Check from 'lucide-react/dist/esm/icons/check';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';

interface SlideToConfirmProps {
    onConfirm: () => void;
    isLoading?: boolean;
    text?: string;
    confirmedText?: string;
    disabled?: boolean;
    variant?: 'default' | 'info';
}

export const SlideToConfirm: React.FC<SlideToConfirmProps> = ({
    onConfirm,
    isLoading = false,
    text = 'SLIDE TO CONFIRM',
    confirmedText = 'CONFIRMED',
    disabled = false,
    variant = 'default',
}) => {
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(0);
    const [thumbPosition, setThumbPosition] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Create a ref to track the current position synchronously for event handlers
    const positionRef = useRef(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const THUMB_SIZE = 40;
    const PADDING = 4;

    useEffect(() => {
        if (containerRef.current) {
            setSliderWidth(containerRef.current.clientWidth - PADDING * 2);
        }

        const handleResize = () => {
            if (containerRef.current) {
                setSliderWidth(containerRef.current.clientWidth - PADDING * 2);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleStart = () => {
        if (isLoading || isConfirmed || disabled) return;
        setIsDragging(true);
    };

    const handleMove = (clientX: number) => {
        if (!isDragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const startX = containerRect.left + PADDING;
        const maxDist = sliderWidth - THUMB_SIZE;

        let newPos = clientX - startX - THUMB_SIZE / 2;

        // Clamp
        newPos = Math.max(0, Math.min(newPos, maxDist));

        // Update both ref (for logic) and state (for UI)
        positionRef.current = newPos;
        setThumbPosition(newPos);
    };

    const handleEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);

        const maxDist = sliderWidth - THUMB_SIZE;
        const threshold = maxDist * 0.5;

        // Use the ref to get the latest position, as state might be stale in this closure
        if (positionRef.current >= threshold) {
            positionRef.current = maxDist;
            setThumbPosition(maxDist);
            setIsConfirmed(true);
            onConfirm();
        } else {
            // Snap back
            positionRef.current = 0;
            setThumbPosition(0);
        }
    };

    // Mouse Events
    const onMouseDown = () => handleStart();

    // Touch Events
    const onTouchStart = () => handleStart();

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
        const onMouseUp = () => handleEnd();
        const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
        const onTouchEnd = () => handleEnd();

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            window.addEventListener('touchmove', onTouchMove);
            window.addEventListener('touchend', onTouchEnd);
        } else {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
        };
    }, [isDragging, sliderWidth]); // Added sliderWidth to deps just in case

    return (
        <div
            ref={containerRef}
            className={`relative h-12 rounded-full overflow-hidden select-none transition-all touch-none ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'
                } ${isConfirmed ? 'bg-green-500' : 'bg-surface border border-subtle shadow-inner'}`}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
        >
            {/* Background Text */}
            <div
                className={`absolute inset-0 flex items-center justify-center text-sm font-black uppercase tracking-widest transition-opacity duration-300 pointer-events-none ${isDragging || isConfirmed ? 'opacity-0' : 'opacity-40 text-muted'
                    }`}
            >
                {text}
            </div>

            {/* Confirmed Text */}
            <div
                className={`absolute inset-0 flex items-center justify-center text-sm font-black uppercase tracking-widest text-white transition-opacity duration-300 pointer-events-none ${isConfirmed ? 'opacity-100' : 'opacity-0'
                    }`}
            >
                {confirmedText}
            </div>

            {/* Progress Fill */}
            {!isConfirmed && (
                <div
                    className={`absolute left-0 top-0 bottom-0 transition-all duration-75 ease-out ${variant === 'info' ? 'bg-blue-500/20' : 'bg-accent/20'
                        }`}
                    style={{
                        width: thumbPosition + THUMB_SIZE / 2,
                        opacity: isDragging ? 1 : 0,
                    }}
                />
            )}

            {/* Thumb */}
            <div
                className={`absolute top-2 bottom-2 aspect-square rounded-full flex items-center justify-center shadow-lg transform transition-transform duration-75 ease-out z-10 ${isConfirmed
                        ? 'bg-white text-green-500'
                        : variant === 'info' ? 'bg-blue-500 text-white' : 'bg-accent text-main'
                    }`}
                style={{
                    left: 0,
                    transform: `translateX(${thumbPosition + PADDING}px)`,
                }}
            >
                {isLoading ? (
                    <Loader2 className="animate-spin w-5 h-5" />
                ) : isConfirmed ? (
                    <Check className="w-5 h-5" />
                ) : (
                    <ArrowRight className={`w-5 h-5 transition-transform ${isDragging ? 'scale-110' : ''}`} />
                )}
            </div>
        </div>
    );
};
