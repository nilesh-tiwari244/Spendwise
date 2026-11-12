import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Category names are matched across buckets ignoring capitals and spaces at
// either end, so "Dining", "dining" and "Dining " count as one category.
export const normalizeCategoryName = (name: string) => name.trim().toLowerCase();

const ACCOUNT_KEY = 'tracker_categories';

// One entry per name, trimmed, in the order they were added.
const cleanNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    const key = normalizeCategoryName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
};

export type TrackerSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// The categories picked in Tracker. They are saved to the user's account
// (user_metadata, next to bucket colours and names) so every device shows the
// same list, with a copy on this device so the list shows straight away.
export function useTrackedCategories(userId: string | undefined) {
  const [names, setNames] = useState<string[]>([]);
  const [status, setStatus] = useState<TrackerSaveStatus>('idle');
  const namesRef = useRef<string[]>([]);
  // Set once the list is changed on this screen, so a slower copy arriving
  // from the account afterwards can't put back what was just removed.
  const changedHereRef = useRef(false);
  const saveSeqRef = useRef(0);

  const show = (next: string[]) => {
    namesRef.current = next;
    setNames(next);
  };

  useEffect(() => {
    if (!userId) return;
    changedHereRef.current = false;
    const localKey = `${ACCOUNT_KEY}_${userId}`;
    try {
      const local = localStorage.getItem(localKey);
      if (local) show(cleanNames(JSON.parse(local)));
    } catch (e) {
      console.error('Failed to read tracked categories on this device', e);
    }

    let cancelled = false;
    const applyFromAccount = (value: unknown) => {
      // No list saved to the account yet: keep this device's copy.
      if (cancelled || changedHereRef.current || !Array.isArray(value)) return;
      const next = cleanNames(value);
      show(next);
      try { localStorage.setItem(localKey, JSON.stringify(next)); } catch (e) { /* storage full or blocked */ }
    };

    (async () => {
      try {
        // The session on this device already carries the account's copy.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        applyFromAccount(session.user?.user_metadata?.[ACCOUNT_KEY]);
        // Then the latest copy, in case another device changed it. Passing
        // the token keeps this off the auth lock that data requests use.
        const { data: { user }, error } = await supabase.auth.getUser(session.access_token);
        if (error) throw error;
        applyFromAccount(user?.user_metadata?.[ACCOUNT_KEY]);
      } catch (e) {
        console.error('Failed to load tracked categories from the account', e);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const save = (next: string[]) => {
    if (!userId) return;
    changedHereRef.current = true;
    show(next);
    try { localStorage.setItem(`${ACCOUNT_KEY}_${userId}`, JSON.stringify(next)); } catch (e) { /* storage full or blocked */ }
    const seq = ++saveSeqRef.current;
    setStatus('saving');
    // Saves run one after another (the auth client queues them), so the
    // last change made is the one the account keeps.
    supabase.auth.updateUser({ data: { [ACCOUNT_KEY]: next } })
      .then(({ error }) => {
        if (seq !== saveSeqRef.current) return;
        if (error) throw error;
        setStatus('saved');
      })
      .catch(e => {
        if (seq === saveSeqRef.current) setStatus('error');
        console.error('Failed to save tracked categories to the account', e);
      });
  };

  const add = (name: string) => {
    const trimmed = name.trim();
    const key = normalizeCategoryName(trimmed);
    if (!key || namesRef.current.some(n => normalizeCategoryName(n) === key)) return;
    save([...namesRef.current, trimmed]);
  };

  const remove = (name: string) => {
    const key = normalizeCategoryName(name);
    save(namesRef.current.filter(n => normalizeCategoryName(n) !== key));
  };

  return { names, status, add, remove };
}
