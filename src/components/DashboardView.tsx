import React, { useMemo, useState, useEffect, useRef } from 'react';
import { supabase, type Transaction, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn, formatDate, formatUserDisplay, truncateRemarks, getDateParts } from '../lib/utils';
import { Plus, Tag, ArrowUpRight, ArrowDownLeft, Edit2, Paperclip, History, Loader2, RefreshCw, ClipboardList } from 'lucide-react';
import { motion } from 'motion/react';

// Helper to determine if text should be light or dark based on background color
function getContrastColor(hexColor: string | undefined): string {
  if (!hexColor || hexColor === '#ffffff' || hexColor === 'transparent') return 'text-zinc-900';
  
  // Remove hash if present
  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  
  // Calculate brightness (YIQ formula)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? 'text-zinc-900' : 'text-white';
}

function TransactionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="brutal-card pl-1 pr-4 py-1 flex items-start justify-between gap-3 animate-pulse bg-white">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 border-2 border-zinc-100 bg-zinc-50 flex-shrink-0 mt-1" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-4 w-16 bg-zinc-100 border border-zinc-50" />
                <div className="h-4 w-24 bg-zinc-50" />
              </div>
              <div className="h-5 w-3/4 bg-zinc-100" />
              <div className="h-3 w-1/2 bg-zinc-50" />
            </div>
          </div>
          <div className="w-20 h-6 bg-zinc-100 mt-1" />
        </div>
      ))}
    </div>
  );
}

interface DashboardViewProps {
  transactions: Transaction[];
  bucket: Bucket;
  shares: BucketShare[];
  ownerEmail: string;
  canEdit: boolean;
  profiles: Record<string, string>;
  isLoading?: boolean;
  onAddClick: () => void;
  onEditTransaction: (transaction: Transaction) => void;
  onViewTransaction: (transaction: Transaction) => void;
  onManageCategories: () => void;
  onViewActivity: () => void;
  onViewSummary: () => void;
  totalBalance: number;
}

export function DashboardView({ 
  transactions, 
  bucket, 
  shares, 
  ownerEmail, 
  canEdit, 
  profiles,
  isLoading,
  onAddClick, 
  onEditTransaction, 
  onViewTransaction, 
  onManageCategories, 
  onViewActivity,
  onViewSummary,
  totalBalance
}: DashboardViewProps) {
  const activeShareEmails = useMemo(() => shares.filter(s => s.bucket_id === bucket.id && s.status === 'accepted').map(s => s.shared_with_email), [shares, bucket.id]);

  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Reset states when bucket changes
  useEffect(() => {
    setLocalTransactions([]);
    setHasMore(true);
    setIsFetchingMore(false);
  }, [bucket.id]);

  // Sync prop transactions (which are the initial 50 or updated from real-time) with local state
  useEffect(() => {
    setLocalTransactions(prev => {
      const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
      
      // Remove optimistic transactions that are no longer in the props
      // (This happens when fetchData completes and replaces the optimistic one with a real one)
      const incomingIds = new Set(transactions.map(t => t.id));
      prev.forEach(t => {
        if (t.is_optimistic && !incomingIds.has(t.id)) {
          map.delete(t.id);
        }
      });

      transactions.forEach(t => map.set(t.id, t));
      
      return Array.from(map.values()).sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    });
  }, [transactions]);

  const loadMore = async () => {
    if (isFetchingMore || !hasMore) return;
    
    setIsFetchingMore(true);
    const lastTx = localTransactions.length > 0 ? localTransactions[localTransactions.length - 1] : null;
    
    try {
      let query = supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .eq('bucket_id', bucket.id)
        .is('deleted_at', null);

      const currentBucketId = bucket.id;

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(localTransactions.length, localTransactions.length + 99);

      if (error) throw error;

      // Verify we are still on the same bucket before updating state
      if (currentBucketId !== bucket.id) return;

      if (data && data.length > 0) {
        setLocalTransactions(prev => {
          const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
          data.forEach(t => map.set(t.id, t));
          return Array.from(map.values()).sort((a, b) => {
            const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        });
        if (data.length < 100) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Error fetching more transactions:', err);
      setHasMore(false);
    } finally {
      setIsFetchingMore(false);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, localTransactions]);

  const contrastColor = useMemo(() => getContrastColor(bucket.color), [bucket.color]);

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <section 
        className={cn(
          "brutal-card p-3 transition-colors duration-300",
          bucket.color ? contrastColor : "bg-zinc-900 text-white"
        )}
        style={bucket.color ? { backgroundColor: bucket.color } : {}}
      >
        <h3 className="text-xs font-black uppercase mb-1">
          <span className="opacity-60">Available Balance — </span>
          <span>{bucket.name}</span>
        </h3>
        <div className="text-4xl font-black tracking-tighter">
          {formatCurrency(totalBalance)}
        </div>
      </section>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {canEdit && (
          <motion.button 
            whileTap={{ scale: 0.95, x: 2, y: 2 }}
            onClick={onAddClick} 
            className="brutal-button flex items-center justify-center gap-2 py-2"
          >
            <Plus className="w-5 h-5" />
            <span className="font-black uppercase text-sm">Add New</span>
          </motion.button>
        )}
        <motion.button 
          whileTap={{ scale: 0.95, x: 2, y: 2 }}
          onClick={onViewActivity} 
          className="brutal-button bg-zinc-100 text-zinc-900 flex items-center justify-center gap-2 py-2"
        >
          <History className="w-5 h-5" />
          <span className="font-black uppercase text-sm">Activity</span>
        </motion.button>
        {canEdit && (
          <motion.button 
            whileTap={{ scale: 0.95, x: 2, y: 2 }}
            onClick={onManageCategories} 
            className="brutal-button bg-white text-zinc-900 flex items-center justify-center gap-2 py-2"
          >
            <Tag className="w-5 h-5" />
            <span className="font-black uppercase text-sm">Categories</span>
          </motion.button>
        )}
        <motion.button 
          whileTap={{ scale: 0.95, x: 2, y: 2 }}
          onClick={onViewSummary} 
          className="brutal-button bg-sky-100 text-zinc-900 flex items-center justify-center gap-2 py-2"
        >
          <ClipboardList className="w-5 h-5" />
          <span className="font-black uppercase text-sm">Summary</span>
        </motion.button>
      </div>

      {/* Transactions List */}
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-2">
          Recent Transactions — <span className="text-zinc-500">{bucket.name}</span>
        </h3>
        
        {localTransactions.length === 0 ? (
          isLoading ? (
            <TransactionSkeleton />
          ) : (
            <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
              <p className="text-xs font-bold uppercase text-zinc-400">No transactions yet</p>
            </div>
          )
        ) : (
          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.05
                }
              }
            }}
            className="space-y-3"
          >
            {localTransactions.map((t) => {
              const dateParts = getDateParts(t.date);
              return (
                <motion.div
                  variants={{
                    hidden: { opacity: 0, x: -10 },
                    show: { opacity: 1, x: 0 }
                  }}
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  key={t.id}
                  className={cn(
                    "brutal-card pl-1 pr-4 py-1 flex items-start justify-between gap-2 cursor-pointer hover:bg-zinc-50 transition-colors",
                    t.is_optimistic && "opacity-60 border-dashed"
                  )}
                  onClick={() => !t.is_optimistic && onViewTransaction(t)}
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
                        {/* Category Box */}
                        <div className="flex items-center gap-2">
                          <div className="border-2 border-zinc-900 px-2 py-0.5 inline-block text-[10px] font-black text-zinc-600 bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                            {t.category?.name || '---'}
                          </div>
                          {t.file_url && <Paperclip className="w-3 h-3 text-zinc-400 flex-shrink-0" />}
                        </div>
                        
                        {/* Remarks */}
                        <div className="font-black text-base leading-tight truncate text-zinc-900">
                          {truncateRemarks(t.remarks) || 'No Remarks'}
                        </div>

                        {/* Added By */}
                        {t.last_edited_by && (
                          <div className={cn(
                            "text-[10px] font-black uppercase break-all",
                            !activeShareEmails.includes(t.last_edited_by) && t.last_edited_by !== ownerEmail && t.last_edited_by !== 'Unknown'
                              ? "text-zinc-400"
                              : "text-zinc-500"
                          )}>
                            ADDED BY:- {formatUserDisplay(t.last_edited_by || '', ownerEmail, activeShareEmails, profiles)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between h-full min-h-[72px] flex-shrink-0">
                    <div className={cn(
                      "font-black text-xl tracking-tight whitespace-nowrap",
                      t.type === 'Credit' ? "text-green-600" : "text-red-600"
                    )}>
                      {t.type === 'Credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </div>
                    
                    {canEdit && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTransaction(t);
                        }}
                        className="w-10 h-10 border-2 border-zinc-900 bg-white hover:bg-zinc-100 transition-all flex items-center justify-center p-0 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]"
                      >
                        <Edit2 className="w-5 h-5 text-zinc-900" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
            
            {/* Infinite Scroll Trigger */}
            {hasMore && (
              <div ref={observerTarget} className="py-8 flex justify-center">
                {isFetchingMore ? (
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
                ) : (
                  <div className="h-6" /> // Invisible trigger area
                )}
              </div>
            )}
            {!hasMore && localTransactions.length > 0 && (
              <div className="text-center py-8 text-[10px] font-black uppercase text-zinc-400">
                End of history
              </div>
            )}
          </motion.div>
        )}
      </section>
    </div>
  );
}
