import React, { useState, useEffect, useRef } from 'react';
import { supabase, type Transaction, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn, formatUserDisplay, truncateRemarks, getDateParts } from '../lib/utils';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  
  // THE FIX: We track the database position completely independently of the array length
  const [dbOffset, setDbOffset] = useState(0); 
  
  const observerTarget = useRef<HTMLDivElement>(null);
  // Ids App.tsx's fetch window returned last time. Used to tell "fell out of
  // the window because it was deleted elsewhere" apart from "was only ever
  // loaded further down via infinite scroll and isn't in the window at all".
  const knownWindowIdsRef = useRef<Set<string>>(new Set());

  // 1. Sync the initial transactions passed from App.tsx (Instant UI Load)
  useEffect(() => {
    const incomingIds = new Set(transactions.map(t => t.id));

    setLocalTransactions(prev => {
      const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
      prev.forEach(t => {
        if (knownWindowIdsRef.current.has(t.id) && !incomingIds.has(t.id)) {
          map.delete(t.id);
        }
      });
      transactions.forEach(t => map.set(t.id, t));

      return Array.from(map.values()).sort((a, b) => {
        const timeA = new Date(a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.updated_at || b.created_at).getTime();
        return timeB - timeA;
      });
    });

    knownWindowIdsRef.current = incomingIds;
  }, [transactions]);

  // 2. Fetch rows sequentially using our dedicated dbOffset tracker
  const loadMore = async () => {
    if (isFetchingMore || !hasMore || buckets.length === 0) return;
    setIsFetchingMore(true);

    try {
      const activeBucketIds = buckets.map(b => b.id);

      const { data, error } = await supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .in('bucket_id', activeBucketIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        // Use our safe offset tracker instead of array length
        .range(dbOffset, dbOffset + 99);

      if (error) throw error;

      if (data && data.length > 0) {
        // Move the tracker forward by exactly how many rows we received
        setDbOffset(prev => prev + data.length);

        setLocalTransactions(prev => {
          // The Map perfectly handles deduplication if App.tsx already passed the row
          const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
          data.forEach(t => map.set(t.id, t));
          
          return Array.from(map.values()).sort((a, b) => {
            const timeA = new Date(a.updated_at || a.created_at).getTime();
            const timeB = new Date(b.updated_at || b.created_at).getTime();
            return timeB - timeA;
          });
        });
        
        if (data.length < 100) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error('Error fetching more recent transactions:', err);
      setHasMore(false);
    } finally {
      setIsFetchingMore(false);
    }
  };

  // 3. Infinite Scroll Observer
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
  }, [hasMore, isFetchingMore, localTransactions.length, buckets]);

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">Recently Added</h2>
          <span className="text-[10px] font-black uppercase text-zinc-400 mt-1">
            Showing {localTransactions.length} recent entries
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {localTransactions.length === 0 ? (
          <div className="text-center py-12 rounded-2xl bg-zinc-100">
            <p className="text-xs font-bold uppercase text-zinc-400">No transactions found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {localTransactions.map((t) => {
              const bucket = buckets.find(b => b.id === t.bucket_id);
              const dateParts = getDateParts(t.date);
              const bucketShares = shares.filter(s => s.bucket_id === t.bucket_id && s.status === 'accepted');
              const activeEmails = bucketShares.map(s => s.shared_with_email);
              const ownerEmail = bucketShares[0]?.shared_by_email || '';

              let formattedAddedDate = '';
              if (t.created_at) {
                const d = new Date(t.created_at);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                formattedAddedDate = `${timeStr} ${dateStr}`;
              }

              let formattedUpdatedDate = '';
              const isUpdated = t.updated_at && t.created_at && (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime() > 21600000);
              
              if (isUpdated && t.updated_at) {
                const d = new Date(t.updated_at);
                const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                formattedUpdatedDate = `${timeStr} ${dateStr}`;
              }

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
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-[8px] font-black uppercase bg-zinc-900 text-white px-1.5 py-0.5 rounded-full">
                            {bucket?.name || 'No Bucket'}
                          </span>
                          <div className="rounded-full px-2 py-0.5 inline-block text-[10px] font-black text-zinc-600 bg-zinc-100">
                            {t.category?.name || '---'}
                          </div>
                          {t.deleted_at && (
                            <span className="text-[8px] font-black uppercase bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">Deleted</span>
                          )}
                        </div>
                        
                        <div className="font-black text-base leading-tight truncate text-zinc-900">
                          {truncateRemarks(t.remarks) || 'No Remarks'}
                        </div>

                        {t.last_edited_by && (
                          <div className="text-[10px] font-black uppercase text-zinc-500 break-all">
                            ADDED BY:- {formatUserDisplay(t.last_edited_by, ownerEmail, activeEmails, profiles)}
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

                  <div className={cn(
                    "font-black text-xl tracking-tight whitespace-nowrap flex-shrink-0",
                    t.type === 'Credit' ? "text-green-600" : "text-red-600"
                  )}>
                    {t.type === 'Credit' ? '+' : '-'}{formatCurrency(t.amount)}
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
                  <div className="h-6" /> // Invisible trigger box
                )}
              </div>
            )}
            
            {!hasMore && localTransactions.length > 0 && (
              <div className="text-center py-8 text-[10px] font-black uppercase text-zinc-400">
                End of history
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}