import React, { useMemo, useState } from 'react';
import { type Bucket, type Transaction, supabase } from '../lib/supabase';
import { formatCurrency, cn } from '../lib/utils';
import { ArrowLeft, Archive, Trash2, RotateCcw, Wallet, Loader2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/activity';

interface ArchiveViewProps {
  buckets: Bucket[];
  transactions: Transaction[];
  onBack: () => void;
  onRefresh: () => void;
}

export function ArchiveView({ buckets, transactions, onBack, onRefresh }: ArchiveViewProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const archivedBuckets = useMemo(() => {
    return buckets.filter(b => b.archived_at);
  }, [buckets]);

  const bucketBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    archivedBuckets.forEach(b => {
      const bucketTrans = transactions.filter(t => t.bucket_id === b.id && !t.deleted_at);
      const balance = bucketTrans.reduce((sum, t) => {
        return t.type === 'Credit' ? sum + t.amount : sum - t.amount;
      }, 0);
      balances[b.id] = balance;
    });
    return balances;
  }, [archivedBuckets, transactions]);

  const handleRestore = async (id: string) => {
    setLoading(id);
    setError(null);
    try {
      const { error } = await supabase
        .from('buckets')
        .update({ archived_at: null })
        .eq('id', id);
      if (error) throw error;
      await logActivity(id, 'bucket_restored');
      onRefresh();
      setConfirmingRestore(null);
    } catch (err: any) {
      setError(err.message);
      console.error(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(id);
    setError(null);
    try {
      const { error } = await supabase
        .from('buckets')
        .delete()
        .eq('id', id);
      if (error) throw error;
      onRefresh();
      setConfirmingDelete(null);
    } catch (err: any) {
      setError(err.message);
      console.error(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">Archive</h2>
          <span className="text-[10px] font-black uppercase text-zinc-400 mt-1">Archived buckets and their data</span>
        </div>
      </div>

      {error && (
        <p className="text-red-600 text-xs font-bold uppercase">{error}</p>
      )}

      <div className="space-y-3">
        {archivedBuckets.length === 0 ? (
          <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
            <p className="text-xs font-bold uppercase text-zinc-400">No archived buckets</p>
          </div>
        ) : (
          <div className="space-y-3">
            {archivedBuckets.map((b) => (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                key={b.id}
                className="brutal-card pl-1 pr-4 py-1 flex items-center justify-between group"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border-2 border-zinc-900 bg-zinc-50 flex items-center justify-center">
                      <Wallet className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-zinc-500">{b.name}</span>
                        <Archive className="w-3 h-3 text-zinc-300" />
                      </div>
                      <div className="text-lg font-black tracking-tight text-zinc-400">
                        {formatCurrency(bucketBalances[b.id])}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <AnimatePresence mode="wait">
                    {confirmingRestore === b.id ? (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-2 bg-zinc-900 p-1 border-2 border-zinc-900"
                      >
                        <span className="text-[8px] font-black uppercase text-white px-2">Restore?</span>
                        <button 
                          onClick={() => handleRestore(b.id)}
                          disabled={loading === b.id}
                          className="p-1 bg-white hover:bg-zinc-100 transition-all"
                        >
                          {loading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-green-600" />}
                        </button>
                        <button 
                          onClick={() => setConfirmingRestore(null)}
                          className="p-1 bg-white hover:bg-zinc-100 transition-all"
                        >
                          <X className="w-3 h-3 text-red-600" />
                        </button>
                      </motion.div>
                    ) : confirmingDelete === b.id ? (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center gap-2 bg-red-600 p-1 border-2 border-red-600"
                      >
                        <span className="text-[8px] font-black uppercase text-white px-2">Delete?</span>
                        <button 
                          onClick={() => handleDelete(b.id)}
                          disabled={loading === b.id}
                          className="p-1 bg-white hover:bg-zinc-100 transition-all"
                        >
                          {loading === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-red-600" />}
                        </button>
                        <button 
                          onClick={() => setConfirmingDelete(null)}
                          className="p-1 bg-white hover:bg-zinc-100 transition-all"
                        >
                          <X className="w-3 h-3 text-zinc-900" />
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2"
                      >
                        <button 
                          onClick={() => setConfirmingRestore(b.id)}
                          className="p-2 border-2 border-zinc-900 bg-white hover:bg-zinc-50 transition-all"
                          title="Restore Bucket"
                        >
                          <RotateCcw className="w-4 h-4 text-zinc-900" />
                        </button>
                        <button 
                          onClick={() => setConfirmingDelete(b.id)}
                          className="p-2 border-2 border-zinc-900 bg-red-50 hover:bg-red-100 transition-all"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
