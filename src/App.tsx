import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase, type Category, type Transaction, type Bucket, type BucketShare } from './lib/supabase';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { AddTransactionView } from './components/AddTransactionView';
import { CategoryManagerView } from './components/CategoryManagerView';
import { TransactionDetailView } from './components/TransactionDetailView';
import { DeletedTransactionsView } from './components/DeletedTransactionsView';
import { ArchiveView } from './components/ArchiveView';
import { BucketsHomeView } from './components/BucketsHomeView';
import { AnalyzeView } from './components/AnalyzeView';
import { RecentlyAddedView } from './components/RecentlyAddedView';
import { ActivityLogView } from './components/ActivityLogView';
import { SummaryView } from './components/SummaryView';
import { ProfileView } from './components/ProfileView';
import { Sidebar } from './components/Sidebar';
import { Loader2, Menu, ArrowLeft, Plus, X, Clock, BarChart3, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, downloadCSV } from './lib/utils';
import { logActivity } from './lib/activity';
import { useBucketPreferences } from './lib/preferences';

// Memoize sub-components for performance
const MemoizedBucketsHomeView = React.memo(BucketsHomeView);
const MemoizedDashboardView = React.memo(DashboardView);
const MemoizedAddTransactionView = React.memo(AddTransactionView);
const MemoizedCategoryManagerView = React.memo(CategoryManagerView);
const MemoizedTransactionDetailView = React.memo(TransactionDetailView);
const MemoizedDeletedTransactionsView = React.memo(DeletedTransactionsView);
const MemoizedArchiveView = React.memo(ArchiveView);
const MemoizedAnalyzeView = React.memo(AnalyzeView);
const MemoizedRecentlyAddedView = React.memo(RecentlyAddedView);
const MemoizedActivityLogView = React.memo(ActivityLogView);
const MemoizedSummaryView = React.memo(SummaryView);
const MemoizedProfileView = React.memo(ProfileView);
const MemoizedSidebar = React.memo(Sidebar);

type View = 'buckets' | 'dashboard' | 'add-transaction' | 'categories' | 'view-transaction' | 'deleted' | 'analyze' | 'recently-added' | 'archive' | 'activity' | 'summary' | 'profile';

type AnalyzeParams = {
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  autoRun?: boolean;
} | null;

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('buckets');
  const [analyzeParams, setAnalyzeParams] = useState<AnalyzeParams>(null);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [bucketTotals, setBucketTotals] = useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [orphanedCount, setOrphanedCount] = useState<number>(0);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<Bucket | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shares, setShares] = useState<BucketShare[]>([]);
  const [pendingShares, setPendingShares] = useState<BucketShare[]>([]);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddingBucket, setIsAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');

  // SWR: Try loading from cache immediately
  useEffect(() => {
    try {
      const cachedBuckets = localStorage.getItem('sw_buckets');
      const cachedTotals = localStorage.getItem('sw_bucketTotals');
      const cachedGrandTotal = localStorage.getItem('sw_grandTotal');
      
      if (cachedBuckets) {
        setBuckets(JSON.parse(cachedBuckets));
        setIsAppLoading(false); // Remove initial block if we have cache
      }
      if (cachedTotals) setBucketTotals(JSON.parse(cachedTotals));
      if (cachedGrandTotal) setGrandTotal(JSON.parse(cachedGrandTotal));
    } catch (e) {
      console.warn('Failed to load cache:', e);
    }
  }, []);
  const [isBucketLoading, setIsBucketLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const isMigrating = React.useRef(false);
  const prevPendingTransfersCount = useRef(0);

  const { prefs, updatePreference } = useBucketPreferences(session?.user?.id);

  const enhancedBuckets = useMemo(() => {
    return buckets.map(b => {
      const p = prefs[b.id];
      return {
        ...b,
        original_name: b.name,
        name: p?.alias || b.name,
        color: p?.color || b.color || '#ffffff'
      };
    });
  }, [buckets, prefs]);

  const enhancedSelectedBucket = useMemo(() => {
    if (!selectedBucket) return null;
    return enhancedBuckets.find(b => b.id === selectedBucket.id) || selectedBucket;
  }, [selectedBucket, enhancedBuckets]);

  const pendingTransfers = useMemo(() => 
    pendingShares.filter(s => s.access_level === 'transfer'),
    [pendingShares]
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsRecovery(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Ensure scroll is at top when switching views or buckets
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentView, selectedBucket?.id]);

  useEffect(() => {
    if (session && !isRecovery) {
      fetchData(true);

      
      // Real-time subscription
      const transactionsChannel = supabase
        .channel('transactions-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions' },
          () => fetchData(false)
        )
        .subscribe();

      const categoriesChannel = supabase
        .channel('categories-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'categories' },
          () => fetchData(false)
        )
        .subscribe();

      const sharesChannel = supabase
        .channel('shares-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bucket_shares' },
          () => fetchData(false)
        )
        .subscribe();

      return () => {
        supabase.removeChannel(transactionsChannel);
        supabase.removeChannel(categoriesChannel);
        supabase.removeChannel(sharesChannel);
      };
    } else {
      setIsAppLoading(false);
    }
  }, [session, isRecovery]);

  const fetchData = useCallback(async (isInitial = false, bucketOverride?: Bucket | null) => {
    if (!session) return;
    
    // Only block if we have nothing in cache
    if (isInitial && buckets.length === 0) setIsAppLoading(true);
    if (isInitial) setIsDataLoading(true);

    try {
      const userEmail = session.user.email;
      const currentSelectedBucket = bucketOverride !== undefined ? bucketOverride : selectedBucket;

      const [bucketsRes, sharedWithRes, sharedByRes, catRes, orphanedRes, profilesRes] = await Promise.all([
        supabase.from('buckets').select('*').order('name', { ascending: true }),
        supabase.from('bucket_shares').select('*, bucket:buckets(*)').eq('shared_with_email', userEmail),
        supabase.from('bucket_shares').select('*').eq('shared_by_email', userEmail),
        supabase.from('categories').select('*').order('name', { ascending: true }),
        supabase.from('transactions').select('id', { count: 'exact', head: true }).is('bucket_id', null),
        supabase.from('profiles').select('id, email, display_name')
      ]);

      if (profilesRes.data) {
        const profileMap: Record<string, string> = {};
        profilesRes.data.forEach(p => {
          if (p.display_name) {
            profileMap[p.id] = p.display_name;
            if (p.email) profileMap[p.email] = p.display_name;
          }
        });
        setProfiles(profileMap);
      }

      const allBuckets = bucketsRes.data || [];
      const incomingShares = sharedWithRes.data || [];
      const outgoingShares = sharedByRes.data || [];
      const acceptedShares = incomingShares.filter(s => s.status === 'accepted');
      const pending = incomingShares.filter(s => s.status === 'pending');

      acceptedShares.forEach(share => {
        if (share.bucket && !allBuckets.find(b => b.id === share.bucket_id)) {
          allBuckets.push(share.bucket);
        }
      });

      const activeBuckets = allBuckets.filter(b => !b.archived_at);

      const activeBucketIds = activeBuckets.map(b => b.id);

      const [bucketTotalsRes, grandTotalRes] = await Promise.all([
        supabase.rpc('get_bucket_totals'),
        supabase.rpc('get_grand_total')
      ]);

      let transactionsData: Transaction[] = [];
      if (activeBucketIds.length > 0) {
          const queries = activeBucketIds.map(id => 
            supabase.from('transactions')
              .select('*, category:categories(*)')
              .eq('bucket_id', id)
              .is('deleted_at', null)
              .order('date', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20)
          );
          const results = await Promise.all(queries);
          transactionsData = results.flatMap(r => r.data || []);
      }

      const totalsMap: Record<string, number> = {};
      if (bucketTotalsRes.data) {
        bucketTotalsRes.data.forEach((row: any) => {
          totalsMap[row.bucket_id] = Number(row.total);
        });
      }

      // Batch all state updates at once to prevent partial renders
      setShares([...acceptedShares, ...outgoingShares]);
      setPendingShares(pending);
      setBuckets(allBuckets);
      if (catRes.data) setCategories(catRes.data);
      setOrphanedCount(orphanedRes.count || 0);
      setBucketTotals(totalsMap);
      setGrandTotal(Number(grandTotalRes.data || 0));
      
      // Sort the combined list by date
      setTransactions(transactionsData.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }));

      // Cache crucial UI data for instantaneous next load
      try {
        localStorage.setItem('sw_buckets', JSON.stringify(allBuckets));
        localStorage.setItem('sw_bucketTotals', JSON.stringify(totalsMap));
        localStorage.setItem('sw_grandTotal', JSON.stringify(Number(grandTotalRes.data || 0)));
      } catch (e) {
        console.warn('Failed to save cache', e);
      }

      // Migration logic (non-blocking for the main UI reveal)
      if (bucketsRes.data && orphanedRes.count && orphanedRes.count > 0 && !isMigrating.current) {
      const rncReserve = bucketsRes.data.find(b => b.name === 'RNC Reserve');
      
      if (rncReserve) {
        isMigrating.current = true;
        console.log(`Migrating orphaned transactions to RNC Reserve...`);
        
        try {
          const { data: orphanedTrans } = await supabase
            .from('transactions')
            .select('id')
            .is('bucket_id', null);

          if (orphanedTrans && orphanedTrans.length > 0) {
            const orphanedIds = orphanedTrans.map(t => t.id);
            await supabase
              .from('transactions')
              .update({ bucket_id: rncReserve.id })
              .in('id', orphanedIds);

            // Update categories if any are orphaned
            const orphanedCats = catRes.data?.filter(c => !c.bucket_id) || [];
            if (orphanedCats.length > 0) {
              await supabase
                .from('categories')
                .update({ bucket_id: rncReserve.id })
                .in('id', orphanedCats.map(c => c.id));
            }
            
            // Refresh data after migration
            await fetchData();
          }
        } finally {
          isMigrating.current = false;
        }
      }
    }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setIsAppLoading(false);
      setIsDataLoading(false);
    }
  }, [session, selectedBucket]);

  const syncFullHistory = useCallback(async (bucketId: string) => {
    if (!session || isSyncing) return;
    setIsSyncing(true);
    try {
      let allData: Transaction[] = [];
      let hasMore = true;
      let from = 0;
      const batchSize = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .eq('bucket_id', bucketId)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (data) {
          allData = [...allData, ...data];
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      setTransactions(prev => {
        const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
        allData.forEach(t => map.set(t.id, t));
        return Array.from(map.values()).sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
    } catch (err) {
      console.error('Error syncing full history:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [session, isSyncing]);

  const syncAllHistory = useCallback(async () => {
    if (!session || isSyncing) return;
    setIsSyncing(true);
    try {
      const activeBucketIds = buckets
        .filter(b => !b.archived_at)
        .map(b => b.id);

      if (activeBucketIds.length === 0) return;

      let allData: Transaction[] = [];
      let hasMore = true;
      let from = 0;
      const batchSize = 1000;

      while (hasMore) {
        const { data, error } = await supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .in('bucket_id', activeBucketIds)
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) throw error;
        if (data) {
          allData = [...allData, ...data];
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        } else {
          hasMore = false;
        }
      }

      setTransactions(prev => {
        const map = new Map<string, Transaction>(prev.map(t => [t.id, t]));
        allData.forEach(t => map.set(t.id, t));
        return Array.from(map.values()).sort((a, b) => {
          const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateDiff !== 0) return dateDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      });
    } catch (err) {
      console.error('Error syncing all history:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [session, isSyncing, buckets]);

  const optimisticAddTransaction = useCallback((newTx: Partial<Transaction>) => {
    const tempId = `opt-${Date.now()}`;
    const optimisticTx: Transaction = {
      id: tempId,
      user_id: session?.user?.id || '',
      bucket_id: newTx.bucket_id || '',
      type: newTx.type || 'Debit',
      amount: newTx.amount || 0,
      date: newTx.date || new Date().toISOString(),
      category_id: newTx.category_id || null,
      remarks: newTx.remarks || '',
      file_url: newTx.file_url || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      last_edited_by: session?.user?.email || 'You',
      category: categories.find(c => c.id === newTx.category_id),
      is_optimistic: true
    };

    // Update transactions list
    setTransactions(prev => [optimisticTx, ...prev]);

    // Update totals
    const amountChange = optimisticTx.type === 'Credit' ? optimisticTx.amount : -optimisticTx.amount;
    setBucketTotals(prev => ({
      ...prev,
      [optimisticTx.bucket_id]: (prev[optimisticTx.bucket_id] || 0) + amountChange
    }));
    setGrandTotal(prev => prev + amountChange);
  }, [session, categories]);

  const optimisticEditTransaction = useCallback((updatedTx: Partial<Transaction>) => {
    if (!updatedTx.id) return;
    
    setTransactions(prev => prev.map(t => {
      if (t.id === updatedTx.id) {
        // Calculate total difference
        const oldAmountDir = t.type === 'Credit' ? Number(t.amount) : -Number(t.amount);
        const newAmountDir = updatedTx.type === 'Credit' ? Number(updatedTx.amount || t.amount) : -Number(updatedTx.amount || t.amount);
        const difference = newAmountDir - oldAmountDir;
        
        setBucketTotals(prevTotals => ({
          ...prevTotals,
          [t.bucket_id]: (prevTotals[t.bucket_id] || 0) + difference
        }));
        setGrandTotal(g => g + difference);

        return {
          ...t,
          ...updatedTx,
          category: categories.find(c => c.id === (updatedTx.category_id || t.category_id)) || t.category
        };
      }
      return t;
    }));
  }, [categories]);

  const optimisticDeleteTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        const amountChange = t.type === 'Credit' ? -Number(t.amount) : Number(t.amount);
        setBucketTotals(prevTotals => ({
          ...prevTotals,
          [t.bucket_id]: (prevTotals[t.bucket_id] || 0) + amountChange
        }));
        setGrandTotal(g => g + amountChange);
        return { ...t, deleted_at: new Date().toISOString() };
      }
      return t;
    }));
  }, []);

  const handleAddBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketName.trim()) return;
    setIsBucketLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('buckets')
        .insert({ user_id: user.id, name: newBucketName.trim() })
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        await logActivity(data.id, 'bucket_created', { name: data.name });
      }

      setNewBucketName('');
      setIsAddingBucket(false);
      fetchData();
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setIsBucketLoading(false);
    }
  };

  const handleExport = useCallback(async () => {
    // If a bucket is selected, only the owner can export
    if (selectedBucket && selectedBucket.user_id !== session.user.id) {
      console.error('Only the owner of this bucket can export its data.');
      return;
    }

    let allTransactions: Transaction[] = [];

    try {
      if (selectedBucket) {
        // Fetch ALL transactions for this bucket
        const { data, error } = await supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .eq('bucket_id', selectedBucket.id)
          .order('date', { ascending: false });

        if (error) throw error;
        allTransactions = data || [];
      } else {
        // Fetch ALL transactions for all owned buckets
        const ownedBucketIds = buckets
          .filter(b => b.user_id === session.user.id && !b.archived_at)
          .map(b => b.id);

        if (ownedBucketIds.length === 0) {
          console.error('No buckets available to export.');
          return;
        }

        const { data, error } = await supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .in('bucket_id', ownedBucketIds)
          .order('date', { ascending: false });

        if (error) throw error;
        allTransactions = data || [];
      }

      if (allTransactions.length === 0) {
        console.error('No data available to export.');
        return;
      }

      const exportData = allTransactions.map(t => ({
        Date: t.date.split('T')[0],
        Type: t.type,
        Amount: t.amount,
        Bucket: enhancedBuckets.find(b => b.id === t.bucket_id)?.name || 'Unknown',
        Category: (t as any).category?.name || '',
        Remarks: t.remarks,
        'Added By': t.last_edited_by || 'Unknown',
        Status: t.deleted_at ? 'Deleted' : 'Active'
      }));
      
      const fileName = selectedBucket 
        ? `SpendWise_${selectedBucket.name}_${new Date().toISOString().split('T')[0]}.csv`
        : `SpendWise_MyBuckets_${new Date().toISOString().split('T')[0]}.csv`;

      downloadCSV(exportData, fileName);
    } catch (error) {
      console.error('Export failed:', error);
    }
  }, [selectedBucket, session, buckets, enhancedBuckets]);

  const activeBuckets = useMemo(() => enhancedBuckets.filter(b => !b.archived_at), [enhancedBuckets]);
  const activeGlobalTransactions = useMemo(() => {
    const activeBucketIds = new Set(activeBuckets.map(b => b.id));
    return transactions.filter(t => activeBucketIds.has(t.bucket_id));
  }, [transactions, activeBuckets]);

  const activeTransactions = useMemo(() => selectedBucket 
    ? transactions.filter(t => !t.deleted_at && t.bucket_id === selectedBucket.id)
    : [], [transactions, selectedBucket]);
    
  const bucketCategories = useMemo(() => selectedBucket 
    ? categories.filter(c => c.bucket_id === selectedBucket.id)
    : [], [categories, selectedBucket]);

  const getOwnerEmail = useCallback((bucket: Bucket) => {
    const share = shares.find(s => s.bucket_id === bucket.id);
    if (share) return share.shared_by_email;
    if (bucket.user_id === session?.user?.id) return session?.user?.email;
    return '';
  }, [shares, session]);

  const handleNavigate = useCallback((view: View) => {
    if (view === 'buckets') setSelectedBucket(null);
    setCurrentView(view);
    
    if (view === 'summary' || view === 'analyze') {
      if (selectedBucket) {
        syncFullHistory(selectedBucket.id);
      } else if (view === 'analyze') {
        syncAllHistory();
      }
    }

    // Push state to browser history when navigating.
    // If navigating back to root ('buckets'), clear history state effectively by pushing null state
    if (view !== 'buckets') {
      window.history.pushState({ view, bucketId: selectedBucket?.id }, '', `#${view}`);
    } else {
      window.history.pushState({ view: 'buckets', bucketId: null }, '', '#buckets');
    }
  }, [selectedBucket, syncFullHistory, syncAllHistory]);

  const handleSelectBucket = useCallback((bucket: Bucket) => {
    setSelectedBucket(bucket);
    setCurrentView('dashboard');
    window.history.pushState({ view: 'dashboard', bucketId: bucket.id }, '', '#dashboard');
  }, []);

  const handleEditTransaction = useCallback((t: Transaction) => {
    setEditingTransaction(t);
    setCurrentView('add-transaction');
    window.history.pushState({ view: 'add-transaction', bucketId: selectedBucket?.id }, '', '#add-transaction');
  }, [selectedBucket]);

  const handleViewTransaction = useCallback((t: Transaction) => {
    setSelectedTransaction(t);
    setCurrentView('view-transaction');
    window.history.pushState({ view: 'view-transaction', bucketId: selectedBucket?.id }, '', '#view-transaction');
  }, [selectedBucket]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If there's no state, or we hit the root, we default to buckets
      if (!event.state || !event.state.view || event.state.view === 'buckets') {
        setSelectedBucket(null);
        setCurrentView('buckets');
      } else {
        const view = event.state.view as View;
        const bucketId = event.state.bucketId;
        
        // If we are navigating to a bucket-specific view but don't have a bucket ID, 
        // fallback to the buckets home view to avoid a blank page.
        const bucketSpecificViews: View[] = ['dashboard', 'summary', 'analyze', 'activity', 'categories'];
        if (bucketSpecificViews.includes(view) && !bucketId) {
          setSelectedBucket(null);
          setCurrentView('buckets');
          return;
        }

        setCurrentView(view);
        // Restore bucket if it was in the state
        if (bucketId) {
          setBuckets(currentBuckets => {
            const bucket = currentBuckets.find(b => b.id === bucketId);
            if (bucket) {
              setSelectedBucket(bucket);
            } else if (bucketSpecificViews.includes(view)) {
              // If the bucket wasn't found but we are in a bucket view, fallback
              setCurrentView('buckets');
              setSelectedBucket(null);
            }
            return currentBuckets;
          });
        }
      }
    };

    // Ensure our initial state is recorded so popping back to the very beginning works without closing the app.
    if (!window.location.hash) {
      window.history.replaceState({ view: 'buckets', bucketId: null }, '', '#buckets');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleRefresh = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  const handleTransferOwnership = useCallback(async (email: string, bucketId: string) => {
    if (!session) return;
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .insert({
          bucket_id: bucketId,
          shared_by_email: session.user.email,
          shared_with_email: email.trim().toLowerCase(),
          access_level: 'transfer',
          status: 'pending'
        });

      if (error) throw error;
      await logActivity(bucketId, 'ownership_transfer_initiated', { recipient: email });
      await handleRefresh();
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }, [session, handleRefresh]);

  const handleCancelTransfer = useCallback(async (shareId: string, bucketId: string) => {
    try {
      const { error } = await supabase
        .from('bucket_shares')
        .delete()
        .eq('id', shareId);

      if (error) throw error;
      await logActivity(bucketId, 'ownership_transfer_cancelled');
      await handleRefresh();
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  }, [handleRefresh]);

  const handleAcceptTransfer = useCallback(async (share: BucketShare) => {
    if (!session) return;
    try {
      const { error } = await supabase.rpc('accept_bucket_transfer', {
        share_id: share.id
      });

      if (error) throw error;

      await logActivity(share.bucket_id, 'ownership_transfer_accepted', { previous_owner: share.shared_by_email });
      await handleRefresh();
    } catch (err: any) {
      console.error(err);
      throw new Error("Failed to accept transfer: " + err.message);
    }
  }, [session, handleRefresh]);

  const handleRejectTransfer = useCallback(async (shareId: string) => {
    try {
      const { error } = await supabase.rpc('reject_bucket_transfer', {
        share_id: shareId
      });

      if (error) throw error;
      await handleRefresh();
    } catch (err: any) {
      console.error(err);
      throw new Error("Failed to reject transfer: " + err.message);
    }
  }, [handleRefresh]);

  if (loading || isAppLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-900" />
        <div className="text-[10px] font-black uppercase text-zinc-400 tracking-widest animate-pulse">Loading SpendWise...</div>
      </div>
    );
  }

  if (!session || isRecovery) {
    return <AuthView 
      initialIsRecovery={isRecovery}
      onRecoveryComplete={() => {
        setIsRecovery(false);
        window.location.hash = '';
      }} 
    />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32">
      <MemoizedSidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        currentView={currentView}
        onNavigate={handleNavigate}
        onLogout={() => supabase.auth.signOut()}
        onExport={handleExport}
      />

      <header className="sticky top-0 z-30 bg-white border-b-2 border-zinc-900 px-4 py-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <motion.button 
              whileTap={{ scale: 0.9, x: 2, y: 2 }}
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 border-2 border-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-all"
            >
              <Menu className="w-5 h-5" />
            </motion.button>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight uppercase leading-none">SpendWise</h1>
              {enhancedSelectedBucket && (
                <span className="text-[10px] font-black uppercase text-zinc-400 mt-1">Bucket: <span className="normal-case">{enhancedSelectedBucket.name}</span></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentView === 'buckets' && (
              <motion.button 
                whileTap={{ scale: 0.9, x: 2, y: 2 }}
                onClick={() => setIsAddingBucket(true)}
                className="p-2 border-2 border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 transition-all"
              >
                <Plus className="w-5 h-5" />
              </motion.button>
            )}
            {selectedBucket && currentView !== 'buckets' && (
              <motion.button 
                whileTap={{ scale: 0.9, x: 2, y: 2 }}
                onClick={() => {
                  window.history.back();
                }}
                className="p-2 border-2 border-zinc-900 bg-white hover:bg-zinc-50 transition-all flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase">Back</span>
              </motion.button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <AnimatePresence mode="wait">
          {currentView === 'buckets' && (
            <div key="buckets">
              <MemoizedBucketsHomeView 
                buckets={enhancedBuckets}
                bucketTotals={bucketTotals}
                grandTotal={grandTotal}
                orphanedCount={orphanedCount}
                shares={shares}
                pendingShares={pendingShares}
                userId={session.user.id}
                userEmail={session.user.email}
                profiles={profiles}
                onSelectBucket={handleSelectBucket}
                onRefresh={handleRefresh}
                onAcceptTransfer={handleAcceptTransfer}
                onRejectTransfer={handleRejectTransfer}
                onTransferOwnership={handleTransferOwnership}
                onCancelTransfer={handleCancelTransfer}
                onUpdatePreference={updatePreference}
              />
            </div>
          )}
          {currentView === 'dashboard' && enhancedSelectedBucket && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <MemoizedDashboardView 
                transactions={activeTransactions} 
                bucket={enhancedSelectedBucket}
                shares={shares}
                ownerEmail={getOwnerEmail(enhancedSelectedBucket)}
                canEdit={enhancedSelectedBucket.user_id === session.user.id || shares.find(s => s.bucket_id === enhancedSelectedBucket.id && s.shared_with_email === session.user.email)?.access_level === 'edit'}
                isOwner={enhancedSelectedBucket.user_id === session.user.id}
                profiles={profiles}
                isLoading={isDataLoading}
                onTransferOwnership={handleTransferOwnership}
                onCancelTransfer={handleCancelTransfer}
                onAddClick={() => {
                  setEditingTransaction(null);
                  handleNavigate('add-transaction');
                }}
                onEditTransaction={handleEditTransaction}
                onViewTransaction={handleViewTransaction}
                onManageCategories={() => handleNavigate('categories')}
                onViewActivity={() => handleNavigate('activity')}
                onViewSummary={() => handleNavigate('summary')}
                totalBalance={bucketTotals[enhancedSelectedBucket.id] || 0}
              />
            </motion.div>
          )}
          {currentView === 'summary' && enhancedSelectedBucket && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedSummaryView 
                transactions={activeTransactions} 
                categories={bucketCategories}
                isSyncing={isSyncing}
                onBack={() => window.history.back()}
                onCategoryClick={(categoryId, startDate, endDate) => {
                  setAnalyzeParams({ categoryId, startDate, endDate, autoRun: true });
                  handleNavigate('analyze');
                }}
              />
            </motion.div>
          )}
          {currentView === 'add-transaction' && (
            <motion.div
              key="add-transaction"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedAddTransactionView 
                categories={bucketCategories} 
                selectedBucket={enhancedSelectedBucket}
                editingTransaction={editingTransaction}
                onBack={() => {
                  setEditingTransaction(null);
                  window.history.back();
                }}
                onSuccess={() => {
                  setEditingTransaction(null);
                  window.history.back();
                  fetchData(false);
                }}
                onOptimisticAdd={optimisticAddTransaction}
                onOptimisticEdit={optimisticEditTransaction}
                onOptimisticDelete={optimisticDeleteTransaction}
              />
            </motion.div>
          )}
          {currentView === 'categories' && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <MemoizedCategoryManagerView 
                categories={bucketCategories} 
                selectedBucket={selectedBucket}
                onBack={() => window.history.back()}
                onSuccess={handleRefresh}
              />
            </motion.div>
          )}
          {currentView === 'view-transaction' && selectedTransaction && (
            <motion.div
              key="view-transaction"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedTransactionDetailView 
                transaction={selectedTransaction}
                shares={shares}
                profiles={profiles}
                ownerEmail={getOwnerEmail(enhancedBuckets.find(b => b.id === selectedTransaction.bucket_id)!)}
                onBack={() => {
                  setSelectedTransaction(null);
                  window.history.back();
                }}
                onEdit={() => {
                  setEditingTransaction(selectedTransaction);
                  setSelectedTransaction(null);
                  handleNavigate('add-transaction');
                }}
              />
            </motion.div>
          )}
          {currentView === 'analyze' && (
            <motion.div
              key="analyze"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedAnalyzeView 
                transactions={activeGlobalTransactions}
                categories={categories}
                buckets={activeBuckets}
                shares={shares}
                profiles={profiles}
                selectedBucket={enhancedSelectedBucket}
                user={session.user}
                initialParams={analyzeParams}
                isSyncing={isSyncing}
                onBack={() => {
                  setAnalyzeParams(null);
                  window.history.back();
                }}
                onViewTransaction={handleViewTransaction}
              />
            </motion.div>
          )}
          {currentView === 'recently-added' && (
            <motion.div
              key="recently-added"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <MemoizedRecentlyAddedView 
                transactions={activeGlobalTransactions}
                buckets={activeBuckets}
                shares={shares}
                profiles={profiles}
                onBack={() => {
                  window.history.back();
                }}
                onViewTransaction={handleViewTransaction}
              />
            </motion.div>
          )}
          {currentView === 'deleted' && (
            <motion.div
              key="deleted"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <MemoizedDeletedTransactionsView 
                onBack={() => {
                  if (selectedBucket) {
                    window.history.back();
                  } else {
                    handleNavigate('buckets');
                  }
                }}
                onSuccess={handleRefresh}
              />
            </motion.div>
          )}
          {currentView === 'archive' && (
            <motion.div
              key="archive"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedArchiveView 
                buckets={enhancedBuckets}
                transactions={transactions}
                onBack={() => window.history.back()}
                onRefresh={handleRefresh}
              />
            </motion.div>
          )}
          {currentView === 'activity' && enhancedSelectedBucket && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <MemoizedActivityLogView 
                bucket={enhancedSelectedBucket}
                profiles={profiles}
                onBack={() => window.history.back()}
              />
            </motion.div>
          )}
          {currentView === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <MemoizedProfileView 
                session={session}
                onBack={() => {
                  window.history.back();
                }}
                onUpdateName={(name) => {
                  setProfiles(prev => ({ ...prev, [session.user.id]: name }));
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30">
        <button 
          onClick={() => {
            setEditingTransaction(null);
            setSelectedTransaction(null);
            handleNavigate('buckets');
          }}
          className="w-full bg-white border-t-2 border-zinc-900 px-4 py-6 flex justify-center items-center active:bg-zinc-50 transition-colors cursor-pointer"
        >
          <div className="max-w-md mx-auto flex justify-center items-center w-full">
            <span 
              className={cn(
                "text-xs font-black uppercase tracking-wider transition-all",
                currentView === 'buckets' ? "text-zinc-900 scale-110" : "text-zinc-400"
              )}
            >
              Home
            </span>
          </div>
        </button>
      </nav>

      {/* Add Bucket Modal */}
      <AnimatePresence>
        {isAddingBucket && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingBucket(false)}
              className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white border-4 border-zinc-900 z-50 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-tighter">New Bucket</h2>
                <button onClick={() => setIsAddingBucket(false)} className="p-1 border-2 border-zinc-900 bg-zinc-100">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddBucket} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Bucket Name</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newBucketName}
                    onChange={(e) => setNewBucketName(e.target.value)}
                    className="brutal-input"
                    placeholder="e.g. Personal, Business"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isBucketLoading}
                  className="w-full brutal-button py-3 flex items-center justify-center gap-2"
                >
                  {isBucketLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Create Bucket
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
