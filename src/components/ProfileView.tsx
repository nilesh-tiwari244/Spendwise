import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, User, Loader2, Save, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';

interface ProfileViewProps {
  session: any;
  onBack: () => void;
  onUpdateName: (name: string) => void;
}

export function ProfileView({ session, onBack, onUpdateName }: ProfileViewProps) {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (data?.display_name) {
        setDisplayName(data.display_name);
      }
    } catch (err: any) {
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          email: session.user.email,
          display_name: displayName.trim(),
          updated_at: new Date().toISOString()
        });

      if (upsertError) throw upsertError;
      
      onUpdateName(displayName.trim());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter">Profile Settings</h2>
      </div>

      <div className="brutal-card bg-white p-6 space-y-6">
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="text-[10px] font-black uppercase text-zinc-400">Account Email</div>
            <div className="font-bold text-sm text-zinc-900">{session.user.email}</div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your full name"
              className="brutal-input"
              required
              minLength={2}
              maxLength={50}
            />
            <p className="mt-2 text-[10px] text-zinc-400 font-bold uppercase">
              This name will be shown on transactions you add or edit.
            </p>
          </div>

          {error && (
            <p className="text-red-600 text-[10px] font-black uppercase italic">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving || loading}
            className="w-full brutal-button flex items-center justify-center gap-3 bg-zinc-900 text-white"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : success ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Updated Successfully
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Changes
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
