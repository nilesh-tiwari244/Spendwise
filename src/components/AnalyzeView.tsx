import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase, type Transaction, type Category, type Bucket, type BucketShare } from '../lib/supabase';
import { formatCurrency, cn, truncateRemarks, getDateParts, formatUserDisplay } from '../lib/utils';
import { ArrowLeft, Search as SearchIcon, Tag, X, PieChart, TrendingUp, TrendingDown, Wallet, Printer, AlertCircle, ChevronDown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AnalyzeViewProps {
  categories: Category[];
  buckets: Bucket[];
  shares: BucketShare[];
  profiles: Record<string, string>;
  selectedBucket: Bucket | null;
  user: any;
  initialParams?: {
    categoryId?: string;
    startDate?: string;
    endDate?: string;
    autoRun?: boolean;
  } | null;
  onBack: () => void;
  onViewTransaction: (transaction: Transaction) => void;
}

// Helper to determine if text should be light or dark based on background color
function getContrastColor(hexColor: string | undefined): string {
  if (!hexColor || hexColor === '#ffffff' || hexColor === 'transparent') return 'text-zinc-900';
  const color = hexColor.replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? 'text-zinc-900' : 'text-white';
}

export function AnalyzeView({ categories, buckets, shares, profiles, selectedBucket, user, initialParams, onBack, onViewTransaction }: AnalyzeViewProps) {
  // Input States (Draft Filters)
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState(initialParams?.categoryId || '');
  const [categorySearch, setCategorySearch] = useState(categories.find(c => c.id === initialParams?.categoryId)?.name || '');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [startDate, setStartDate] = useState(initialParams?.startDate || '');
  const [endDate, setEndDate] = useState(initialParams?.endDate || '');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [selectedBucketIds, setSelectedBucketIds] = useState<string[]>(selectedBucket ? [selectedBucket.id] : []);
  
  // Results State
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedTransactions, setAnalyzedTransactions] = useState<Transaction[]>([]);

  const uniqueCategories = useMemo(() => {
    if (selectedBucket) return categories.filter(c => c.bucket_id === selectedBucket.id);
    const seen = new Set();
    return categories.filter(c => {
      const lowerName = c.name.toLowerCase();
      if (seen.has(lowerName)) return false;
      seen.add(lowerName);
      return true;
    });
  }, [categories, selectedBucket]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return uniqueCategories;
    return uniqueCategories.filter(c => 
      c.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [uniqueCategories, categorySearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Database Fetch Logic (Runs only on button click)
  const runAnalysis = async () => {
    setIsAnalyzing(true);
    
    try {
      let query = supabase
        .from('transactions')
        .select('*, category:categories(*)')
        .is('deleted_at', null);

      // Apply Bucket Filters
      if (selectedBucketIds.length > 0) {
        query = query.in('bucket_id', selectedBucketIds);
      } else {
        const activeBucketIds = buckets.map(b => b.id);
        query = query.in('bucket_id', activeBucketIds);
      }

      // Apply Exact Filters
      if (categoryId) query = query.eq('category_id', categoryId);
      if (startDate) query = query.gte('date', startDate);
      if (endDate) query = query.lte('date', endDate + 'T23:59:59');
      if (minAmount) query = query.gte('amount', minAmount);
      if (maxAmount) query = query.lte('amount', maxAmount);
      if (keyword) query = query.ilike('remarks', `%${keyword}%`);

      const { data, error } = await query
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000); // Prevents crashing if too broad, perfect for printing

      if (error) throw error;
      
      setAnalyzedTransactions(data || []);
      setIsAnalyzed(true);
    } catch (err) {
      console.error('Analysis failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-run if requested from Summary page
  useEffect(() => {
    if (initialParams?.autoRun && !isAnalyzed) {
      runAnalysis();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const credit = analyzedTransactions
      .filter(t => t.type === 'Credit')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const debit = analyzedTransactions
      .filter(t => t.type === 'Debit')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { credit, debit, net: credit - debit };
  }, [analyzedTransactions]);

  const clearFilters = () => {
    setKeyword('');
    setCategoryId('');
    setCategorySearch('');
    setStartDate('');
    setEndDate('');
    setMinAmount('');
    setMaxAmount('');
    setSelectedBucketIds(selectedBucket ? [selectedBucket.id] : []);
    setIsAnalyzed(false);
    setAnalyzedTransactions([]);
  };

  const toggleBucket = (id: string) => {
    setSelectedBucketIds(prev => 
      prev.includes(id) ? prev.filter(bid => bid !== id) : [...prev, id]
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const isAllOwned = useMemo(() => {
    if (!isAnalyzed) return true;
    const bucketMap = new Map(buckets.map(b => [b.id, b]));
    return analyzedTransactions.every(t => {
      const bucket = bucketMap.get(t.bucket_id);
      return bucket?.user_id === user.id;
    });
  }, [analyzedTransactions, buckets, user.id, isAnalyzed]);

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4 print:hidden">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-3">
          Analyze
        </h2>
      </div>

      <div className="bg-white border-2 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4 space-y-4 print:hidden">
        {!selectedBucket && (
          <div>
            <label className="block text-[10px] font-black uppercase mb-2 text-zinc-400">Buckets</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedBucketIds([])}
                className={cn(
                  "px-3 py-1 text-[10px] font-black uppercase border-2 border-zinc-900 transition-all",
                  selectedBucketIds.length === 0 ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"
                )}
              >
                All
              </button>
              {buckets.map(b => (
                <button
                  key={b.id}
                  onClick={() => toggleBucket(b.id)}
                  className={cn(
                    "px-3 py-1 text-[10px] font-black uppercase border-2 border-zinc-900 transition-all",
                    selectedBucketIds.includes(b.id) ? "bg-zinc-900 text-white" : "bg-white text-zinc-900"
                  )}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Keyword..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="brutal-input pl-10"
          />
        </div>

        <div className="relative" ref={categoryDropdownRef}>
          <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Category</label>
          <div className="relative group">
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => {
                setCategorySearch(e.target.value);
                setIsCategoryDropdownOpen(true);
                if (!e.target.value) setCategoryId('');
              }}
              onFocus={() => setIsCategoryDropdownOpen(true)}
              placeholder="All Categories"
              className="brutal-input py-2 text-xs pr-8 bg-white"
            />
            <button
              type="button"
              onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
              className="absolute right-0 top-0 bottom-0 px-2 border-l-2 border-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors"
            >
              <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", isCategoryDropdownOpen && "rotate-180")} />
            </button>
          </div>

          <AnimatePresence>
            {isCategoryDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute z-50 left-0 right-0 mt-2 bg-white border-4 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-60 overflow-y-auto"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCategoryId('');
                    setCategorySearch('');
                    setIsCategoryDropdownOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 text-sm font-bold hover:bg-zinc-50 transition-colors uppercase tracking-tight",
                    !categoryId && "bg-zinc-100"
                  )}
                >
                  All Categories
                </button>
                {filteredCategories.length === 0 ? (
                  <div className="p-4 text-center text-xs font-bold text-zinc-400 uppercase">
                    No matching categories
                  </div>
                ) : (
                  <div className="divide-y-2 divide-zinc-100">
                    {filteredCategories.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setCategoryId(c.id);
                          setCategorySearch(c.name);
                          setIsCategoryDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm font-bold hover:bg-zinc-50 transition-colors uppercase tracking-tight",
                          categoryId === c.id && "bg-zinc-100"
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="brutal-input py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="brutal-input py-2 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Min Amount</label>
            <input
              type="number"
              placeholder="0.00"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="brutal-input py-2 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase mb-1 text-zinc-400">Max Amount</label>
            <input
              type="number"
              placeholder="0.00"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="brutal-input py-2 text-xs"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={clearFilters}
            className="flex-1 brutal-button bg-white text-zinc-400 border-zinc-400 hover:text-zinc-900 hover:border-zinc-900 py-3"
          >
            Clear
          </button>
          <button 
            onClick={runAnalysis}
            disabled={isAnalyzing}
            className="flex-[2] brutal-button py-3 flex items-center justify-center gap-2"
          >
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PieChart className="w-4 h-4" />}
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </button>
        </div>
      </div>

      {isAnalyzed && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-2">
              <h3 className="text-xs font-black uppercase tracking-widest">Analysis Result</h3>
              <span className="text-[10px] font-black uppercase text-zinc-400">{analyzedTransactions.length} transactions</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="brutal-card bg-green-50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 border-2 border-zinc-900 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-green-600 opacity-60">Total Credit</div>
                    <div className="text-xl font-black tracking-tight text-green-600">{formatCurrency(stats.credit)}</div>
                  </div>
                </div>
              </div>

              <div className="brutal-card bg-red-50 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 border-2 border-zinc-900 flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-red-600 opacity-60">Total Debit</div>
                    <div className="text-xl font-black tracking-tight text-red-600">{formatCurrency(stats.debit)}</div>
                  </div>
                </div>
              </div>

              <div 
                className={cn(
                  "brutal-card p-6 flex items-center justify-between transition-colors duration-300",
                  selectedBucket?.color ? getContrastColor(selectedBucket.color) : "bg-zinc-900 text-white"
                )}
                style={selectedBucket?.color ? { backgroundColor: selectedBucket.color } : {}}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 border-2 flex items-center justify-center",
                    selectedBucket?.color 
                      ? (getContrastColor(selectedBucket.color) === 'text-white' ? "bg-white/10 border-white/20" : "bg-black/5 border-black/10")
                      : "bg-zinc-800 border-white/20"
                  )}>
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase opacity-60">Net Balance</div>
                    <div className="text-2xl font-black tracking-tight">{formatCurrency(stats.net)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center border-b-2 border-zinc-900 pb-2">
              <h3 className="text-xs font-black uppercase tracking-widest">Transactions</h3>
            </div>
            
            <div className="space-y-3">
              {analyzedTransactions.length === 0 ? (
                <div className="text-center py-8 brutal-card bg-zinc-100 border-dashed">
                  <p className="text-[10px] font-black uppercase text-zinc-400">No transactions match these filters</p>
                </div>
              ) : (
                analyzedTransactions.map((t) => {
                  const dateParts = getDateParts(t.date);
                  const bucket = buckets.find(b => b.id === t.bucket_id);
                  const bucketShares = shares.filter(s => s.bucket_id === t.bucket_id && s.status === 'accepted');
                  const activeEmails = bucketShares.map(s => s.shared_with_email);
                  const ownerEmail = bucketShares[0]?.shared_by_email || (bucket?.user_id === user.id ? user.email : '');

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
                      key={t.id}
                      whileHover={{ x: 4 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => onViewTransaction(t)}
                      className="brutal-card pl-1 pr-4 py-2 flex items-start justify-between gap-2 cursor-pointer bg-white"
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <div className={cn(
                          "w-14 h-[72px] border-2 border-zinc-900 flex-shrink-0 flex flex-col items-center justify-center font-black leading-[1.1] text-zinc-900",
                          t.type === 'Credit' ? "bg-green-100" : "bg-red-100"
                        )}>
                          <span className="text-base">{dateParts.day}</span>
                          <span className="text-xs uppercase">{dateParts.month}</span>
                          <span className="text-xs">{dateParts.year}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="text-[8px] font-black uppercase bg-zinc-900 text-white px-1.5 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                                {bucket?.name || 'No Bucket'}
                              </span>
                              <div className="border-2 border-zinc-900 px-2 py-0.5 inline-block text-[10px] font-black text-zinc-500 bg-white shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                                {t.category?.name || '---'}
                              </div>
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
                        "font-black text-xl whitespace-nowrap flex-shrink-0",
                        t.type === 'Credit' ? "text-green-600" : "text-red-600"
                      )}>
                        {t.type === 'Credit' ? '+' : '-'}{formatCurrency(t.amount)}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          <div className="print:hidden pt-4">
            {isAllOwned ? (
              <button
                onClick={handlePrint}
                className="w-full brutal-button py-4 flex items-center justify-center gap-3 bg-zinc-900 text-white hover:bg-zinc-800"
              >
                <Printer className="w-5 h-5" />
                Print Report
              </button>
            ) : (
              <div className="bg-amber-50 border-2 border-amber-500 p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-[10px] font-bold uppercase text-amber-700 leading-tight">
                  Printing is disabled because this report includes data from shared buckets. You can only print reports for data you own.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}