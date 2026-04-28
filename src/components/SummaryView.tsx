import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Filter, ClipboardList } from 'lucide-react';
import { type Transaction, type Category } from '../lib/supabase';

interface SummaryViewProps {
  transactions: Transaction[];
  categories: Category[];
  isSyncing?: boolean;
  onBack: () => void;
  onCategoryClick?: (categoryId: string, startDate?: string, endDate?: string) => void;
}

export function SummaryView({ transactions, categories, isSyncing, onBack, onCategoryClick }: SummaryViewProps) {
  const [isAllChecked, setIsAllChecked] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState('');
  const [appliedEndDate, setAppliedEndDate] = useState('');

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
      setAppliedStartDate('');
      setAppliedEndDate('');
    }
  };

  const categoryTotals = useMemo(() => {
    let filteredTransactions = transactions;

    if (!isAllChecked && appliedStartDate && appliedEndDate) {
      const start = new Date(appliedStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(appliedEndDate);
      end.setHours(23, 59, 59, 999);

      filteredTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= start && tDate <= end;
      });
    }

    const totals: Record<string, number> = {};

    // Initialize all available categories for this bucket
    categories.forEach(cat => {
      totals[cat.id] = 0;
    });

    filteredTransactions.forEach(t => {
      if (t.category_id) {
        if (t.type === 'Credit') {
          totals[t.category_id] += Math.abs(t.amount);
        } else {
          totals[t.category_id] -= Math.abs(t.amount);
        }
      }
    });

    return totals;
  }, [transactions, isAllChecked, appliedStartDate, appliedEndDate]);

  const sortedCategoryTotals = useMemo(() => {
    return Object.entries(categoryTotals).sort((a, b) => {
      const catA = categories.find(c => c.id === a[0])?.name || '';
      const catB = categories.find(c => c.id === b[0])?.name || '';
      return catA.localeCompare(catB);
    });
  }, [categoryTotals, categories]);

  const isFilterDisabled = isAllChecked || !startDate || !endDate;

  if (isSyncing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button 
            disabled
            className="p-2 opacity-50 brutal-card"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <ClipboardList className="w-6 h-6" />
            Summary of Categories
          </h2>
        </div>

        <div className="brutal-card bg-white p-2 space-y-4 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-zinc-100 border-2 border-zinc-200" />
            <div className="h-4 w-12 bg-zinc-100" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="h-3 w-16 bg-zinc-50" />
              <div className="h-10 w-full bg-zinc-100" />
            </div>
            <div className="space-y-1">
              <div className="h-3 w-16 bg-zinc-50" />
              <div className="h-10 w-full bg-zinc-100" />
            </div>
          </div>

          <div className="w-full h-12 bg-zinc-100 border-2 border-zinc-200" />
        </div>

        <div className="brutal-card bg-white overflow-hidden">
          <div className="grid grid-cols-2 bg-zinc-100 border-b-2 border-zinc-900 pl-1 pr-4 py-1">
            <div className="text-xs font-black uppercase tracking-widest pl-2">Categories</div>
            <div className="text-xs font-black uppercase tracking-widest text-right">Total</div>
          </div>
          <div className="divide-y-2 divide-zinc-100">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="grid grid-cols-2 pl-1 pr-4 py-1 items-center animate-pulse">
                <div className="h-4 w-24 bg-zinc-100 ml-2" />
                <div className="h-5 w-20 bg-zinc-50 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex justify-center p-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-2 border-amber-500 text-amber-700 font-black uppercase text-xs animate-pulse">
             <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
             Syncing Full History...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-zinc-200 brutal-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6" />
          Summary of Categories
          {isSyncing && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 border border-amber-500 text-[10px] text-amber-700 animate-pulse rounded-full lowercase">
              <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping" />
              Syncing full history...
            </div>
          )}
        </h2>
      </div>

      <div className="brutal-card bg-white p-4 space-y-4">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="all-checkbox"
            checked={isAllChecked}
            onChange={handleAllChange}
            className="w-5 h-5 border-2 border-zinc-900 rounded-none accent-zinc-900"
          />
          <label htmlFor="all-checkbox" className="font-black uppercase text-sm cursor-pointer">
            All
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
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
          <div className="space-y-1">
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
          disabled={isFilterDisabled}
          className={`w-full brutal-button py-3 text-sm font-black uppercase flex items-center justify-center gap-2 transition-colors ${
            isFilterDisabled 
              ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-zinc-300' 
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="brutal-card bg-white overflow-hidden">
        <div className="grid grid-cols-2 bg-zinc-100 border-b-2 border-zinc-900 pl-1 pr-4 py-1">
          <div className="text-xs font-black uppercase tracking-widest pl-2">Categories</div>
          <div className="text-xs font-black uppercase tracking-widest text-right">Total</div>
        </div>
        <div className="divide-y-2 divide-zinc-100">
          {sortedCategoryTotals.length === 0 ? (
            <div className="p-6 text-center text-sm font-bold text-zinc-500 uppercase">
              No categories found
            </div>
          ) : (
            sortedCategoryTotals.map(([categoryId, total]) => {
              const category = categories.find(c => c.id === categoryId);
              if (!category) return null;
              
              return (
                <div 
                  key={categoryId} 
                  onClick={() => onCategoryClick?.(categoryId, isAllChecked ? undefined : appliedStartDate, isAllChecked ? undefined : appliedEndDate)}
                  className="grid grid-cols-2 pl-1 pr-4 py-1 items-center hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  <div className="font-bold text-sm flex items-center gap-2 pl-2">
                    {category.name}
                  </div>
                  <div className={`text-right font-black ${total < 0 ? 'text-rose-600' : total > 0 ? 'text-emerald-600' : 'text-zinc-900'}`}>
                    {total < 0 ? '-' : total > 0 ? '+' : ''}₹{Math.abs(total).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
