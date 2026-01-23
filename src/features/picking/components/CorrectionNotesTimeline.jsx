import React, { useState } from 'react';
import { MessageSquare, User, Clock, ChevronDown, ChevronUp } from 'lucide-react';

export const CorrectionNotesTimeline = ({ notes, isLoading }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading && notes.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 opacity-50">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-accent border-t-transparent mr-2" />
        <span className="text-[10px] font-black uppercase tracking-widest">Loading notes...</span>
      </div>
    );
  }

  if (notes.length === 0) return null;

  // The most recent note is the last one in the array (ordered by created_at ascending in hook)
  const latestNote = notes[notes.length - 1];
  const historicalNotes = notes.slice(0, -1).reverse(); // Older notes, reversed to show most recent old first when expanded
  const hasHistory = historicalNotes.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-accent" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
            Instructions
          </h3>
        </div>
        {hasHistory && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-subtle/20 hover:bg-subtle/40 transition-colors group"
          >
            <span className="text-[9px] font-black uppercase tracking-widest text-muted group-hover:text-content">
              {isExpanded ? 'Hide History' : `See History (+${historicalNotes.length})`}
            </span>
            {isExpanded ? (
              <ChevronUp size={10} className="text-muted" />
            ) : (
              <ChevronDown size={10} className="text-muted" />
            )}
          </button>
        )}
      </div>

      <div className="relative pl-4 border-l-2 border-subtle/30 space-y-4">
        {/* Historical Notes (Collapsible) */}
        {isExpanded &&
          historicalNotes.map((note) => <NoteItem key={note.id} note={note} isHistorical />)}

        {/* Latest Note (Always visible) */}
        <NoteItem note={latestNote} isLatest />
      </div>
    </div>
  );
};

const NoteItem = ({ note, isLatest, isHistorical }) => (
  <div
    className={`relative ${isHistorical ? 'opacity-60 hover:opacity-100 transition-opacity' : ''}`}
  >
    {/* Dot on time line */}
    <div
      className={`absolute -left-[1.35rem] top-1.5 w-2 h-2 rounded-full border-4 border-card ${isLatest ? 'bg-accent' : 'bg-subtle'}`}
    />

    <div
      className={`${isLatest ? 'bg-surface border-accent/20' : 'bg-surface/30 border-subtle/30'} border rounded-2xl p-4 shadow-sm animate-in fade-in slide-in-from-left-2 duration-300`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center ${isLatest ? 'bg-accent/10 text-accent' : 'bg-muted/10 text-muted'}`}
          >
            <User size={10} />
          </div>
          <span className="text-[10px] font-bold text-content truncate max-w-[150px]">
            {note.user_display_name}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted text-[9px] font-mono">
          <Clock size={10} />
          {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <p
        className={`text-sm leading-relaxed font-medium bg-card/40 p-3 rounded-xl border border-subtle/20 italic ${isLatest ? 'text-content' : 'text-content/70'}`}
      >
        "{note.message}"
      </p>

      <div className="mt-2 text-[8px] text-muted font-black uppercase tracking-tighter text-right">
        {new Date(note.created_at).toLocaleDateString()}
      </div>
    </div>
  </div>
);
