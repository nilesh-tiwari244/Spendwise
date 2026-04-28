import { supabase } from './supabase';

export type ActivityAction = 
  | 'bucket_created'
  | 'bucket_archived'
  | 'bucket_restored'
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_cancelled'
  | 'access_changed'
  | 'user_removed'
  | 'transaction_added'
  | 'transaction_edited'
  | 'transaction_deleted'
  | 'transaction_restored'
  | 'ownership_transfer_initiated'
  | 'ownership_transfer_cancelled'
  | 'ownership_transfer_accepted';

export async function logActivity(
  bucketId: string,
  action: ActivityAction,
  details: any = {}
) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from('activity_logs').insert({
      bucket_id: bucketId,
      user_id: session.user.id,
      user_email: session.user.email,
      action,
      details
    });
    
    if (error) {
      console.error('Supabase error logging activity:', error);
    }
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}
