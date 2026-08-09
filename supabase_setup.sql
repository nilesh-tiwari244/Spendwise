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

-- Prevent duplicate category names (case-insensitive) within the same bucket.
-- Different buckets may still reuse the same category name.
-- NOTE: if this fails with a "duplicate key" error, you have pre-existing
-- duplicate category names in some bucket - rename/merge them first, then re-run.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_bucket_id_lower_name
  ON categories (bucket_id, lower(name));

-- ============================================================================
-- SECURITY AUDIT FIXES (2026-08-09) - found by querying pg_policies directly
-- against production. See conversation history for full findings/severities.
-- ============================================================================

-- CRITICAL: transaction_history had "qual = true" (Supabase Studio's default
-- "Enable read access for all users" template, left unmodified) - any
-- signed-up user could read any other user's transaction edit history by
-- transaction_id, bypassing the entire bucket-ownership/sharing model. Scope
-- it through the parent transaction the same way transactions itself is.
DROP POLICY IF EXISTS "Enable read access for all users" ON transaction_history;
CREATE POLICY "Users can view history for their own or shared transactions"
  ON transaction_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_history.transaction_id
      AND (
        t.user_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM bucket_shares bs
          WHERE bs.bucket_id = t.bucket_id
          AND bs.shared_with_email = (auth.jwt() ->> 'email')
          AND bs.status = 'accepted'
        )
      )
    )
  );

-- CRITICAL: the storage.objects INSERT policy on the 'receipts' bucket had no
-- auth check at all (with_check = bucket_id = 'receipts') - anyone with the
-- public anon key (visible in the client bundle) could upload arbitrary files
-- with zero login. The other four "folder = private" policies never actually
-- applied because the app uploads to `${user.id}/...`, not `private/...`, so
-- they were dead weight. Replace all five with policies scoped to the path
-- convention the app actually uses.
DROP POLICY IF EXISTS "uploadauth 1lnm9mj_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder 1lnm9mj_0" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder 1lnm9mj_1" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder 1lnm9mj_2" ON storage.objects;
DROP POLICY IF EXISTS "Give users authenticated access to folder 1lnm9mj_3" ON storage.objects;

CREATE POLICY "Users can upload their own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own receipt objects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
-- NOTE: the receipts bucket itself is public=true, so image URLs are already
-- readable by anyone with the link regardless of this SELECT policy (public
-- buckets bypass RLS for the public URL endpoint). This policy only matters
-- if you later flip the bucket to private and switch the app from
-- getPublicUrl() to createSignedUrl().

CREATE POLICY "Users can update their own receipt objects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own receipt objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- MEDIUM: the 20-log cap trigger silently deletes 0 rows in production
-- because activity_logs is missing the DELETE policy this file already
-- defines above - re-asserting it here so it's easy to find/re-run.
DROP POLICY IF EXISTS "Users can delete activity logs for their buckets" ON activity_logs;
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

-- MEDIUM: categories' shared-editor ALL policy had no WITH CHECK, so a
-- shared editor could insert a category with a spoofed user_id (defaulted to
-- the USING clause, which never constrains the new row's user_id).
-- IMPORTANT: this must be split into per-command policies rather than one
-- ALL policy with a WITH CHECK - a single WITH CHECK applies to both INSERT
-- and UPDATE, and renaming a category (CategoryManagerView's handleUpdate)
-- never touches user_id, so requiring auth.uid() = user_id on UPDATE would
-- wrongly reject a shared editor renaming a category someone else created.
DROP POLICY IF EXISTS "Users can manage categories in shared buckets with edit access" ON categories;

CREATE POLICY "Shared editors can insert categories with edit access"
  ON categories FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (SELECT 1 FROM buckets WHERE buckets.id = categories.bucket_id AND buckets.user_id = auth.uid()) OR
      EXISTS (
        SELECT 1 FROM bucket_shares
        WHERE bucket_shares.bucket_id = categories.bucket_id
        AND bucket_shares.shared_with_email = (auth.jwt() ->> 'email')
        AND bucket_shares.status = 'accepted'
        AND bucket_shares.access_level = 'edit'
      )
    )
  );

CREATE POLICY "Shared editors can update categories with edit access"
  ON categories FOR UPDATE
  USING (
    (auth.uid() = user_id) OR
    EXISTS (SELECT 1 FROM buckets WHERE buckets.id = categories.bucket_id AND buckets.user_id = auth.uid()) OR
    EXISTS (
      SELECT 1 FROM bucket_shares
      WHERE bucket_shares.bucket_id = categories.bucket_id
      AND bucket_shares.shared_with_email = (auth.jwt() ->> 'email')
      AND bucket_shares.status = 'accepted'
      AND bucket_shares.access_level = 'edit'
    )
  );

CREATE POLICY "Shared editors can delete categories with edit access"
  ON categories FOR DELETE
  USING (
    (auth.uid() = user_id) OR
    EXISTS (SELECT 1 FROM buckets WHERE buckets.id = categories.bucket_id AND buckets.user_id = auth.uid()) OR
    EXISTS (
      SELECT 1 FROM bucket_shares
      WHERE bucket_shares.bucket_id = categories.bucket_id
      AND bucket_shares.shared_with_email = (auth.jwt() ->> 'email')
      AND bucket_shares.status = 'accepted'
      AND bucket_shares.access_level = 'edit'
    )
  );
-- (SELECT is untouched - "Users can see categories in shared buckets" already
-- covers it and isn't being dropped here.)

-- CRITICAL (found while re-checking the fix above): categories and
-- transactions each have a redundant pair of narrow INSERT policies whose
-- WITH CHECK is only `auth.uid() = user_id` - they never verify the target
-- bucket_id belongs to a bucket the inserter owns or has edit access to.
-- Since permissive policies OR together, this lets ANY signed-up user insert
-- fake categories or transactions into ANY OTHER USER'S bucket, with no
-- sharing relationship required, by setting user_id to themselves and
-- bucket_id to someone else's bucket. For transactions this means a stranger
-- can inject fabricated debits/credits into any victim's balance. These two
-- policies per table add no legitimate capability beyond what the properly
-- bucket-scoped policies already allow (confirmed above/elsewhere in this
-- file), so they are simply dropped, not replaced.
DROP POLICY IF EXISTS "Users can only insert their own categories" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "Users can only insert their own transactions" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;

-- HIGH (deferred earlier, now being fixed): profiles had two SELECT policies
-- both with qual = true - any signed-up user could read every other user's
-- email address via a full user-directory scrape. App.tsx's bulk
-- `select('id, email, display_name')` (no .eq filter) relies entirely on RLS
-- to scope this down, so tighten the policy rather than the query. Scoped to
-- "you, or anyone you share a bucket with in either direction" so this
-- requires NO app code changes: last_edited_by lookups, pending-invite
-- inviter names, and collaborator display names are all mediated through
-- bucket_shares already, so anyone who could legitimately show up in the
-- current profiles map still will. Status is intentionally not filtered -
-- pending invites need to show the inviter's name before being accepted.
DROP POLICY IF EXISTS "Users can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view relevant profiles" ON profiles;

-- FOLLOW-UP: the bucket_shares-only version above missed a real case -
-- DashboardView/ActivityLogView show "ADDED BY: <name> (Removed)" for past
-- collaborators whose bucket_shares row was later hard-deleted (declining/
-- removing a share does a real DELETE, not a status change - see
-- BucketsHomeView's handleDeclineShare). Once that row is gone there's no
-- bucket_shares trace left, so those historical attributions silently fell
-- back to a raw email instead of the display name. Also, bucket_shares only
-- ever records owner<->sharee pairs, never sharee<->sharee, so a view-only
-- collaborator (e.g. Roy Gemini) never had a direct bucket_shares row with a
-- co-editor (e.g. Binita/Nikita) to begin with, regardless of removal.
-- Widen it: also allow seeing a profile if that email/id shows up as the
-- actor on a transaction or activity log in a bucket you can currently see
-- (owned by you, or shared with you at any access level) - this covers
-- "anyone who's ever touched data you have access to" without reopening the
-- full user directory.
CREATE POLICY "Users can view relevant profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM bucket_shares bs
      WHERE (bs.shared_by_email = (auth.jwt() ->> 'email') AND bs.shared_with_email = profiles.email)
         OR (bs.shared_with_email = (auth.jwt() ->> 'email') AND bs.shared_by_email = profiles.email)
    )
    OR EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.last_edited_by = profiles.email
      AND (
        EXISTS (SELECT 1 FROM buckets b WHERE b.id = t.bucket_id AND b.user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM bucket_shares bs2
          WHERE bs2.bucket_id = t.bucket_id
          AND bs2.shared_with_email = (auth.jwt() ->> 'email')
          AND bs2.status = 'accepted'
        )
      )
    )
    OR EXISTS (
      SELECT 1 FROM activity_logs al
      WHERE (al.user_email = profiles.email OR al.user_id = profiles.id)
      AND (
        EXISTS (SELECT 1 FROM buckets b WHERE b.id = al.bucket_id AND b.user_id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM bucket_shares bs3
          WHERE bs3.bucket_id = al.bucket_id
          AND bs3.shared_with_email = (auth.jwt() ->> 'email')
          AND bs3.status = 'accepted'
        )
      )
    )
  );

-- ============================================================================
-- SIGNUP: mandatory display name (2026-08-09)
-- ============================================================================
-- The signup form now collects a display name and passes it via
-- supabase.auth.signUp's options.data, which lands in auth.users'
-- raw_user_meta_data immediately - even before email confirmation, when
-- there's no authenticated session yet for the client to write its own
-- `profiles` row (RLS would reject an anonymous insert). This trigger
-- creates the profiles row itself, as the table owner, the moment the
-- auth.users row is created, so every new signup has a profile with a
-- display name from day one with no separate "please set a name" step.
-- SET search_path guards against search_path hijacking in SECURITY DEFINER
-- functions (Postgres/Supabase best practice).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Character-length backstop for profiles, matching the client-side
-- minLength/maxLength on the signup and profile-settings forms. Allows NULL
-- so existing rows without a display_name aren't broken by this migration -
-- the client already makes display_name mandatory going forward.
-- NOT VALID: fully enforced on every future insert/update, but skips
-- checking pre-existing rows against it, so this can't fail against
-- historical data we haven't audited. Run VALIDATE CONSTRAINT separately
-- later if you want to confirm/clean up old data too.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_display_name_length_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_display_name_length_check
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 50) NOT VALID;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_email_length_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_email_length_check
  CHECK (char_length(email) <= 254) NOT VALID;
