import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, Check, Loader2 } from 'lucide-react';

export const SlideToConfirm = ({
    onConfirm,
    isLoading = false,
    text = "SLIDE TO CONFIRM",
    confirmedText = "CONFIRMED",
    disabled = false
}) => {
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [sliderWidth, setSliderWidth] = useState(0);
    const [thumbPosition, setThumbPosition] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const containerRef = useRef(null);
    const thumbRef = useRef(null);
    const THUMB_SIZE = 40; // Width/Height of the thumb in px (reduced from 48)
    const PADDING = 4; // Padding inside the track

    useEffect(() => {
        if (containerRef.current) {
            setSliderWidth(containerRef.current.clientWidth - PADDING * 2);
        }

        // Handle resize
        const handleResize = () => {
            if (containerRef.current) {
                setSliderWidth(containerRef.current.clientWidth - PADDING * 2);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleStart = (clientX) => {
        if (isLoading || isConfirmed || disabled) return;
        setIsDragging(true);
    };

    const handleMove = (clientX) => {
        if (!isDragging || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const startX = containerRect.left + PADDING;
        const maxDist = sliderWidth - THUMB_SIZE;

        let newPos = clientX - startX - (THUMB_SIZE / 2);

        // Clamp
        newPos = Math.max(0, Math.min(newPos, maxDist));
        setThumbPosition(newPos);
    };

    const handleEnd = () => {
        if (!isDragging) return;
        setIsDragging(false);

        const maxDist = sliderWidth - THUMB_SIZE;
        const threshold = maxDist * 0.9;

        if (thumbPosition >= threshold) {
            setThumbPosition(maxDist);
            setIsConfirmed(true);
            onConfirm();
        } else {
            // Snap back
            setThumbPosition(0);
        }
    };

    // Mouse Events
    const onMouseDown = (e) => handleStart(e.clientX);
    const onMouseMove = (e) => handleMove(e.clientX);
    const onMouseUp = () => handleEnd();

    // Touch Events
    const onTouchStart = (e) => handleStart(e.touches[0].clientX);
    const onTouchMove = (e) => handleMove(e.touches[0].clientX);
    const onTouchEnd = () => handleEnd();

    useEffect(() => {
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
    }, [isDragging]);

    return (
        <div
            ref={containerRef}
            className={`relative h-12 rounded-full overflow-hidden select-none transition-all ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'cursor-pointer'
                } ${isConfirmed ? 'bg-green-500' : 'bg-surface border border-subtle shadow-inner'}`}
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
        >
            {/* Background Text */}
            <div className={`absolute inset-0 flex items-center justify-center text-sm font-black uppercase tracking-widest transition-opacity duration-300 pointer-events-none ${isDragging || isConfirmed ? 'opacity-0' : 'opacity-40 text-muted'
                }`}>
                {text}
            </div>

            {/* Confirmed Text */}
            <div className={`absolute inset-0 flex items-center justify-center text-sm font-black uppercase tracking-widest text-white transition-opacity duration-300 pointer-events-none ${isConfirmed ? 'opacity-100' : 'opacity-0'
                }`}>
                {confirmedText}
            </div>

            {/* Progress Fill */}
            {!isConfirmed && (
                <div
                    className="absolute left-0 top-0 bottom-0 bg-accent/20 transition-all duration-75 ease-out"
                    style={{
                        width: thumbPosition + THUMB_SIZE / 2,
                        opacity: isDragging ? 1 : 0
                    }}
                />
            )}

            {/* Thumb */}
            <div
                ref={thumbRef}
                className={`absolute top-2 bottom-2 aspect-square rounded-full flex items-center justify-center shadow-lg transform transition-transform duration-75 ease-out z-10 ${isConfirmed ? 'bg-white text-green-500' : 'bg-accent text-main'
                    }`}
                style={{
                    left: 0,
                    transform: `translateX(${thumbPosition + PADDING}px)`
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
