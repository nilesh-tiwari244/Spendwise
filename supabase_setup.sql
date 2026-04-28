-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bucket_id UUID NOT NULL REFERENCES buckets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to allow re-running
DROP POLICY IF EXISTS "Users can view activity logs for their buckets" ON activity_logs;
DROP POLICY IF EXISTS "Users can insert activity logs for their buckets" ON activity_logs;
DROP POLICY IF EXISTS "Users can delete activity logs for their buckets" ON activity_logs;

-- Create policies
CREATE POLICY "Users can view activity logs for their buckets"
  ON activity_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM buckets WHERE id = activity_logs.bucket_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM bucket_shares WHERE bucket_id = activity_logs.bucket_id AND shared_with_email = (auth.jwt() ->> 'email') AND status = 'accepted'
    )
  );

CREATE POLICY "Users can insert activity logs for their buckets"
  ON activity_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM buckets WHERE id = activity_logs.bucket_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM bucket_shares WHERE bucket_id = activity_logs.bucket_id AND shared_with_email = (auth.jwt() ->> 'email') AND status = 'accepted'
    )
  );

CREATE POLICY "Users can delete activity logs for their buckets"
  ON activity_logs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM buckets WHERE id = activity_logs.bucket_id AND user_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM bucket_shares WHERE bucket_id = activity_logs.bucket_id AND shared_with_email = (auth.jwt() ->> 'email') AND status = 'accepted'
    )
  );

-- Create a function to limit activity logs to 20 per bucket
CREATE OR REPLACE FUNCTION limit_activity_logs_per_bucket()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete rows for the current bucket that are not in the top 20 most recent
  DELETE FROM activity_logs
  WHERE bucket_id = NEW.bucket_id
    AND id NOT IN (
      SELECT id
      FROM activity_logs
      WHERE bucket_id = NEW.bucket_id
      ORDER BY created_at DESC
      LIMIT 20
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to run the function after every insert
DROP TRIGGER IF EXISTS enforce_activity_log_limit ON activity_logs;
CREATE TRIGGER enforce_activity_log_limit
AFTER INSERT ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION limit_activity_logs_per_bucket();

-- Create a function and trigger to limit deleted transactions to 20 per bucket
CREATE OR REPLACE FUNCTION limit_deleted_transactions_per_bucket()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act if a transaction was just soft-deleted
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM transactions
    WHERE bucket_id = NEW.bucket_id
      AND deleted_at IS NOT NULL
      AND id NOT IN (
        SELECT id
        FROM transactions
        WHERE bucket_id = NEW.bucket_id
          AND deleted_at IS NOT NULL
        ORDER BY deleted_at DESC
        LIMIT 20
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_deleted_transactions_limit ON transactions;
CREATE TRIGGER enforce_deleted_transactions_limit
AFTER UPDATE ON transactions
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION limit_deleted_transactions_per_bucket();

-- Update bucket_shares constraint to allow 'transfer' access level
-- Run this in your Supabase SQL Editor if you get a "check constraint" error
ALTER TABLE bucket_shares 
DROP CONSTRAINT IF EXISTS bucket_shares_access_level_check;

ALTER TABLE bucket_shares 
ADD CONSTRAINT bucket_shares_access_level_check 
CHECK (access_level IN ('view', 'edit', 'transfer'));

-- Allow recipients to delete bucket shares (reject transfers)
DROP POLICY IF EXISTS "Users can delete shares sent to them" ON bucket_shares;
CREATE POLICY "Users can delete shares sent to them"
  ON bucket_shares FOR DELETE
  USING (shared_with_email = (auth.jwt() ->> 'email'));

-- Allow recipients of a transfer to update the bucket's owner
DROP POLICY IF EXISTS "Users can update buckets they are receiving" ON buckets;
CREATE POLICY "Users can update buckets they are receiving"
  ON buckets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM bucket_shares 
      WHERE bucket_id = buckets.id 
      AND shared_with_email = (auth.jwt() ->> 'email')
      AND access_level = 'transfer'
      AND status = 'pending'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- RPC Function to safely accept a bucket transfer (bypasses RLS complexities)
CREATE OR REPLACE FUNCTION accept_bucket_transfer(share_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_id UUID;
  v_shared_with_email TEXT;
  v_shared_by_email TEXT;
BEGIN
  -- Get the share details
  SELECT bucket_id, shared_with_email, shared_by_email 
  INTO v_bucket_id, v_shared_with_email, v_shared_by_email
  FROM bucket_shares
  WHERE id = share_id AND access_level = 'transfer' AND status = 'pending';

  -- Verify the share exists and belongs to the calling user
  IF v_bucket_id IS NULL OR lower(v_shared_with_email) != lower(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Transfer request not found or unauthorized';
  END IF;

  -- 1. Update the bucket owner
  UPDATE buckets 
  SET user_id = auth.uid() 
  WHERE id = v_bucket_id;

  -- 2. Delete the transfer request
  DELETE FROM bucket_shares WHERE id = share_id;

  -- 3. Create an editor share for the previous owner
  INSERT INTO bucket_shares (bucket_id, shared_by_email, shared_with_email, access_level, status)
  VALUES (v_bucket_id, v_shared_with_email, v_shared_by_email, 'edit', 'accepted');

  RETURN TRUE;
END;
$$;

-- RPC Function to safely reject a bucket transfer
CREATE OR REPLACE FUNCTION reject_bucket_transfer(share_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shared_with_email TEXT;
BEGIN
  SELECT shared_with_email INTO v_shared_with_email
  FROM bucket_shares
  WHERE id = share_id AND access_level = 'transfer' AND status = 'pending';

  IF v_shared_with_email IS NULL OR lower(v_shared_with_email) != lower(auth.jwt() ->> 'email') THEN
    RAISE EXCEPTION 'Transfer request not found or unauthorized';
  END IF;

  DELETE FROM bucket_shares WHERE id = share_id;
  RETURN TRUE;
END;
$$;

-- These functions are no longer needed as auto-deletion is handled by `limit_activity_logs_per_bucket` and `limit_deleted_transactions_per_bucket` functions and triggers.
-- Keeping placeholders for previously named functions if needed for cleanup.
DROP FUNCTION IF EXISTS purge_expired_transactions();
DROP FUNCTION IF EXISTS purge_old_activity_logs();

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (display_name ILIKE '%admin%' OR email = 'nileshtiwari2441996@gmail.com')
  );
END;
$$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_bucket_id ON transactions(bucket_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_bucket_id ON categories(bucket_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_bucket_id ON activity_logs(bucket_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow users to view any profile they interact with (bucket owners or collaborators)
DROP POLICY IF EXISTS "Users can view relevant profiles" ON profiles;
CREATE POLICY "Users can view relevant profiles"
  ON profiles FOR SELECT
  USING (true); -- Everyone can see names, strictly for display UI

-- Allow users to manage their own profile
DROP POLICY IF EXISTS "Users can manage own profile" ON profiles;
CREATE POLICY "Users can manage own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view buckets they own or are shared with"
  ON buckets FOR SELECT
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM bucket_shares 
      WHERE bucket_id = buckets.id 
      AND shared_with_email = (auth.jwt() ->> 'email')
      -- Allow seeing the bucket if share is accepted OR it's a pending transfer
      AND (status = 'accepted' OR access_level = 'transfer')
    )
  );

-- Ensure all transactions (past and present) are visible to shared users
DROP POLICY IF EXISTS "Users can view transactions for their buckets" ON transactions;
CREATE POLICY "Users can view transactions for their buckets"
  ON transactions FOR SELECT
  USING (
    user_id = auth.uid() OR 
    EXISTS (
      SELECT 1 FROM bucket_shares 
      WHERE bucket_id = transactions.bucket_id 
      AND shared_with_email = (auth.jwt() ->> 'email')
      AND status = 'accepted'
    )
  );
