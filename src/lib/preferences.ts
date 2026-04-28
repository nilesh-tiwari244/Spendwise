import { useState, useEffect } from 'react';
import { supabase } from './supabase';

export interface BucketPreferences {
  alias?: string;
  color?: string;
}

export function useBucketPreferences(userId: string | undefined) {
  const [prefs, setPrefs] = useState<Record<string, BucketPreferences>>({});

  useEffect(() => {
    if (!userId) return;
    
    // 1. Load from localStorage for immediate UI response
    const localData = localStorage.getItem(`bucket_prefs_${userId}`);
    if (localData) {
      try {
        setPrefs(JSON.parse(localData));
      } catch (e) {
        console.error('Failed to parse local bucket preferences', e);
      }
    }

    // 2. Sync from Supabase user_metadata for cross-device consistency
    async function syncFromSupabase() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        
        if (user?.user_metadata?.bucket_prefs) {
          const remotePrefs = user.user_metadata.bucket_prefs;
          setPrefs(remotePrefs);
          // Keep local storage in sync
          localStorage.setItem(`bucket_prefs_${userId}`, JSON.stringify(remotePrefs));
        }
      } catch (e) {
        console.error('Failed to sync bucket preferences from Supabase', e);
      }
    }

    syncFromSupabase();
  }, [userId]);

  const updatePreference = async (bucketId: string, newPrefs: BucketPreferences) => {
    setPrefs(prev => {
      const updated = {
        ...prev,
        [bucketId]: { ...(prev[bucketId] || {}), ...newPrefs }
      };
      
      if (userId) {
        // Update local storage immediately
        localStorage.setItem(`bucket_prefs_${userId}`, JSON.stringify(updated));
        
        // Update Supabase in the background to persist across devices
        supabase.auth.updateUser({
          data: { bucket_prefs: updated }
        }).catch(e => {
          console.error('Failed to persist bucket preferences to Supabase', e);
        });
      }
      
      return updated;
    });
  };

  return { prefs, updatePreference };
}
