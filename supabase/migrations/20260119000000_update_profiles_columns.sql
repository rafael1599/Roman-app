-- Add is_active, email, last_seen_at and created_by columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- Add list_id to inventory_logs for better tracking
ALTER TABLE public.inventory_logs ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES public.picking_lists(id);

-- Sync emails from auth.users if they are missing
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
