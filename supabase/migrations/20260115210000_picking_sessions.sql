-- 1. Create picking_sessions table
CREATE TABLE IF NOT EXISTS public.picking_sessions (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  items JSONB DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.picking_sessions ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Users can only read their own session
DROP POLICY IF EXISTS "Users can read own picking session" ON picking_sessions;
CREATE POLICY "Users can read own picking session"
  ON picking_sessions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own session
DROP POLICY IF EXISTS "Users can insert own picking session" ON picking_sessions;
CREATE POLICY "Users can insert own picking session"
  ON picking_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own picking session" ON picking_sessions;
CREATE POLICY "Users can update own picking session"
  ON picking_sessions FOR UPDATE
  USING (auth.uid() = user_id);
