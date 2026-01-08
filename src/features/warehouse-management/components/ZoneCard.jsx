import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CheckSquare, Square, GripVertical } from 'lucide-react';
import { getZoneStyle, getZoneEmoji, parseLocationKey } from '../utils/zoneUtils';

/**
 * ZoneCard - Individual location card in the zone map grid
 * 
 * Memoized for performance since the grid can have many cards.
 */
export const ZoneCard = memo(({
    locKey,
    zone,
    routePosition,
    isSelected,
    editMode,
    onTap
}) => {
    const { warehouse, location } = parseLocationKey(locKey);

    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: locKey });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 100 : 1,
        opacity: isDragging ? 0.6 : 1,
        scale: isDragging ? 1.05 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                relative p-3 rounded-xl border-2 transition-all duration-200
                touch-manipulation flex flex-col items-center justify-center text-center
                ${getZoneStyle(zone)}
                ${isSelected ? 'ring-2 ring-purple-500 ring-offset-2 ring-offset-neutral-900' : ''}
                ${editMode ? 'hover:ring-2 hover:ring-purple-500/50' : 'hover:brightness-110 shadow-lg'}
            `}
        >
            {/* Main Interactive Area */}
            <button
                onClick={() => onTap(locKey)}
                {...attributes}
                {...listeners}
                className="w-full h-full flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing"
            >
                {/* Route Position Badge */}
                <div className="absolute -top-2 -left-2 w-5 h-5 bg-neutral-900 border border-neutral-700 rounded-full flex items-center justify-center text-[10px] font-bold text-neutral-400">
                    {routePosition}
                </div>

                {/* Grip Icon (Visual cue for DND) */}
                <div className="absolute top-1 right-1 opacity-20">
                    <GripVertical size={12} />
                </div>

                {/* Multi-select checkbox */}
                {editMode && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center shadow-lg">
                        {isSelected ? (
                            <CheckSquare size={12} className="text-white" />
                        ) : (
                            <Square size={12} className="text-purple-200" />
                        )}
                    </div>
                )}

                {/* Zone Emoji */}
                <div className="text-xl mb-1">{getZoneEmoji(zone)}</div>

                {/* Location Name */}
                <div className="text-xs font-black truncate w-full">{location}</div>

                {/* Warehouse Tag */}
                <div className="text-[8px] uppercase opacity-60">{warehouse}</div>
            </button>
        </div>
    );
});

ZoneCard.displayName = 'ZoneCard';
