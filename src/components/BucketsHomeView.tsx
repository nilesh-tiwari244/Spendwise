import React, { useState, useMemo } from 'react';
import { supabase, type Bucket, type Transaction, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn } from '../lib/utils';
import { Plus, Loader2, Edit2, Wallet, Share2, Mail, Check, X, Archive, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BucketShareManager } from './BucketShareManager';
import { logActivity } from '../lib/activity';

interface BucketsHomeViewProps {
  buckets: Bucket[];
  bucketTotals: Record<string, number>;
  grandTotal: number;
  orphanedCount: number;
  shares: BucketShare[];
  pendingShares: BucketShare[];
  userId: string;
  userEmail: string;
  profiles: Record<string, string>;
  onSelectBucket: (bucket: Bucket) => void;
  onRefresh: () => void;
  onAcceptTransfer: (share: BucketShare) => Promise<void>;
  onRejectTransfer: (shareId: string) => Promise<void>;
  onTransferOwnership: (email: string, bucketId: string) => Promise<void>;
  onCancelTransfer: (shareId: string, bucketId: string) => Promise<void>;
  onUpdatePreference?: (bucketId: string, prefs: { alias?: string, color?: string }) => void;
}

export function BucketsHomeView({ 
  buckets, 
  bucketTotals, 
  grandTotal, 
  orphanedCount, 
  shares, 
  pendingShares, 
  userId, 
  userEmail, 
  profiles,
  onSelectBucket, 
  onRefresh,
  onAcceptTransfer,
  onRejectTransfer,
  onTransferOwnership,
  onCancelTransfer,
  onUpdatePreference
}: BucketsHomeViewProps) {
  const [newBucketName, setNewBucketName] = useState('');
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [editingName, setEditingName] = useState('');
  const [personalAlias, setPersonalAlias] = useState('');
  const [personalColor, setPersonalColor] = useState('#ffffff');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  const pendingInvitations = useMemo(() => 
    pendingShares.filter(s => s.access_level !== 'transfer'),
    [pendingShares]
  );

  const pendingTransfers = useMemo(() => 
    pendingShares.filter(s => s.access_level === 'transfer'),
    [pendingShares]
  );

  const activeBuckets = useMemo(() => {
    return buckets.filter(b => !b.archived_at);
  }, [buckets]);

  const hasRNCReserve = useMemo(() => {
    return activeBuckets.some(b => b.name === 'RNC Reserve');
  }, [activeBuckets]);

  const sortedBuckets = useMemo(() => {
    return [...activeBuckets].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeBuckets]);

  const handleAddBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { error } = await supabase
        .from('buckets')
        .insert({ user_id: user.id, name: newBucketName.trim() });

      if (error) throw error;
      setNewBucketName('');
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveBucket = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('buckets')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      await logActivity(id, 'bucket_archived');
      onRefresh();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
      setShowArchiveConfirm(false);
    }
  };

  const handleUpdateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBucket || !editingName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('buckets')
        .update({ name: editingName.trim() })
        .eq('id', editingBucket.id);

      if (error) throw error;
      setEditingBucket(null);
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptShare = async (shareId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .update({ status: 'accepted' })
        .eq('id', shareId);
      
      if (error) throw error;
      const share = pendingShares.find(s => s.id === shareId);
      if (share) {
        await logActivity(share.bucket_id, 'invite_accepted', { shared_by: share.shared_by_email });
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineShare = async (shareId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .delete()
        .eq('id', shareId);
      
      if (error) throw error;
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTransferLocal = async (share: BucketShare) => {
    setLoading(true);
    setError(null);
    try {
      await onAcceptTransfer(share);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectTransferLocal = async (shareId: string) => {
    setLoading(true);
    setError(null);
    try {
      await onRejectTransfer(shareId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-50 border-2 border-red-500 p-4 text-red-700 text-sm font-bold brutal-card">
          {error}
          <button onClick={() => setError(null)} className="float-right text-red-900 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Pending Ownership Transfers */}
      {pendingTransfers.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-2 flex items-center gap-2 text-amber-600">
            <Send className="w-4 h-4 animate-bounce" />
            Pending Ownership Transfers
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {pendingTransfers.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="brutal-card bg-amber-50 border-amber-500 p-4 space-y-3 shadow-[4px_4px_0px_0px_rgba(245,158,11,1)]"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-tight text-amber-900">
                      {s.bucket?.name || 'Shared Bucket'}
                    </div>
                    <div className="text-[10px] font-bold text-amber-700">
                      From: {profiles[s.shared_by_email] || s.shared_by_email}
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-amber-100 border-2 border-amber-500 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-amber-600" />
                  </div>
                </div>
                <div className="p-2 bg-white/50 border border-amber-200 text-[10px] font-bold text-amber-800 leading-tight italic">
                  "By accepting, you will become the legal owner of this bucket and all its transactions."
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcceptTransferLocal(s);
                    }}
                    disabled={loading}
                    className="flex-1 brutal-button bg-amber-600 text-white py-2 text-[10px] font-black uppercase flex items-center justify-center gap-2 hover:bg-amber-700 active:translate-x-1 active:translate-y-1"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Accept Ownership
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRejectTransferLocal(s.id);
                    }}
                    disabled={loading}
                    className="px-4 brutal-button bg-white text-amber-600 border-amber-600 py-2 text-[10px] font-black uppercase flex items-center justify-center hover:bg-amber-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-2 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Pending Invitations
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {pendingInvitations.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="brutal-card bg-white p-3 flex items-center justify-between border-dashed"
              >
                <div>
                  <div className="text-xs font-black uppercase tracking-tight">
                    {s.bucket?.name || 'Shared Bucket'}
                  </div>
                  <div className="text-[10px] font-bold text-zinc-400">
                    Shared by: {profiles[s.shared_by_email] || s.shared_by_email}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptShare(s.id)}
                    disabled={loading}
                    className="p-2 brutal-card bg-green-500 text-white hover:bg-green-600 transition-all"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeclineShare(s.id)}
                    disabled={loading}
                    className="p-2 brutal-card bg-red-500 text-white hover:bg-red-600 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {orphanedCount > 0 && !hasRNCReserve && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="brutal-card bg-yellow-100 border-yellow-600 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-200 border-2 border-yellow-600 flex items-center justify-center">
              <Plus className="w-5 h-5 text-yellow-700" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase text-yellow-700">Orphaned Data Found</h4>
              <p className="text-[10px] font-bold text-yellow-600 leading-tight">
                Create a bucket named <span className="font-black underline">RNC Reserve</span> to automatically migrate {orphanedCount} old transactions.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Buckets List */}
      <section className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-2">Your Buckets</h3>
        <div className="grid grid-cols-1 gap-3">
          {sortedBuckets.length === 0 ? (
            <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
              <p className="text-xs font-bold uppercase text-zinc-400">No buckets created yet</p>
            </div>
          ) : (
            sortedBuckets.map((b) => (
              <motion.div
                key={b.id}
                whileHover={{ x: 4, filter: 'brightness(0.95)' }}
                className="brutal-card pl-1 pr-4 py-1 flex items-center justify-between group cursor-pointer transition-all"
                style={{ backgroundColor: b.color || '#ffffff' }}
                onClick={() => onSelectBucket(b)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border-2 border-zinc-900 bg-zinc-50 flex items-center justify-center">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm">{b.name}</span>
                        {(shares.some(s => s.bucket_id === b.id) || b.user_id !== userId) && (
                          <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                        )}
                        {shares.some(s => s.bucket_id === b.id && s.access_level === 'transfer' && s.status === 'pending') && (
                          <span className="text-[8px] font-black uppercase bg-amber-100 text-amber-600 px-1 border border-amber-500 animate-pulse">
                            Transfer Pending
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-black tracking-tight text-zinc-600">
                        {formatCurrency(bucketTotals[b.id] || 0)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingBucket(b);
                      setEditingName(b.original_name || b.name);
                      setPersonalAlias(b.name !== b.original_name ? b.name : '');
                      setPersonalColor(b.color || '#ffffff');
                    }}
                    className="p-2 border-2 border-zinc-900 bg-white hover:bg-zinc-50 transition-all"
                    title="Edit / Share"
                  >
                    <Edit2 className="w-4 h-4 text-zinc-900" />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>
      {/* Edit/Share Modal */}
      <AnimatePresence>
        {editingBucket && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEditingBucket(null);
                setShowArchiveConfirm(false);
              }}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white border-4 border-zinc-900 z-50 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-tighter">Edit Bucket</h2>
                <button 
                  onClick={() => {
                    setEditingBucket(null);
                    setShowArchiveConfirm(false);
                  }} 
                  className="p-1 border-2 border-zinc-900 bg-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 mb-8 pb-8 border-b-2 border-zinc-100">
                <div className="bg-zinc-50 p-3 border-2 border-zinc-900">
                  <label className="block text-[10px] font-black uppercase mb-1 text-zinc-500">Original Name (Set by Owner)</label>
                  <div className="font-bold text-sm">{editingBucket.original_name || editingBucket.name}</div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Personal Alias (Only visible to you)</label>
                  <input
                    type="text"
                    placeholder="Leave blank to use original name"
                    value={personalAlias}
                    onChange={(e) => setPersonalAlias(e.target.value)}
                    className="brutal-input w-full"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Personal Background Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={personalColor}
                      onChange={(e) => setPersonalColor(e.target.value)}
                      className="w-12 h-12 p-1 border-2 border-zinc-900 cursor-pointer"
                    />
                    <span className="text-xs font-mono">{personalColor}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onUpdatePreference?.(editingBucket.id, { alias: personalAlias.trim() || undefined, color: personalColor });
                    setEditingBucket(null);
                    setShowArchiveConfirm(false);
                  }}
                  className="w-full brutal-button py-3 text-sm font-black uppercase bg-zinc-900 text-white hover:bg-zinc-800"
                >
                  Save Personal Preferences
                </button>
              </div>

              {editingBucket.user_id === userId && (
                <>
                  <form onSubmit={handleUpdateBucket} className="space-y-4 mb-8 pb-8 border-b-2 border-zinc-100">
                    <div>
                      <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Rename Bucket Globally (Owner Only)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="brutal-input"
                        />
                        <button
                          type="submit"
                          disabled={loading}
                          className="brutal-button px-4 text-xs"
                        >
                          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                        </button>
                      </div>
                    </div>
                  </form>

                  <div className="mb-8 pb-8 border-b-2 border-zinc-100">
                    {!showArchiveConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowArchiveConfirm(true)}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 p-3 border-2 border-zinc-900 bg-white hover:bg-zinc-50 transition-all font-black uppercase text-xs disabled:opacity-50"
                      >
                        <Archive className="w-4 h-4" />
                        Archive Bucket
                      </button>
                    ) : (
                      <div className="space-y-3 p-4 bg-zinc-50 border-2 border-zinc-900">
                        <p className="text-[10px] font-black uppercase text-center">Are you sure? This moves it to Archive.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => editingBucket && handleArchiveBucket(editingBucket.id)}
                            disabled={loading}
                            className="flex-1 brutal-button bg-zinc-900 text-white py-2 text-xs"
                          >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Yes, Archive'}
                          </button>
                          <button
                            onClick={() => setShowArchiveConfirm(false)}
                            disabled={loading}
                            className="flex-1 brutal-button bg-white text-zinc-900 py-2 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {error && (
                      <div className="mt-4 p-3 bg-red-50 border-2 border-red-500 text-red-600 text-[10px] font-bold uppercase">
                        {error}
                      </div>
                    )}
                  </div>

                  <BucketShareManager 
                    bucket={editingBucket} 
                    profiles={profiles}
                    onClose={() => {
                      setEditingBucket(null);
                      setShowArchiveConfirm(false);
                      onRefresh();
                    }} 
                    onTransferOwnership={(email) => onTransferOwnership(email, editingBucket.id)}
                    onCancelTransfer={(shareId) => onCancelTransfer(shareId, editingBucket.id)}
                  />
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
