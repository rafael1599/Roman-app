import React, { useState, useRef, useCallback } from 'react';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Minus from 'lucide-react/dist/esm/icons/minus';

interface QuantityControlProps {
  value: number;
  onChange: (value: number) => void;
  totalStock?: { total: number; locations: number } | null;
}

export const QuantityControl: React.FC<QuantityControlProps> = ({
  value,
  onChange,
  totalStock,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(String(value));
    setIsEditing(true);
    // Focus after React renders the input
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [value]);

  const confirmEdit = () => {
    const parsed = parseInt(editValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      onChange(parsed);
    } else {
      setEditValue(String(value));
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditValue(String(value));
      setIsEditing(false);
    }
  };

  return (
    <div className="px-4 py-4">
      {/* Stepper row: [ - ]  qty  [ + ] */}
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-12 h-12 rounded-xl bg-surface border border-subtle flex items-center justify-center text-content hover:bg-white/5 active:scale-95 transition-all"
        >
          <Minus size={20} />
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={confirmEdit}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
            min={0}
            className="w-24 text-center text-3xl font-black font-mono text-accent bg-main border border-accent/30 rounded-xl py-2 focus:outline-none focus:border-accent transition-colors"
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="min-w-[80px] text-center text-3xl font-black font-mono text-accent hover:bg-white/5 rounded-xl px-4 py-2 transition-colors active:scale-95"
          >
            {value}
          </button>
        )}

        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-12 h-12 rounded-xl bg-surface border border-subtle flex items-center justify-center text-content hover:bg-white/5 active:scale-95 transition-all"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Total stock across locations */}
      {totalStock && totalStock.locations > 1 && (
        <p className="text-center text-[10px] text-muted font-bold uppercase tracking-widest mt-3">
          Total: {totalStock.total} units across {totalStock.locations} locations
        </p>
      )}
    </div>
  );
};
