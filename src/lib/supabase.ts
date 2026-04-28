import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please check your .env file.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    global: {
      fetch: globalThis.fetch.bind(globalThis),
    },
  }
);

export type Bucket = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  archived_at: string | null;
  original_name?: string;
  color?: string;
};

export type Category = {
  id: string;
  user_id: string;
  bucket_id: string;
  name: string;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  bucket_id: string;
  type: 'Credit' | 'Debit';
  amount: number;
  date: string;
  category_id: string | null;
  remarks: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  last_edited_by?: string;
  category?: Category;
  is_optimistic?: boolean;
};

export type BucketShare = {
  id: string;
  bucket_id: string;
  shared_by_email: string;
  shared_with_email: string;
  access_level: 'view' | 'edit' | 'transfer';
  status: 'pending' | 'accepted';
  created_at: string;
  bucket?: Bucket;
};

export type ActivityLog = {
  id: string;
  bucket_id: string;
  user_id: string;
  user_email: string;
  action: string;
  details: any;
  created_at: string;
};
