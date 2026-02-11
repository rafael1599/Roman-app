-- Migration: Add user presence tracking
-- Purpose: Detect online/offline status for order timeout logic

-- Create user_presence table
CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for efficient presence queries
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen 
ON user_presence(last_seen_at);

-- Enable RLS
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read all presence data
CREATE POLICY "Users can view all presence data"
ON user_presence
FOR SELECT
TO authenticated
USING (true);

-- Policy: Users can only update their own presence
CREATE POLICY "Users can update own presence"
ON user_presence
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- RPC function to update presence (called by client heartbeat)
CREATE OR REPLACE FUNCTION update_user_presence(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_presence (user_id, last_seen_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if a user is online
-- User is considered online if they sent a heartbeat in the last 2 minutes
CREATE OR REPLACE FUNCTION is_user_online(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_presence
    WHERE user_id = p_user_id
    AND last_seen_at > NOW() - INTERVAL '2 minutes'
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE user_presence IS 
'Tracks user online/offline status via heartbeat mechanism. Used to determine if stale orders should be auto-cancelled.';

COMMENT ON FUNCTION update_user_presence IS 
'Called by client every 30 seconds to update presence. SECURITY DEFINER allows authenticated users to update their own presence.';

COMMENT ON FUNCTION is_user_online IS 
'Returns TRUE if user sent a heartbeat within the last 2 minutes, FALSE otherwise.';
