import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type Transaction, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn, formatDate, formatUserDisplay, truncateRemarks, getDateParts } from '../lib/utils';
import { Plus, Tag, Edit2, Paperclip, History, Loader2, ClipboardList, Search } from 'lucide-react';

function getContrastColor(hexColor: string | undefined): string {
  if (!hexColor || hexColor === '#ffffff' || hexColor === 'transparent') return 'text-zinc-900';
  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? 'text-zinc-900' : 'text-white';
}

function TransactionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="brutal-card pl-1 pr-4 py-2 flex items-start justify-between gap-3 animate-pulse bg-white">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-2xl bg-zinc-100 flex-shrink-0 mt-1" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <div className="h-4 w-16 rounded-full bg-zinc-100" />
                <div className="h-4 w-24 rounded-full bg-zinc-50" />
              </div>
              <div className="h-5 w-3/4 rounded-full bg-zinc-100" />
              <div className="h-3 w-1/2 rounded-full bg-zinc-50" />
            </div>
          </div>
          <div className="w-20 h-6 rounded-full bg-zinc-100 mt-1" />
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
  onEditTransaction: (transaction: Transaction) => void;
  onViewTransaction: (transaction: Transaction) => void;
  onSearchBucket: () => void;
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
  onEditTransaction,
  onViewTransaction,
  onSearchBucket,
  totalBalance
}: DashboardViewProps) {
  
  const navigate = useNavigate();

  const activeShareEmails = useMemo(() => shares.filter(s => s.bucket_id === bucket.id && s.status === 'accepted').map(s => s.shared_with_email), [shares, bucket.id]);

  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  // Ids App.tsx's fetch window returned last time. Used to tell "fell out of
  // the window because it was deleted elsewhere" apart from "was only ever
  // loaded further down via infinite scroll and isn't in the window at all".
  const knownWindowIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalTransactions([]);
    setHasMore(true);
    setIsFetchingMore(false);
    knownWindowIdsRef.current = new Set();
  }, [bucket.id]);

  useEffect(() => {
    const incomingIds = new Set(transactions.map(t => t.id));

    setLocalTransactions(prev => {
      const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
      prev.forEach(t => {
        const isStaleOptimistic = t.is_optimistic && !incomingIds.has(t.id);
        const droppedFromWindow = knownWindowIdsRef.current.has(t.id) && !incomingIds.has(t.id);
        if (isStaleOptimistic || droppedFromWindow) {
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

    knownWindowIdsRef.current = incomingIds;
  }, [transactions]);

  const loadMore = async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    
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
        <button
          type="button"
          onClick={onSearchBucket}
          className="brutal-button bg-white text-zinc-900 flex items-center justify-center gap-2 py-2 hover:bg-zinc-100 active:bg-zinc-200 transition-colors touch-manipulation"
        >
          <Search className="w-5 h-5" />
          <span className="font-black uppercase text-sm">Search</span>
        </button>
        <button
          type="button"
          onClick={() => navigate(`/bucket/${bucket.id}/activity`)}
          className="brutal-button bg-zinc-100 text-zinc-900 flex items-center justify-center gap-2 py-2 hover:bg-zinc-200 active:bg-zinc-300 transition-colors touch-manipulation"
        >
          <History className="w-5 h-5" />
          <span className="font-black uppercase text-sm">Activity</span>
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={() => navigate(`/bucket/${bucket.id}/categories`)}
            className="brutal-button bg-white text-zinc-900 flex items-center justify-center gap-2 py-2 hover:bg-zinc-100 active:bg-zinc-200 transition-colors touch-manipulation"
          >
            <Tag className="w-5 h-5" />
            <span className="font-black uppercase text-sm">Categories</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/bucket/${bucket.id}/summary`)}
          className="brutal-button bg-sky-100 text-zinc-900 flex items-center justify-center gap-2 py-2 hover:bg-sky-200 active:bg-sky-300 transition-colors touch-manipulation"
        >
          <ClipboardList className="w-5 h-5" />
          <span className="font-black uppercase text-sm">Summary</span>
        </button>
      </div>

      {/* Transactions List */}
      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 pb-1">
          Recent Transactions — <span className="text-zinc-400">{bucket.name}</span>
        </h3>

        {localTransactions.length === 0 ? (
          isLoading ? (
            <TransactionSkeleton />
          ) : (
            <div className="text-center py-12 rounded-2xl bg-zinc-100">
              <p className="text-xs font-bold uppercase text-zinc-400">No transactions yet</p>
            </div>
          )
        ) : (
          <div className="space-y-3">
            {localTransactions.map((t) => {
              const dateParts = getDateParts(t.date);
              
              let formattedAddedDate = '';
              if (t.created_at) {
                const d = new Date(t.created_at);
                formattedAddedDate = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
              }

              let formattedUpdatedDate = '';
              const isUpdated = t.updated_at && t.created_at && (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() > 21600000);
              if (isUpdated && t.updated_at) {
                const d = new Date(t.updated_at);
                formattedUpdatedDate = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} ${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
              }

              return (
                <div
                  key={t.id}
                  className={cn(
                    "brutal-card pl-1 pr-4 py-2 flex items-start justify-between gap-2 cursor-pointer hover:shadow-md active:bg-zinc-100 transition-all touch-manipulation",
                    t.is_optimistic && "opacity-60"
                  )}
                  onClick={() => !t.is_optimistic && onViewTransaction(t)}
                >
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className={cn(
                      "w-14 h-[72px] rounded-2xl flex-shrink-0 flex flex-col items-center justify-center font-black leading-[1.1] text-zinc-900",
                      t.type === 'Credit' ? "bg-green-100" : "bg-red-100"
                    )}>
                      <span className="text-base">{dateParts.day}</span>
                      <span className="text-xs uppercase">{dateParts.month}</span>
                      <span className="text-xs">{dateParts.year}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <div className="rounded-full px-2 py-0.5 inline-block text-[10px] font-black text-zinc-600 bg-zinc-100">
                            {t.category?.name || '---'}
                          </div>
                          {t.file_url && <Paperclip className="w-3 h-3 text-zinc-400 flex-shrink-0" />}
                        </div>
                        
                        <div className="font-black text-base leading-tight truncate text-zinc-900">
                          {truncateRemarks(t.remarks) || 'No Remarks'}
                        </div>

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

                        {formattedAddedDate && (
                          <div className="text-[10px] font-black uppercase text-zinc-500 break-all">
                            ADDED ON:- {formattedAddedDate}
                          </div>
                        )}

                        {formattedUpdatedDate && (
                          <div className="text-[10px] font-black uppercase text-blue-500 break-all">
                            UPDATED ON:- {formattedUpdatedDate}
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
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditTransaction(t);
                        }}
                        className="w-10 h-10 rounded-full bg-white hover:bg-zinc-100 transition-colors flex items-center justify-center p-0 shadow-sm active:bg-zinc-200 touch-manipulation"
                      >
                        <Edit2 className="w-5 h-5 text-zinc-900" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            
            {hasMore && (
              <div ref={observerTarget} className="py-8 flex justify-center">
                {isFetchingMore ? <Loader2 className="w-6 h-6 animate-spin text-zinc-400" /> : <div className="h-6" />}
              </div>
            )}
            {!hasMore && localTransactions.length > 0 && (
              <div className="text-center py-8 text-[10px] font-black uppercase text-zinc-400">
                End of history
              </div>
            )}
          </div>
        )}
      </section>

      {canEdit && (
        <button
          type="button"
          onClick={() => navigate(`/bucket/${bucket.id}/add-transaction`)}
          aria-label="Add New Transaction"
          className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-zinc-900 text-white shadow-lg hover:shadow-xl hover:bg-zinc-800 active:scale-90 transition-all flex items-center justify-center touch-manipulation"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}