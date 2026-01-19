-- 1. Create a more robust picking_lists table
-- This replaces/augments the old picking_sessions
CREATE TABLE IF NOT EXISTS public.picking_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  items JSONB DEFAULT '[]'::JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup of a user's lists
CREATE INDEX IF NOT EXISTS idx_picking_lists_user_id ON public.picking_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_picking_lists_status ON public.picking_lists(status);

-- 2. Enable RLS
ALTER TABLE public.picking_lists ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Users can only see and manage their own lists
DROP POLICY IF EXISTS "Users can manage own picking lists" ON public.picking_lists;
CREATE POLICY "Users can manage own picking lists"
  ON public.picking_lists
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_picking_lists_updated_at ON public.picking_lists;
CREATE TRIGGER tr_update_picking_lists_updated_at
    BEFORE UPDATE ON public.picking_lists
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
