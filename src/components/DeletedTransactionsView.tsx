import React, { useState } from 'react';
import { supabase, type Transaction, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn, formatUserDisplay, truncateRemarks, getDateParts } from '../lib/utils';
import { ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { logActivity } from '../lib/activity';
import { ConfirmationModal } from './ConfirmationModal';

interface DeletedTransactionsViewProps {
  buckets: Bucket[];
  shares: BucketShare[];
  profiles: Record<string, string>;
  onBack: () => void;
  onSuccess: () => void;
  onViewTransaction: (transaction: Transaction) => void;
}

export function DeletedTransactionsView({ buckets, shares, profiles, onBack, onSuccess, onViewTransaction }: DeletedTransactionsViewProps) {
  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRestore, setConfirmingRestore] = useState<string | null>(null);

  const fetchDeleted = async () => {
    setIsInitialLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (fetchError) throw fetchError;
      setDeletedTransactions(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsInitialLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDeleted();
  }, []);

  const handleRestore = async (id: string) => {
    const transaction = deletedTransactions.find(t => t.id === id);
    if (!transaction) return;

    setLoading(id);
    setError(null);
    try {
      const { error: restoreError } = await supabase
        .from('transactions')
        .update({ deleted_at: null })
        .eq('id', id);

      if (restoreError) throw restoreError;
      await logActivity(transaction.bucket_id, 'transaction_restored', { remarks: transaction.remarks });
      setConfirmingRestore(null);
      fetchDeleted();
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <ConfirmationModal
        isOpen={!!confirmingRestore}
        title="Restore Transaction?"
        message="This transaction will be moved back to its original bucket and affect the balances."
        onConfirm={() => confirmingRestore && handleRestore(confirmingRestore)}
        onCancel={() => setConfirmingRestore(null)}
        isLoading={!!loading}
      />
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter">Recycle Bin</h2>
      </div>

      {error && (
        <p className="text-red-600 text-xs font-bold uppercase">{error}</p>
      )}

      <div className="space-y-3">
        {isInitialLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4 brutal-card bg-zinc-50 border-dashed">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
            <div className="text-[10px] font-black uppercase text-zinc-400 tracking-widest leading-none">Searching the bin...</div>
          </div>
        ) : deletedTransactions.length === 0 ? (
          <div className="text-center py-20 brutal-card bg-zinc-100 border-dashed">
            <p className="text-[10px] font-black uppercase text-zinc-400">Recycle bin is empty</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deletedTransactions.map((t) => {
              const bucket = buckets.find(b => b.id === t.bucket_id);
              const dateParts = getDateParts(t.date);
              const bucketShares = shares.filter(s => s.bucket_id === t.bucket_id && s.status === 'accepted');
              const activeEmails = bucketShares.map(s => s.shared_with_email);
              const ownerEmail = bucketShares[0]?.shared_by_email || '';

              // Format the deleted_at timestamp
              let formattedDeletedDate = '';
              if (t.deleted_at) {
                const d = new Date(t.deleted_at);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                formattedDeletedDate = `${timeStr} ${dateStr}`;
              }

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={t.id}
                  className="brutal-card pl-1 pr-4 py-1 bg-white space-y-4 cursor-pointer hover:bg-zinc-50 transition-colors"
                  onClick={() => onViewTransaction(t)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {/* Date Block */}
                      <div className={cn(
                        "w-14 h-[72px] border-2 border-zinc-900 flex-shrink-0 flex flex-col items-center justify-center font-black leading-[1.1] text-zinc-900",
                        t.type === 'Credit' ? "bg-green-100" : "bg-red-100"
                      )}>
                        <span className="text-base">{dateParts.day}</span>
                        <span className="text-xs uppercase">{dateParts.month}</span>
                        <span className="text-xs">{dateParts.year}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-0.5">
                          {/* Category Box and Bucket */}
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-[8px] font-black uppercase bg-zinc-900 text-white px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                              {bucket?.name || 'No Bucket'}
                            </span>
                            <div className="border-2 border-zinc-900 px-2 py-0.5 inline-block text-[10px] font-black text-zinc-600 bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                              {t.category?.name || '---'}
                            </div>
                            <span className="text-[8px] font-black uppercase bg-red-100 text-red-600 px-1 border border-red-600 flex-shrink-0">Deleted</span>
                          </div>
                          
                          {/* Remarks */}
                          <div className="font-black text-base leading-tight truncate text-zinc-900">
                            {truncateRemarks(t.remarks) || 'No Remarks'}
                          </div>

                          {/* Added By */}
                          {t.last_edited_by && (
                            <div className="text-[10px] font-black uppercase text-zinc-500 break-all">
                              ADDED BY:- {formatUserDisplay(t.last_edited_by, ownerEmail, activeEmails, profiles)}
                            </div>
                          )}

                          {/* Deleted On (New Addition) */}
                          {t.deleted_at && (
                            <div className="text-[10px] font-black uppercase text-red-500 break-all">
                              DELETED ON:- {formattedDeletedDate}
                            </div>
                          )}
                        </div>
                     </div> 
                    </div>

                    <div className={cn(
                      "font-black text-xl tracking-tight whitespace-nowrap flex-shrink-0",
                      t.type === 'Credit' ? "text-green-600" : "text-red-600"
                    )}>
                      {t.type === 'Credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t-2 border-zinc-50">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingRestore(t.id);
                      }}
                      disabled={!!loading}
                      className="w-full py-2 border-2 border-zinc-900 bg-zinc-900 text-white text-[10px] font-black uppercase flex items-center justify-center gap-1 hover:bg-zinc-800 transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                    >
                      {loading === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore Transaction
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}