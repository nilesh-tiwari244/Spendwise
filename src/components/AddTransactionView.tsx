import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { supabase, type Category, type Transaction, type Bucket } from '../lib/supabase';
import { ArrowLeft, Loader2, Camera, X, ChevronDown, Search, Menu } from 'lucide-react';
import { cn, todayForDateInput, filterCategoriesByTyped } from '../lib/utils';
import { ConfirmationModal } from './ConfirmationModal';
import { logActivity } from '../lib/activity';
import { compressImage } from '../lib/imageCompression';
import { motion, AnimatePresence } from 'motion/react';

interface AddTransactionViewProps {
  categories: Category[];
  selectedBucket: Bucket | null;
  editingTransaction?: Transaction | null;
  onBack: () => void;
  onSuccess: () => void;
  onOptimisticAdd: (tx: Partial<Transaction>) => string;
  onOptimisticAddConfirm?: (tempId: string, realTx: Transaction) => void;
  onOptimisticEdit?: (tx: Partial<Transaction>) => void;
  onOptimisticDelete?: (id: string) => void;
  onOpenMenu?: () => void;
}

// Fades out the chip row's right edge while more chips are hidden past it.
const CHIP_ROW_FADE = 'linear-gradient(to right, #000 calc(100% - 40px), transparent)';

export function AddTransactionView({ categories, selectedBucket, editingTransaction, onBack, onSuccess, onOptimisticAdd, onOptimisticAddConfirm, onOptimisticEdit, onOptimisticDelete, onOpenMenu }: AddTransactionViewProps) {
  const [type, setType] = useState<'Credit' | 'Debit'>(editingTransaction?.type || 'Debit');
  const [amount, setAmount] = useState(editingTransaction?.amount.toString() || '');
  const [date, setDate] = useState(editingTransaction ? new Date(editingTransaction.date).toISOString().split('T')[0] : todayForDateInput());
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || '');
  const [categorySearch, setCategorySearch] = useState(categories.find(c => c.id === editingTransaction?.category_id)?.name || '');
  // What the chips and the list are filtered by: only what's been typed, so a
  // name filled in by picking a category still shows every chip.
  const [chipFilter, setChipFilter] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const chipRowRef = useRef<HTMLDivElement>(null);
  const selectedChipRef = useRef<HTMLButtonElement>(null);
  const [chipsHiddenRight, setChipsHiddenRight] = useState(false);

  // A to Z, worked out from what's already loaded, so the chips are in their
  // final order from the first frame and never reshuffle.
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );
  const visibleCategories = useMemo(
    () => filterCategoriesByTyped(sortedCategories, chipFilter),
    [sortedCategories, chipFilter]
  );
  // Changes only when the chips do - the categories prop is a new array on
  // every App render, which would otherwise keep resetting the row's scroll.
  const visibleChipKey = visibleCategories.map(c => c.id).join(',');

  const updateChipFade = useCallback(() => {
    const row = chipRowRef.current;
    setChipsHiddenRight(!!row && row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
  }, []);

  // Keep the picked chip in view (say, editing a transaction whose category is
  // far along the row); with nothing picked, show the row from its start.
  useLayoutEffect(() => {
    const row = chipRowRef.current;
    const chip = selectedChipRef.current;
    if (row && !chip) {
      row.scrollLeft = 0;
    } else if (row && chip && (chip.offsetLeft < row.scrollLeft || chip.offsetLeft + chip.offsetWidth > row.scrollLeft + row.clientWidth)) {
      row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    }
    updateChipFade();
  }, [visibleChipKey, categoryId, updateChipFade]);

  useEffect(() => {
    window.addEventListener('resize', updateChipFade);
    return () => window.removeEventListener('resize', updateChipFade);
  }, [updateChipFade]);

  const handleCategoryTyping = (value: string) => {
    setCategorySearch(value);
    setChipFilter(value);
    // Typing only picks a category when it's exactly one category's name;
    // otherwise the transaction is saved without one.
    const typed = value.trim().toLowerCase();
    const exact = typed ? categories.filter(c => c.name.trim().toLowerCase() === typed) : [];
    setCategoryId(exact.length === 1 ? exact[0].id : '');
  };

  const pickCategory = (category: Category) => {
    setCategoryId(category.id);
    setCategorySearch(category.name);
    setChipFilter('');
    setIsCategoryDropdownOpen(false);
  };

  const clearCategory = () => {
    setCategoryId('');
    setCategorySearch('');
    setChipFilter('');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [remarks, setRemarks] = useState(editingTransaction?.remarks || '');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(editingTransaction?.file_url || null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCompressingFile, setIsCompressingFile] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsCompressingFile(true);
    try {
      const compressed = await compressImage(selectedFile);
      setFile(compressed);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(compressed);
    } finally {
      setIsCompressingFile(false);
    }
  };

  const handleDelete = async () => {
    if (!editingTransaction) return;
    setDeleting(true);
    setError(null);

    try {
      const { data: deleteData, error: deleteError } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', editingTransaction.id)
        .is('deleted_at', null)
        .select('id');

      if (deleteError) throw deleteError;
      if (!deleteData || deleteData.length === 0) {
        throw new Error('This transaction was already deleted, or you no longer have permission to delete it. Go back and refresh to see the latest state.');
      }
      await logActivity(editingTransaction.bucket_id, 'transaction_deleted', { remarks: editingTransaction.remarks, amount: editingTransaction.amount });
      
      if (onOptimisticDelete) {
        onOptimisticDelete(editingTransaction.id);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleClear = () => {
    setType('Debit');
    setAmount('');
    setDate(todayForDateInput());
    setCategoryId('');
    setCategorySearch('');
    setChipFilter('');
    setIsCategoryDropdownOpen(false);
    setRemarks('');
    setFile(null);
    setPreview(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parseFloat(amount) < 0) {
      setError('Amount cannot be negative.');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      let fileUrl = preview;
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('receipts')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('receipts')
          .getPublicUrl(fileName);
        
        fileUrl = publicUrl;
      }

      const transactionData = {
        user_id: user.id,
        bucket_id: selectedBucket?.id || editingTransaction?.bucket_id,
        type,
        amount: parseFloat(amount),
        date: new Date(date).toISOString(),
        category_id: categoryId || null,
        remarks,
        file_url: fileUrl,
        last_edited_by: user.email,
        updated_at: new Date().toISOString()
      };

      let tempId: string | undefined;
      if (!editingTransaction) {
        tempId = onOptimisticAdd(transactionData);
      }

      if (editingTransaction) {
        // Match on the server's last-known updated_at, not our own guess -
        // the DB overwrites updated_at with its own clock on every write, so
        // our local optimistic value is never byte-identical to what's
        // actually stored. select() the real row back so local state adopts
        // the server's true updated_at, otherwise a second rapid edit of the
        // same transaction would falsely think someone else changed it.
        const { data: updateData, error: updateError } = await supabase
          .from('transactions')
          .update(transactionData)
          .eq('id', editingTransaction.id)
          .eq('updated_at', editingTransaction.updated_at)
          .select()
          .maybeSingle();

        if (updateError) throw updateError;
        if (!updateData) {
          throw new Error('This transaction was changed or deleted by another user since you opened it. Go back and refresh before editing again.');
        }

        if (onOptimisticEdit) {
          onOptimisticEdit(updateData);
        }

        // Log specific changes
        const changes: any = {};
        if (editingTransaction.amount !== transactionData.amount) changes.amount = { old: editingTransaction.amount, new: transactionData.amount };
        if (editingTransaction.remarks !== transactionData.remarks) changes.remarks = { old: editingTransaction.remarks, new: transactionData.remarks };
        if (new Date(editingTransaction.date).getTime() !== new Date(transactionData.date).getTime()) {
          changes.date = { 
            old: new Date(editingTransaction.date).toISOString().split('T')[0], 
            new: transactionData.date.split('T')[0] 
          };
        }

        await logActivity(transactionData.bucket_id!, 'transaction_edited', { 
          transaction_id: editingTransaction.id,
          remarks: transactionData.remarks,
          changes
        });
      } else {
        const { data, error: insertError } = await supabase
          .from('transactions')
          .insert(transactionData)
          .select()
          .single();

        if (insertError) throw insertError;
        if (data) {
          await logActivity(data.bucket_id, 'transaction_added', { remarks: data.remarks, amount: data.amount });
          // Swap the temp optimistic row for the real one immediately - if we
          // left the temp `opt-...` id in place, editing/deleting it before
          // the next refetch would fail (that id doesn't exist in the DB).
          if (tempId && onOptimisticAddConfirm) {
            onOptimisticAddConfirm(tempId, data);
          }
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Transaction?"
        message="This transaction will be moved to the recycle bin, which keeps only the 20 most recently deleted items per bucket."
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      {/* Top row like the bucket screen's - App hides its sticky header here,
          so the menu lives in this row and back takes the right corner. */}
      <div className="flex items-center gap-1 min-h-14 -mx-2">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="w-11 h-11 flex-none flex items-center justify-center rounded-full hover:bg-zinc-200 active:bg-zinc-300 transition-colors touch-manipulation"
        >
          <Menu className="w-[22px] h-[22px]" />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <h2 className="text-[17px] leading-[22px] font-extrabold uppercase tracking-tight">
            {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
          </h2>
          {selectedBucket && (
            <p className="text-xs font-semibold text-zinc-500 [overflow-wrap:anywhere]">{selectedBucket.name}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 flex-none flex items-center justify-center rounded-full hover:bg-zinc-200 active:bg-zinc-300 transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-[22px] h-[22px]" />
        </button>
      </div>

      {!selectedBucket && !editingTransaction ? (
        <div className="mt-2 text-center py-12 rounded-2xl bg-white shadow-md">
          <p className="text-xs font-bold uppercase text-zinc-400">Please select a bucket first</p>
          <button onClick={onBack} className="mt-4 text-[10px] font-black uppercase underline">Go Back</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-2 space-y-3">
          {/* Type Toggle */}
          <div className="flex rounded-full bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setType('Debit')}
              className={cn(
                "flex-1 py-2 rounded-full font-black uppercase text-sm transition-all",
                type === 'Debit' ? "bg-red-100 text-red-600 shadow-sm" : "text-zinc-400"
              )}
            >
              Debit
            </button>
            <button
              type="button"
              onClick={() => setType('Credit')}
              className={cn(
                "flex-1 py-2 rounded-full font-black uppercase text-sm transition-all",
                type === 'Credit' ? "bg-green-100 text-green-600 shadow-sm" : "text-zinc-400"
              )}
            >
              Credit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black uppercase mb-1 text-zinc-500">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-[52px] rounded-2xl bg-white shadow-sm px-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase mb-1 text-zinc-500">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-[52px] rounded-2xl bg-white shadow-sm px-4 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
              />
            </div>
          </div>

          <div className="relative" ref={categoryDropdownRef}>
            <label className="block text-xs font-black uppercase mb-1 text-zinc-500">Category</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => handleCategoryTyping(e.target.value)}
                placeholder="Type to filter, or tap below"
                className={cn(
                  "w-full h-12 rounded-2xl bg-white shadow-sm pl-11 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow",
                  categorySearch ? "pr-20" : "pr-11"
                )}
              />
              {categorySearch && (
                <button
                  type="button"
                  onClick={clearCategory}
                  aria-label="Clear category"
                  className="absolute right-11 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              {/* The full list opens only from this button; typing filters
                  the chips below instead. */}
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                aria-label="Show category list"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isCategoryDropdownOpen && "rotate-180")} />
              </button>
            </div>

            <AnimatePresence>
              {isCategoryDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg max-h-60 overflow-y-auto overflow-hidden"
                >
                  {visibleCategories.length === 0 ? (
                    <div className="p-4 text-center text-xs font-bold text-zinc-400 uppercase">
                      No match
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {visibleCategories.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCategory(c)}
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

            {/* One row of chips that scrolls sideways, A to Z; typing in the
                box above filters it. */}
            {visibleCategories.length === 0 ? (
              <p className="mt-2 h-9 flex items-center px-1 text-[13px] font-bold text-zinc-400">
                {categories.length === 0 ? 'No categories yet' : 'No match'}
              </p>
            ) : (
              <div
                ref={chipRowRef}
                onScroll={updateChipFade}
                className="relative mt-2 flex gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={chipsHiddenRight ? { WebkitMaskImage: CHIP_ROW_FADE, maskImage: CHIP_ROW_FADE } : undefined}
              >
                {visibleCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    ref={c.id === categoryId ? selectedChipRef : undefined}
                    onClick={() => pickCategory(c)}
                    className={cn(
                      "flex-none h-8 px-3 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors touch-manipulation",
                      c.id === categoryId ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 shadow-sm"
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-black uppercase mb-1 text-zinc-500">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="block w-full rounded-2xl bg-white shadow-sm px-4 py-3 h-[72px] resize-none text-base font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
              placeholder="What was this for?"
            />
          </div>

          {/* File Upload */}
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs font-black uppercase text-zinc-500">Receipt Image</label>
            <div className="relative">
              {isCompressingFile ? (
                <div className="flex items-center gap-2 px-4 h-10 rounded-full bg-white shadow-sm">
                  <Loader2 className="w-4 h-4 text-zinc-900 animate-spin" />
                  <span className="text-[10px] font-black uppercase text-zinc-900">Compressing...</span>
                </div>
              ) : preview ? (
                <div className="relative w-32 h-10 rounded-2xl overflow-hidden shadow-sm">
                  <img src={preview} alt="Receipt preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-1 right-1 p-1 rounded-full bg-zinc-900 text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 h-10 rounded-full bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                  <Camera className="w-4 h-4 text-zinc-900" />
                  <span className="text-[10px] font-black uppercase text-zinc-900">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {error && (
            <p className="text-red-600 text-xs font-bold uppercase">{error}</p>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || deleting}
              className="w-full h-[52px] rounded-full bg-zinc-900 text-white font-bold text-base shadow-md hover:shadow-lg hover:bg-zinc-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {(loading || deleting) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
            </button>

            {/* Clear and Delete are pushed well below the primary action so a
                second tap right after Update/Save doesn't accidentally land
                on them - Delete especially. */}
            <div className="mt-12 flex gap-3">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 h-11 rounded-full bg-white text-zinc-900 font-bold text-base shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
              >
                Clear
              </button>

              {editingTransaction && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={loading || deleting}
                  className="flex-1 h-11 rounded-full bg-red-100 text-red-600 font-bold text-base shadow-sm hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
