-- Migration: Fix presence relationships
-- Purpose: Allow PostgREST to join picking_lists and user_presence via explicit foreign keys

-- Pre-populate user_presence from profiles to avoid FK violations
INSERT INTO public.user_presence (user_id, last_seen_at)
SELECT id, created_at FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Add foreign key from picking_lists to user_presence to enable direct joins
-- This is a non-exclusive relationship (picking_lists.user_id already references profiles.id)
ALTER TABLE IF EXISTS public.picking_lists
ADD CONSTRAINT picking_lists_presence_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.user_presence(user_id);

-- Also link user_presence to profiles if not already done, to improve schema discovery
ALTER TABLE IF EXISTS public.user_presence
DROP CONSTRAINT IF EXISTS user_presence_profiles_id_fkey,
ADD CONSTRAINT user_presence_profiles_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT picking_lists_presence_user_id_fkey ON public.picking_lists IS 
'Enables PostgREST to discover the relationship for real-time order presence tracking.';
