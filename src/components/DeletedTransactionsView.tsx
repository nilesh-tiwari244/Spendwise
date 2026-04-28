import React, { useMemo, useState } from 'react';
import { supabase, type Transaction } from '../lib/supabase';
import { formatCurrency, formatDate, cn, truncateRemarks, getDateParts } from '../lib/utils';
import { ArrowLeft, RotateCcw, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { logActivity } from '../lib/activity';
import { ConfirmationModal } from './ConfirmationModal';

interface DeletedTransactionsViewProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function DeletedTransactionsView({ onBack, onSuccess }: DeletedTransactionsViewProps) {
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
        .order('deleted_at', { ascending: false })
        .limit(20);

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

      <div className="bg-amber-50 border-2 border-amber-500 p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        <p className="text-[10px] font-bold uppercase text-amber-700 leading-tight">
          To save database space, only the last 20 deleted transactions are kept here. Older ones are automatically deleted.
        </p>
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
              const dateParts = getDateParts(t.date);
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={t.id}
                  className="brutal-card pl-1 pr-4 py-1 bg-white space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      {/* Date Block */}
                      <div className="w-14 h-[72px] border-2 border-zinc-900 flex-shrink-0 flex flex-col items-center justify-center font-black leading-[1.1] text-zinc-900 bg-zinc-100">
                        <span className="text-base">{dateParts.day}</span>
                        <span className="text-xs uppercase">{dateParts.month}</span>
                        <span className="text-xs">{dateParts.year}</span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col gap-0.5">
                          {/* Category Box */}
                          <div className="border-2 border-zinc-900 px-2 py-0.5 inline-block text-[10px] font-black text-zinc-500 bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] self-start mb-0.5">
                            {t.category?.name || '---'}
                          </div>
                          
                          {/* Remarks */}
                          <div className="font-black text-base leading-tight truncate text-zinc-400">
                            {truncateRemarks(t.remarks) || 'No Remarks'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="font-black text-xl tracking-tight text-zinc-400 flex-shrink-0">
                      {formatCurrency(t.amount)}
                    </div>
                  </div>

                  <div className="flex gap-2 pt-3 border-t-2 border-zinc-50">
                    <button
                      onClick={() => setConfirmingRestore(t.id)}
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
