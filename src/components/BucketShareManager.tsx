import React, { useState, useEffect, useMemo } from 'react';
import { supabase, type Bucket, type BucketShare } from '../lib/supabase';
import { X, Plus, Loader2, Trash2, Mail, Shield, ShieldAlert, RotateCcw, Send, XCircle } from 'lucide-react';
import { logActivity } from '../lib/activity';
import { ConfirmationModal } from './ConfirmationModal';

interface BucketShareManagerProps {
  bucket: Bucket;
  profiles: Record<string, string>;
  onClose: () => void;
  onTransferOwnership: (email: string) => Promise<void>;
  onCancelTransfer: (shareId: string) => Promise<void>;
}

export function BucketShareManager({ bucket, profiles, onClose, onTransferOwnership, onCancelTransfer }: BucketShareManagerProps) {
  const [email, setEmail] = useState('');
  const [accessLevel, setAccessLevel] = useState<'view' | 'edit'>('view');
  const [shares, setShares] = useState<BucketShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareToRemove, setShareToRemove] = useState<BucketShare | null>(null);

  const pendingTransfer = useMemo(() => 
    shares.find(s => s.access_level === 'transfer' && s.status === 'pending'),
    [shares]
  );

  const activeShares = useMemo(() => 
    shares.filter(s => s.access_level !== 'transfer'),
    [shares]
  );

  useEffect(() => {
    fetchShares();
  }, [bucket.id]);

  const fetchShares = async () => {
    const { data, error } = await supabase
      .from('bucket_shares')
      .select('*')
      .eq('bucket_id', bucket.id);
    
    if (data) setShares(data);
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { error } = await supabase
        .from('bucket_shares')
        .insert({
          bucket_id: bucket.id,
          shared_by_email: user.email,
          shared_with_email: email.trim().toLowerCase(),
          access_level: accessLevel,
          status: 'pending'
        });

      if (error) throw error;
      await logActivity(bucket.id, 'invite_sent', { shared_with: email.trim().toLowerCase(), access_level: accessLevel });
      setEmail('');
      fetchShares();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!email.trim() || isTransferring) return;
    setIsTransferring(true);
    setError(null);
    try {
      await onTransferOwnership(email.trim());
      setEmail('');
      fetchShares();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsTransferring(false);
    }
  };

  const confirmRemove = async () => {
    if (!shareToRemove) return;
    
    const isInvite = shareToRemove.status === 'pending';
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .delete()
        .eq('id', shareToRemove.id);
      
      if (error) throw error;
      await logActivity(bucket.id, isInvite ? 'invite_cancelled' : 'user_removed', { email: shareToRemove.shared_with_email });
      fetchShares();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setShareToRemove(null);
    }
  };

  const handleToggleAccess = async (share: BucketShare) => {
    const newLevel = share.access_level === 'view' ? 'edit' : 'view';
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .update({ access_level: newLevel })
        .eq('id', share.id);
      
      if (error) throw error;
      await logActivity(bucket.id, 'access_changed', { email: share.shared_with_email, old_level: share.access_level, new_level: newLevel });
      fetchShares();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-black uppercase tracking-tighter">Share Bucket</h3>
        <button onClick={onClose} className="p-1 border-2 border-zinc-900 bg-zinc-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleShare} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black uppercase mb-1">Email Address</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="brutal-input"
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase mb-1">Access Level</label>
          <div className="flex border-2 border-zinc-900">
            <button
              type="button"
              onClick={() => setAccessLevel('view')}
              className={`flex-1 py-2 text-xs font-black uppercase transition-all ${accessLevel === 'view' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'}`}
            >
              View Only
            </button>
            <button
              type="button"
              onClick={() => setAccessLevel('edit')}
              className={`flex-1 py-2 text-xs font-black uppercase transition-all ${accessLevel === 'edit' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'}`}
            >
              Can Edit
            </button>
          </div>
        </div>

        {pendingTransfer ? (
          <div className="bg-amber-50 border-2 border-amber-500 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Loader2 className="w-3 h-3 text-amber-600 animate-spin mt-0.5" />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-amber-900 leading-none mb-0.5">Pending Transfer</p>
                <p className="text-[10px] font-bold text-amber-700 truncate">{pendingTransfer.shared_with_email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await onCancelTransfer(pendingTransfer.id);
                fetchShares();
              }}
              className="w-full py-1.5 border-2 border-amber-500 text-amber-700 text-[8px] font-black uppercase hover:bg-amber-100 transition-all flex items-center justify-center gap-1"
            >
              <XCircle className="w-3 h-3" />
              Cancel Transfer
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleTransfer}
            disabled={loading || isTransferring || !email.trim()}
            className="w-full brutal-button bg-white text-zinc-900 flex items-center justify-center gap-2"
          >
            {isTransferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Transfer Ownership
          </button>
        )}

        <button
          type="submit"
          disabled={loading || isTransferring}
          className="w-full brutal-button flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Share Access
        </button>
        {error && <p className="text-red-600 text-[10px] font-bold uppercase">{error}</p>}
      </form>

      <div className="space-y-3">
        <h4 className="text-[10px] font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-1">Current Access</h4>
        <div className="space-y-2">
          {activeShares.length === 0 ? (
            <p className="text-[10px] font-bold uppercase text-zinc-400 text-center py-4">Not shared with anyone</p>
          ) : (
            activeShares.map((s) => (
              <div key={s.id} className="brutal-card p-3 bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 border-2 border-zinc-900 bg-zinc-50 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black truncate max-w-[150px]">{profiles[s.shared_with_email] || s.shared_with_email}</div>
                    <div className="flex items-center gap-1">
                      {s.access_level === 'edit' ? <ShieldAlert className="w-3 h-3 text-zinc-400" /> : <Shield className="w-3 h-3 text-zinc-400" />}
                      <span className="text-[8px] font-black uppercase text-zinc-400">{s.access_level} • {s.status}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleAccess(s)}
                    disabled={loading}
                    className="p-1.5 text-zinc-400 hover:text-zinc-900 transition-all"
                    title="Toggle Access Level"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShareToRemove(s)}
                    disabled={loading}
                    className="p-1.5 text-red-600 hover:bg-red-50 transition-all"
                    title="Remove Access"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={!!shareToRemove}
        title={shareToRemove?.status === 'pending' ? 'Cancel Invitation' : 'Remove Access'}
        message={`Are you sure you want to ${shareToRemove?.status === 'pending' ? 'cancel this invitation' : "remove this user's access"}?`}
        confirmText="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setShareToRemove(null)}
      />
    </div>
  );
}
