-- Migration: Picking List Notes System
-- Description: Create a table for persistent notes/comments on picking lists for better multi-user communication.
-- Date: 2026-01-21

CREATE TABLE IF NOT EXISTS public.picking_list_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES public.picking_lists(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.picking_list_notes ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone who can see the picking list can see the notes
CREATE POLICY "Users can view notes for accessible lists"
ON public.picking_list_notes
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.picking_lists 
        WHERE id = picking_list_notes.list_id
    )
);

-- Anyone who is involved in the list (owner or checker) can add notes
CREATE POLICY "Users can add notes to relevant lists"
ON public.picking_list_notes
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.picking_lists 
        WHERE id = picking_list_notes.list_id 
        AND (user_id = auth.uid() OR checked_by = auth.uid())
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_picking_list_notes_list_id ON public.picking_list_notes(list_id);
