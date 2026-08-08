import React, { useState, useEffect, useMemo } from 'react';
import { supabase, type Category, type Bucket } from '../lib/supabase';
import { ArrowLeft, Filter, ClipboardList, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface SummaryViewProps {
  bucket: Bucket;
  categories: Category[];
  onBack: () => void;
  onCategoryClick?: (categoryId: string, startDate?: string, endDate?: string) => void;
}

export function SummaryView({ bucket, categories, onBack, onCategoryClick }: SummaryViewProps) {
  const [isAllChecked, setIsAllChecked] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState<string | null>(null);
  const [appliedEndDate, setAppliedEndDate] = useState<string | null>(null);
  
  const [categoryTotals, setCategoryTotals] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the summary directly from the database!
  const fetchSummary = async (start: string | null, end: string | null) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_bucket_category_summary', {
        p_bucket_id: bucket.id,
        p_start_date: start || null,
        p_end_date: end || null
      });

      if (error) throw error;

      const totalsMap: Record<string, number> = {};
      
      // Initialize all categories to 0 so they still show up on the list
      categories.forEach(cat => {
        totalsMap[cat.id] = 0;
      });

      // Populate with actual data from the server
      if (data) {
        data.forEach((row: any) => {
          totalsMap[row.category_id] = Number(row.total);
        });
      }

      setCategoryTotals(totalsMap);
    } catch (err) {
      console.error('Error fetching summary:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run the fetch whenever the applied filters change
  useEffect(() => {
    fetchSummary(appliedStartDate, appliedEndDate);
  }, [bucket.id, appliedStartDate, appliedEndDate, categories]);

  const handleDateFocus = () => {
    setIsAllChecked(false);
  };

  const handleFilterClick = () => {
    if (!isAllChecked && startDate && endDate) {
      setAppliedStartDate(startDate);
      setAppliedEndDate(endDate);
    }
  };

  const handleAllChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAllChecked(e.target.checked);
    if (e.target.checked) {
      setAppliedStartDate(null);
      setAppliedEndDate(null);
      setStartDate('');
      setEndDate('');
    }
  };

  const sortedCategoryTotals = useMemo(() => {
    return Object.entries(categoryTotals).sort((a, b) => {
      const catA = categories.find(c => c.id === a[0])?.name || '';
      const catB = categories.find(c => c.id === b[0])?.name || '';
      return catA.localeCompare(catB);
    });
  }, [categoryTotals, categories]);

  const isFilterDisabled = isAllChecked || !startDate || !endDate;

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-zinc-200 brutal-card transition-colors bg-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          Summary
        </h2>
      </div>

      <div className="brutal-card bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="all-checkbox"
            checked={isAllChecked}
            onChange={handleAllChange}
            className="w-5 h-5 rounded-md accent-zinc-900"
          />
          <label htmlFor="all-checkbox" className="font-black uppercase text-sm cursor-pointer">
            All Time
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 min-w-0">
            <label className="text-[10px] font-black uppercase text-zinc-500 block">Start Date</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                handleDateFocus();
              }}
              onFocus={handleDateFocus}
              className="w-full brutal-input text-sm p-2"
            />
          </div>
          <div className="space-y-1 min-w-0">
            <label className="text-[10px] font-black uppercase text-zinc-500 block">End Date</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                handleDateFocus();
              }}
              onFocus={handleDateFocus}
              className="w-full brutal-input text-sm p-2"
            />
          </div>
        </div>

        <button 
          onClick={handleFilterClick}
          disabled={isFilterDisabled || isLoading}
          className={`w-full brutal-button py-3 text-sm font-black uppercase flex items-center justify-center gap-2 transition-colors ${
            isFilterDisabled 
              ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-zinc-300' 
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
          }`}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
          Apply Filter
        </button>
      </div>

      <div className="brutal-card bg-white overflow-hidden">
        {/* Restored py-1 for compact header */}
        <div className="grid grid-cols-2 bg-zinc-100 pl-1 pr-4 py-2">
          <div className="text-xs font-black uppercase tracking-widest pl-2">Categories</div>
          <div className="text-xs font-black uppercase tracking-widest text-right">Total</div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {sortedCategoryTotals.length === 0 ? (
              <div className="p-6 text-center text-sm font-bold text-zinc-500 uppercase">
                No categories found
              </div>
            ) : (
              sortedCategoryTotals.map(([categoryId, total]) => {
                const category = categories.find(c => c.id === categoryId);
                if (!category) return null;
                
                return (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={categoryId} 
                    onClick={() => onCategoryClick?.(categoryId, appliedStartDate || undefined, appliedEndDate || undefined)}
                    // Restored py-1 for compact rows
                    className="grid grid-cols-2 pl-1 pr-4 py-1 items-center hover:bg-zinc-50 transition-colors cursor-pointer"
                  >
                    <div className="font-bold text-sm flex items-center gap-2 pl-2">
                      {category.name}
                    </div>
                    {/* Restored emerald/rose colors and format logic */}
                    <div className={`text-right font-black ${total < 0 ? 'text-rose-600' : total > 0 ? 'text-emerald-600' : 'text-zinc-900'}`}>
                      {total < 0 ? '-' : total > 0 ? '+' : ''}₹{Math.abs(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}