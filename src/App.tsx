import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate, useParams } from 'react-router-dom';
import { supabase, type Category, type Transaction, type Bucket, type BucketShare } from './lib/supabase';
import { AuthView } from './components/AuthView';
import { DashboardView } from './components/DashboardView';
import { AddTransactionView } from './components/AddTransactionView';
import { CategoryManagerView } from './components/CategoryManagerView';
import { TransactionDetailView } from './components/TransactionDetailView';
import { DeletedTransactionsView } from './components/DeletedTransactionsView';
import { ArchiveView } from './components/ArchiveView';
import { BucketsHomeView } from './components/BucketsHomeView';
import { AnalyzeView, type AnalyzeSnapshot } from './components/AnalyzeView';
import { RecentlyAddedView } from './components/RecentlyAddedView';
import { ActivityLogView } from './components/ActivityLogView';
import { SummaryView } from './components/SummaryView';
import { ProfileView } from './components/ProfileView';
import { Sidebar } from './components/Sidebar';
import { ToastStack, type ToastMessage } from './components/Toast';
import { Loader2, Menu, ArrowLeft, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, downloadCSV } from './lib/utils';
import { logActivity } from './lib/activity';
import { useBucketPreferences } from './lib/preferences';
import { fetchAllRows } from './lib/fetchAll';

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

type AnalyzeParams = {
  categoryId?: string;
  bucketId?: string;
  startDate?: string;
  endDate?: string;
  autoRun?: boolean;
} | null;

// ROUTER HELPER: Extracts the bucket from the URL and passes it to children safely
// so we don't have to rewrite all the child component props at once.
function BucketRouteWrapper({ buckets, children }: { buckets: Bucket[], children: (bucket: Bucket) => React.ReactNode }) {
  const { bucketId } = useParams();
  const bucket = buckets.find(b => b.id === bucketId);
  
  if (!bucket) return <Navigate to="/" replace />;
  
  return <>{children(bucket)}</>;
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  
  // We keep these in global state for now to minimize breaking changes during transition
  const [analyzeParams, setAnalyzeParams] = useState<AnalyzeParams>(null);
  // Persists AnalyzeView's filters/results across its unmount/remount when
  // navigating to view a transaction and back, so that round-trip doesn't
  // wipe the results list the user was scrolled into.
  const [analyzeSnapshot, setAnalyzeSnapshot] = useState<AnalyzeSnapshot | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const [isAppLoading, setIsAppLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [bucketTotals, setBucketTotals] = useState<Record<string, number>>({});
  const [grandTotal, setGrandTotal] = useState<number>(0);
  const [orphanedCount, setOrphanedCount] = useState<number>(0);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [shares, setShares] = useState<BucketShare[]>([]);
  const [pendingShares, setPendingShares] = useState<BucketShare[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAddingBucket, setIsAddingBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  
  const [isBucketLoading, setIsBucketLoading] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Refs so realtime callbacks (set up once per session) always see fresh values
  // without needing to tear down and resubscribe the channels.
  const bucketIdsRef = useRef<Set<string>>(new Set());
  const profilesRef = useRef<Record<string, string>>({});

  // Derive the active bucket from the URL for global UI elements (like the header)
  const match = location.pathname.match(/\/bucket\/([^/]+)/);
  const urlBucketId = match ? match[1] : null;

  const loadedTxCount = useRef(50);
  useEffect(() => {
    if (transactions.length > loadedTxCount.current) {
      loadedTxCount.current = transactions.length;
    }
  }, [transactions.length]);

  useEffect(() => {
    bucketIdsRef.current = new Set(buckets.map(b => b.id));
  }, [buckets]);

  // Forget per-route transient state on a genuine exit from that route,
  // regardless of which control the user used to leave — the sticky
  // header's generic back button just calls navigate(-1) and bypasses each
  // view's own onBack prop, so cleanup can't rely on those callbacks alone.
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currPath = location.pathname;

    // Leaving Analyze (unless stepping into a transaction's detail) forgets
    // its search snapshot.
    const isGoingToViewTransaction = currPath.endsWith('/view-transaction');
    if (prevPath === '/analyze' && currPath !== '/analyze' && !isGoingToViewTransaction) {
      setAnalyzeSnapshot(null);
    }

    // Leaving the add/edit-transaction screen forgets which transaction was
    // being edited, so a later "Add New" doesn't silently reopen it in edit
    // mode instead of a blank form.
    if (prevPath.endsWith('/add-transaction') && currPath !== prevPath) {
      setEditingTransaction(null);
    }

    // Leaving the transaction-detail screen forgets which transaction was
    // being viewed, unless we're stepping forward into editing it (that
    // transition intentionally keeps it set).
    const isGoingToEdit = currPath.endsWith('/add-transaction');
    if (prevPath.endsWith('/view-transaction') && currPath !== prevPath && !isGoingToEdit) {
      setSelectedTransaction(null);
    }

    prevPathRef.current = currPath;
  }, [location.pathname]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Lets optimistic edit/delete look up the transaction they're adjusting
  // without needing to read it from inside a setState updater (see below) -
  // reading from `prev` there meant nesting side-effecting setState calls
  // inside another updater, which isn't safe if React ever needs to
  // re-invoke that updater to check its purity.
  const transactionsRef = useRef<Transaction[]>([]);
  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

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
    if (!urlBucketId) return null;
    return enhancedBuckets.find(b => b.id === urlBucketId) || null;
  }, [urlBucketId, enhancedBuckets]);

  // SWR Cache
  useEffect(() => {
    try {
      const cachedBuckets = localStorage.getItem('sw_buckets');
      const cachedTotals = localStorage.getItem('sw_bucketTotals');
      const cachedGrandTotal = localStorage.getItem('sw_grandTotal');
      
      if (cachedBuckets) {
        setBuckets(JSON.parse(cachedBuckets));
        setIsAppLoading(false); 
      }
      if (cachedTotals) setBucketTotals(JSON.parse(cachedTotals));
      if (cachedGrandTotal) setGrandTotal(JSON.parse(cachedGrandTotal));
    } catch (e) {
      console.warn('Failed to load cache:', e);
    }
  }, []);

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

  // Scroll restoration on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (!session) return;
    
    if (isInitial && buckets.length === 0) setIsAppLoading(true);
    if (isInitial) setIsDataLoading(true);

    try {
      const userEmail = session.user.email;

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
        let query = supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .is('deleted_at', null)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        if (urlBucketId) {
          query = query.eq('bucket_id', urlBucketId).limit(loadedTxCount.current + 10);
        } else {
          query = query.in('bucket_id', activeBucketIds).limit(loadedTxCount.current + 50);
        }

        const { data, error } = await query;
        if (!error && data) {
          transactionsData = data;
        }
      }

      const totalsMap: Record<string, number> = {};
      if (bucketTotalsRes.data) {
        bucketTotalsRes.data.forEach((row: any) => {
          totalsMap[row.bucket_id] = Number(row.total);
        });
      }

      setShares([...acceptedShares, ...outgoingShares]);
      setPendingShares(pending);
      setBuckets(allBuckets);
      if (catRes.data) setCategories(catRes.data);
      setOrphanedCount(orphanedRes.count || 0);
      setBucketTotals(totalsMap);
      setGrandTotal(Number(grandTotalRes.data || 0));
      
      setTransactions(transactionsData.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }));

      try {
        localStorage.setItem('sw_buckets', JSON.stringify(allBuckets));
        localStorage.setItem('sw_bucketTotals', JSON.stringify(totalsMap));
        localStorage.setItem('sw_grandTotal', JSON.stringify(Number(grandTotalRes.data || 0)));
      } catch (e) {
        console.warn('Failed to save cache', e);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setIsAppLoading(false);
      setIsDataLoading(false);
    }
  }, [session, urlBucketId]);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedFetchData = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchData(false);
    }, 1500);
  }, [fetchData]);

  useEffect(() => {
    if (session && !isRecovery) {
      fetchData(true);

      const myEmail = session.user.email;
      const myId = session.user.id;

      const transactionsChannel = supabase
        .channel('transactions-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
          const row: any = (payload.new && Object.keys(payload.new).length > 0) ? payload.new : payload.old;
          const actorEmail = row?.last_edited_by;
          const bucketId = row?.bucket_id;

          if (bucketId && bucketIdsRef.current.has(bucketId) && actorEmail && actorEmail !== myEmail) {
            let verb = 'updated a transaction';
            if (payload.eventType === 'INSERT') verb = 'added a transaction';
            else if (row?.deleted_at) verb = 'deleted a transaction';
            pushToast(`${actorEmail} ${verb}`);
          }

          debouncedFetchData();
        })
        .subscribe();

      const categoriesChannel = supabase
        .channel('categories-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
          const row: any = (payload.new && Object.keys(payload.new).length > 0) ? payload.new : payload.old;
          const bucketId = row?.bucket_id;
          const actorId = row?.user_id;

          if (bucketId && bucketIdsRef.current.has(bucketId) && actorId && actorId !== myId) {
            if (payload.eventType === 'INSERT') {
              const actorLabel = profilesRef.current[actorId] || 'A collaborator';
              pushToast(`${actorLabel} added a category`);
            } else if (payload.eventType === 'DELETE') {
              pushToast('A category was removed by a collaborator');
            } else {
              // Categories have no last-edited-by tracking, so edits can't be
              // reliably attributed to a specific collaborator.
              pushToast('Categories were updated by a collaborator');
            }
          }

          debouncedFetchData();
        })
        .subscribe();

      const sharesChannel = supabase
        .channel('shares-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bucket_shares' }, (payload) => {
          const row: any = (payload.new && Object.keys(payload.new).length > 0) ? payload.new : payload.old;

          if (payload.eventType === 'INSERT' && row?.status === 'pending' && row?.shared_with_email === myEmail) {
            pushToast(`${row.shared_by_email} invited you to a bucket`);
          } else if (payload.eventType === 'UPDATE' && row?.status === 'accepted' && row?.shared_by_email === myEmail) {
            pushToast(`${row.shared_with_email} accepted your invite`);
          }

          debouncedFetchData();
        })
        .subscribe();

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          fetchData(false);
        }
      };
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleVisibility);

      return () => {
        supabase.removeChannel(transactionsChannel);
        supabase.removeChannel(categoriesChannel);
        supabase.removeChannel(sharesChannel);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleVisibility);
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      };
    } else {
      setIsAppLoading(false);
    }
  }, [session, isRecovery, fetchData, debouncedFetchData, pushToast]);

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

    setTransactions(prev => [optimisticTx, ...prev]);

    const amountChange = optimisticTx.type === 'Credit' ? optimisticTx.amount : -optimisticTx.amount;
    setBucketTotals(prev => ({
      ...prev,
      [optimisticTx.bucket_id]: (prev[optimisticTx.bucket_id] || 0) + amountChange
    }));
    setGrandTotal(prev => prev + amountChange);
    return tempId;
  }, [session, categories]);

  // Swaps the temp optimistic row for the real server row once the insert
  // confirms - without this, the temp `opt-...` id lingers in local state
  // until the next debounced refetch, so editing/deleting that same
  // transaction in the meantime would fail (that id doesn't exist in the DB).
  const confirmOptimisticAdd = useCallback((tempId: string, realTx: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === tempId
      ? { ...realTx, category: categories.find(c => c.id === realTx.category_id) }
      : t
    ));
  }, [categories]);

  const optimisticEditTransaction = useCallback((updatedTx: Partial<Transaction>) => {
    if (!updatedTx.id) return;
    const t = transactionsRef.current.find(tx => tx.id === updatedTx.id);
    if (!t) return;

    const oldAmountDir = t.type === 'Credit' ? Number(t.amount) : -Number(t.amount);
    const newAmountDir = updatedTx.type === 'Credit' ? Number(updatedTx.amount || t.amount) : -Number(updatedTx.amount || t.amount);
    const difference = newAmountDir - oldAmountDir;

    setTransactions(prev => prev.map(tx => tx.id === updatedTx.id
      ? { ...tx, ...updatedTx, category: categories.find(c => c.id === (updatedTx.category_id || tx.category_id)) || tx.category }
      : tx
    ));
    setBucketTotals(prevTotals => ({
      ...prevTotals,
      [t.bucket_id]: (prevTotals[t.bucket_id] || 0) + difference
    }));
    setGrandTotal(g => g + difference);
  }, [categories]);

  const optimisticDeleteTransaction = useCallback((id: string) => {
    const t = transactionsRef.current.find(tx => tx.id === id);
    if (!t) return;

    const amountChange = t.type === 'Credit' ? -Number(t.amount) : Number(t.amount);

    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, deleted_at: new Date().toISOString() } : tx));
    setBucketTotals(prevTotals => ({
      ...prevTotals,
      [t.bucket_id]: (prevTotals[t.bucket_id] || 0) + amountChange
    }));
    setGrandTotal(g => g + amountChange);
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
      if (data) await logActivity(data.id, 'bucket_created', { name: data.name });

      setNewBucketName('');
      setIsAddingBucket(false);
      debouncedFetchData();
    } catch (err: any) {
      console.error(err.message);
    } finally {
      setIsBucketLoading(false);
    }
  };

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    if (enhancedSelectedBucket && enhancedSelectedBucket.user_id !== session.user.id) {
      console.error('Only the owner of this bucket can export its data.');
      return;
    }

    const bucketIds = enhancedSelectedBucket
      ? [enhancedSelectedBucket.id]
      : buckets
          .filter(b => b.user_id === session.user.id)
          .map(b => b.id);

    if (bucketIds.length === 0) return;

    setIsExporting(true);

    try {
      // Paginated: Supabase caps a single response at db-max-rows (default 1000).
      const allTransactions = await fetchAllRows<Transaction>(() =>
        supabase
          .from('transactions')
          .select('*, category:categories(*)')
          .in('bucket_id', bucketIds)
          .order('date', { ascending: false })
          .order('id', { ascending: false })
      );

      if (allTransactions.length === 0) return;
const splitTimestamp = (ts: string | null | undefined) => {
        if (!ts) return { date: '', time: '' };
        const d = new Date(ts);
        return {
          date: d.toLocaleDateString('en-CA'),                    // YYYY-MM-DD
          time: d.toLocaleTimeString('en-GB', { hour12: false })  // HH:MM:SS
        };
      };

      const exportData = allTransactions.map(t => {
        const bucket = enhancedBuckets.find(b => b.id === t.bucket_id);
        const created = splitTimestamp(t.created_at);
        const updated = splitTimestamp(t.updated_at);
        const deleted = splitTimestamp(t.deleted_at);

        return {
          Date: new Date(t.date).toLocaleDateString('en-CA'),
          Type: t.type,
          Amount: t.amount,
          'Signed Amount': t.type === 'Debit' ? -Math.abs(t.amount) : Math.abs(t.amount),
          Bucket: bucket?.name || 'Unknown',
          Archived: bucket?.archived_at ? 'Yes' : 'No',
          Category: (t as any).category?.name || '',
          Remarks: t.remarks,
          Attachment: t.file_url || '',
          'Last Edited By': t.last_edited_by || 'Unknown',
          'Created On': created.date,
          'Created At': created.time,
          'Updated On': updated.date,
          'Updated At': updated.time,
          Status: t.deleted_at ? 'Deleted' : 'Active',
          'Deleted On': deleted.date,
          'Deleted At': deleted.time
        };
      });
      
      const fileName = enhancedSelectedBucket 
        ? `SpendWise_${enhancedSelectedBucket.name}_${new Date().toISOString().split('T')[0]}.csv`
        : `SpendWise_MyBuckets_${new Date().toISOString().split('T')[0]}.csv`;

      downloadCSV(exportData, fileName);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [enhancedSelectedBucket, session, buckets, enhancedBuckets, isExporting]);

  const activeBuckets = useMemo(() => enhancedBuckets.filter(b => !b.archived_at), [enhancedBuckets]);
  
  const activeGlobalTransactions = useMemo(() => {
    const activeBucketIds = new Set(activeBuckets.map(b => b.id));
    return transactions.filter(t => activeBucketIds.has(t.bucket_id));
  }, [transactions, activeBuckets]);

  const getOwnerEmail = useCallback((bucket: Bucket) => {
    const share = shares.find(s => s.bucket_id === bucket.id);
    if (share) return share.shared_by_email;
    if (bucket.user_id === session?.user?.id) return session?.user?.email;
    return '';
  }, [shares, session]);

  const handleRefresh = useCallback(async () => {
    await fetchData(false);
  }, [fetchData]);

  const handleTransferOwnership = useCallback(async (email: string, bucketId: string) => {
    if (!session) return;
    try {
      const { error } = await supabase.from('bucket_shares').insert({
        bucket_id: bucketId,
        shared_by_email: session.user.email,
        shared_with_email: email.trim().toLowerCase(),
        access_level: 'transfer',
        status: 'pending'
      });
      if (error) throw error;
      await logActivity(bucketId, 'ownership_transfer_initiated', { recipient: email });
      debouncedFetchData();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [session, debouncedFetchData]);

  const handleCancelTransfer = useCallback(async (shareId: string, bucketId: string) => {
    try {
      const { error } = await supabase.from('bucket_shares').delete().eq('id', shareId);
      if (error) throw error;
      await logActivity(bucketId, 'ownership_transfer_cancelled');
      debouncedFetchData();
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [debouncedFetchData]);

  const handleAcceptTransfer = useCallback(async (share: BucketShare) => {
    if (!session) return;
    try {
      const { error } = await supabase.rpc('accept_bucket_transfer', { share_id: share.id });
      if (error) throw error;
      await logActivity(share.bucket_id, 'ownership_transfer_accepted', { previous_owner: share.shared_by_email });
      debouncedFetchData();
    } catch (err: any) {
      throw new Error("Failed to accept transfer: " + err.message);
    }
  }, [session, debouncedFetchData]);

  const handleRejectTransfer = useCallback(async (shareId: string) => {
    try {
      const { error } = await supabase.rpc('reject_bucket_transfer', { share_id: shareId });
      if (error) throw error;
      debouncedFetchData();
    } catch (err: any) {
      throw new Error("Failed to reject transfer: " + err.message);
    }
  }, [debouncedFetchData]);

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
      onRecoveryComplete={() => setIsRecovery(false)} 
    />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-32">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <MemoizedSidebar
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onLogout={() => supabase.auth.signOut()}
        onExport={handleExport}
        isExporting={isExporting}
      />

      <header className="sticky top-0 z-30 bg-white shadow-sm px-4 py-4">
        <div className="max-w-md mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="p-3 rounded-2xl bg-zinc-100 shadow-sm hover:shadow-md hover:bg-zinc-200 active:scale-90 transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight uppercase leading-none cursor-pointer" onClick={() => navigate('/')}>
                SpendWise
              </h1>
              {enhancedSelectedBucket && (
                <span className="text-[10px] font-black uppercase text-zinc-400 mt-1">
                  Bucket: <span className="normal-case">{enhancedSelectedBucket.name}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {location.pathname === '/' && (
              <button
                type="button"
                onClick={() => setIsAddingBucket(true)}
                className="p-3 rounded-2xl bg-zinc-900 text-white shadow-sm hover:shadow-md hover:bg-zinc-800 active:scale-90 transition-all"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            {location.pathname !== '/' && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="p-3 rounded-2xl bg-white shadow-sm hover:shadow-md flex items-center gap-1 active:scale-95 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase">Back</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname.split('/')[1] || '/'}>
            
            {/* Home Route */}
            <Route path="/" element={
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
                onSelectBucket={(bucket) => navigate(`/bucket/${bucket.id}/dashboard`)}
                onRefresh={handleRefresh}
                onAcceptTransfer={handleAcceptTransfer}
                onRejectTransfer={handleRejectTransfer}
                onTransferOwnership={handleTransferOwnership}
                onCancelTransfer={handleCancelTransfer}
                onUpdatePreference={updatePreference}
              />
            } />

            {/* BUCKET-SPECIFIC ROUTES */}
            <Route path="/bucket/:bucketId/dashboard" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => (
                  <MemoizedDashboardView 
                    transactions={transactions.filter(t => !t.deleted_at && t.bucket_id === bucket.id)} 
                    bucket={bucket}
                    shares={shares}
                    ownerEmail={getOwnerEmail(bucket)}
                    canEdit={bucket.user_id === session.user.id || shares.find(s => s.bucket_id === bucket.id && s.shared_with_email === session.user.email)?.access_level === 'edit'}
                    profiles={profiles}
                    isLoading={isDataLoading}
                    totalBalance={bucketTotals[bucket.id] || 0}
                    onEditTransaction={(t) => {
                      setEditingTransaction(t);
                      navigate(`/bucket/${bucket.id}/add-transaction`);
                    }}
                    onViewTransaction={(t) => {
                      setSelectedTransaction(t);
                      navigate(`/bucket/${bucket.id}/view-transaction`);
                    }}/>
                )}
              </BucketRouteWrapper>
            } />

            <Route path="/bucket/:bucketId/summary" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => (
                  <MemoizedSummaryView 
                    bucket={bucket}
                    categories={categories.filter(c => c.bucket_id === bucket.id)}
                    onBack={() => navigate(-1)}
                    onCategoryClick={(categoryId, startDate, endDate) => {
                      setAnalyzeParams({ categoryId, bucketId: bucket.id, startDate, endDate, autoRun: true });
                      setAnalyzeSnapshot(null);
                      navigate('/analyze');
                    }}
                  />
                )}
              </BucketRouteWrapper>
            } />

            <Route path="/bucket/:bucketId/add-transaction" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => (
                  <MemoizedAddTransactionView 
                    categories={categories.filter(c => c.bucket_id === bucket.id)} 
                    selectedBucket={bucket}
                    editingTransaction={editingTransaction}
                    onBack={() => {
                      setEditingTransaction(null);
                      navigate(-1);
                    }}
                    onSuccess={() => {
                      setEditingTransaction(null);
                      navigate(-1);
                      debouncedFetchData();
                    }}
                    onOptimisticAdd={optimisticAddTransaction}
                    onOptimisticAddConfirm={confirmOptimisticAdd}
                    onOptimisticEdit={optimisticEditTransaction}
                    onOptimisticDelete={optimisticDeleteTransaction}
                  />
                )}
              </BucketRouteWrapper>
            } />

            <Route path="/bucket/:bucketId/categories" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => (
                  <MemoizedCategoryManagerView 
                    categories={categories.filter(c => c.bucket_id === bucket.id)} 
                    selectedBucket={bucket}
                    onBack={() => navigate(-1)}
                    onSuccess={handleRefresh}
                  />
                )}
              </BucketRouteWrapper>
            } />

            <Route path="/bucket/:bucketId/view-transaction" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => selectedTransaction ? (
                  <MemoizedTransactionDetailView 
                    transaction={selectedTransaction}
                    shares={shares}
                    profiles={profiles}
                    ownerEmail={getOwnerEmail(bucket)}
                    onBack={() => {
                      setSelectedTransaction(null);
                      navigate(-1);
                    }}
                    onEdit={() => {
                      setEditingTransaction(selectedTransaction);
                      navigate(`/bucket/${bucket.id}/add-transaction`, { replace: true });
                    }}
                  />
                ) : <Navigate to={`/bucket/${bucket.id}/dashboard`} replace />}
              </BucketRouteWrapper>
            } />

            <Route path="/bucket/:bucketId/activity" element={
              <BucketRouteWrapper buckets={enhancedBuckets}>
                {(bucket) => (
                  <MemoizedActivityLogView 
                    bucket={bucket}
                    profiles={profiles}
                    onBack={() => navigate(-1)}
                  />
                )}
              </BucketRouteWrapper>
            } />


            {/* GLOBAL ROUTES */}
            <Route path="/analyze" element={
              <MemoizedAnalyzeView 
                categories={categories}
                buckets={activeBuckets}
                shares={shares}
                profiles={profiles}
                selectedBucket={enhancedSelectedBucket}
                user={session.user}
                initialParams={analyzeParams}
                persistedState={analyzeSnapshot}
                onPersistedStateChange={setAnalyzeSnapshot}
                onBack={() => {
                  setAnalyzeParams(null);
                  navigate(-1);
                }}
                onViewTransaction={(t) => {
                  setSelectedTransaction(t);
                  navigate(`/bucket/${t.bucket_id}/view-transaction`);
                }}
              />
            } />

            <Route path="/recently-added" element={
              <MemoizedRecentlyAddedView 
                transactions={activeGlobalTransactions}
                buckets={activeBuckets}
                shares={shares}
                profiles={profiles}
                onBack={() => navigate(-1)}
                onViewTransaction={(t) => {
                  setSelectedTransaction(t);
                  navigate(`/bucket/${t.bucket_id}/view-transaction`);
                }}
              />
            } />

            <Route path="/deleted" element={
              <MemoizedDeletedTransactionsView 
                buckets={enhancedBuckets}
                shares={shares}
                profiles={profiles}
                onBack={() => navigate(-1)}
                onSuccess={handleRefresh}
                onViewTransaction={(t) => {
                  setSelectedTransaction(t);
                  navigate(`/bucket/${t.bucket_id}/view-transaction`);
                }}
              />
            } />

            <Route path="/archive" element={
              <MemoizedArchiveView 
                buckets={enhancedBuckets}
                transactions={transactions}
                onBack={() => navigate(-1)}
                onRefresh={handleRefresh}
              />
            } />

            <Route path="/profile" element={
              <MemoizedProfileView 
                session={session}
                onBack={() => navigate(-1)}
                onUpdateName={(name) => {
                  setProfiles(prev => ({ ...prev, [session.user.id]: name }));
                }}
              />
            } />

          </Routes>
        </AnimatePresence>
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30">
        <button 
          type="button"
          onClick={() => {
            setEditingTransaction(null);
            setSelectedTransaction(null);
            navigate('/');
          }}
          className="w-full bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.04)] px-4 py-6 flex justify-center items-center active:bg-zinc-100 transition-colors cursor-pointer touch-manipulation"
        >
          <div className="max-w-md mx-auto flex justify-center items-center w-full">
            <span 
              className={cn(
                "text-xs font-black uppercase tracking-wider transition-all",
                location.pathname === '/' ? "text-zinc-900 scale-110" : "text-zinc-400"
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
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white rounded-3xl z-50 p-6 shadow-xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black uppercase tracking-tighter">New Bucket</h2>
                <button onClick={() => setIsAddingBucket(false)} className="p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors">
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