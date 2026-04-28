import React, { useMemo } from 'react';
import { type Transaction, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, formatDate, cn, formatUserDisplay, truncateRemarks, getDateParts } from '../lib/utils';
import { ArrowLeft, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface RecentlyAddedViewProps {
  transactions: Transaction[];
  buckets: Bucket[];
  shares: BucketShare[];
  profiles: Record<string, string>;
  onBack: () => void;
  onViewTransaction: (transaction: Transaction) => void;
}

export function RecentlyAddedView({ transactions, buckets, shares, profiles, onBack, onViewTransaction }: RecentlyAddedViewProps) {
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 100);
  }, [transactions]);

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">Recently Added</h2>
          <span className="text-[10px] font-black uppercase text-zinc-400 mt-1">Last 100 transactions by entry time</span>
        </div>
      </div>

      <div className="space-y-3">
        {recentTransactions.length === 0 ? (
          <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
            <p className="text-xs font-bold uppercase text-zinc-400">No transactions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((t) => {
              const bucket = buckets.find(b => b.id === t.bucket_id);
              const dateParts = getDateParts(t.date);
              const bucketShares = shares.filter(s => s.bucket_id === t.bucket_id && s.status === 'accepted');
              const activeEmails = bucketShares.map(s => s.shared_with_email);
              const ownerEmail = bucketShares[0]?.shared_by_email || '';

              return (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={t.id}
                  className={cn(
                    "brutal-card pl-1 pr-4 py-1 flex items-start justify-between gap-2 cursor-pointer hover:bg-zinc-50 transition-colors",
                    t.deleted_at && "opacity-60 bg-zinc-100"
                  )}
                  onClick={() => onViewTransaction(t)}
                >
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[8px] font-black uppercase bg-zinc-900 text-white px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                            {bucket?.name || 'No Bucket'}
                          </span>
                          <div className="border-2 border-zinc-900 px-2 py-0.5 inline-block text-[10px] font-black text-zinc-600 bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                            {t.category?.name || '---'}
                          </div>
                          {t.deleted_at && (
                            <span className="text-[8px] font-black uppercase bg-red-100 text-red-600 px-1 border border-red-600 flex-shrink-0">Deleted</span>
                          )}
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
                      </div>
                    </div>
                  </div>

                  <div className={cn(
                    "font-black text-xl tracking-tight whitespace-nowrap flex-shrink-0",
                    t.type === 'Credit' ? "text-green-600" : "text-red-600"
                  )}>
                    {t.type === 'Credit' ? '+' : '-'}{formatCurrency(t.amount)}
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
