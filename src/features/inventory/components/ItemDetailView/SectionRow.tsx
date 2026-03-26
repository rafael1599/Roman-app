import React from 'react';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right';

interface SectionRowProps {
  label: string;
  value: React.ReactNode;
  editable?: boolean;
  onTap?: () => void;
  className?: string;
}

/**
 * A single row in a settings-style list.
 * Editable rows show a subtle background and chevron affordance.
 */
export const SectionRow: React.FC<SectionRowProps> = ({
  label,
  value,
  editable = false,
  onTap,
  className = '',
}) => {
  const Wrapper = editable ? 'button' : 'div';

  return (
    <Wrapper
      type={editable ? 'button' : undefined}
      onClick={editable ? onTap : undefined}
      className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
        editable ? 'hover:bg-white/5 active:bg-white/10 cursor-pointer' : ''
      } ${className}`}
    >
      <span className="text-[11px] font-bold text-muted uppercase tracking-wider shrink-0 w-24">
        {label}
      </span>
      <span className="flex-1 text-sm text-content font-medium text-right truncate ml-3">
        {value || <span className="text-muted/40 italic">—</span>}
      </span>
      {editable && <ChevronRight size={16} className="text-muted/40 ml-2 shrink-0" />}
    </Wrapper>
  );
};
