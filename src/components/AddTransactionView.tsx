import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase, type Category, type Transaction, type Bucket } from '../lib/supabase';
import { ArrowLeft, Loader2, Camera, X, ChevronDown, Search } from 'lucide-react';
import { cn } from '../lib/utils';
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
}

export function AddTransactionView({ categories, selectedBucket, editingTransaction, onBack, onSuccess, onOptimisticAdd, onOptimisticAddConfirm, onOptimisticEdit, onOptimisticDelete }: AddTransactionViewProps) {
  const [type, setType] = useState<'Credit' | 'Debit'>(editingTransaction?.type || 'Debit');
  const [amount, setAmount] = useState(editingTransaction?.amount.toString() || '');
  const [date, setDate] = useState(editingTransaction ? new Date(editingTransaction.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState(editingTransaction?.category_id || '');
  const [categorySearch, setCategorySearch] = useState(categories.find(c => c.id === editingTransaction?.category_id)?.name || '');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    return categories.filter(c => 
      c.name.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categories, categorySearch]);

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
    setDate(new Date().toISOString().split('T')[0]);
    setCategoryId('');
    setCategorySearch('');
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
    <div className="space-y-8">
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete Transaction?"
        message="This transaction will be moved to the recycle bin for 30 days."
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-3 rounded-2xl bg-white shadow-md hover:shadow-lg transition-shadow">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter">Add Transaction</h2>
      </div>

      {!selectedBucket && !editingTransaction ? (
        <div className="text-center py-12 rounded-2xl bg-white shadow-md">
          <p className="text-xs font-bold uppercase text-zinc-400">Please select a bucket first</p>
          <button onClick={onBack} className="mt-4 text-[10px] font-black uppercase underline">Go Back</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type Toggle */}
          <div className="flex rounded-full bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setType('Debit')}
              className={cn(
                "flex-1 py-3 rounded-full font-black uppercase text-sm transition-all",
                type === 'Debit' ? "bg-red-100 text-red-600 shadow-sm" : "text-zinc-400"
              )}
            >
              Debit
            </button>
            <button
              type="button"
              onClick={() => setType('Credit')}
              className={cn(
                "flex-1 py-3 rounded-full font-black uppercase text-sm transition-all",
                type === 'Credit' ? "bg-green-100 text-green-600 shadow-sm" : "text-zinc-400"
              )}
            >
              Credit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase mb-1.5 text-zinc-500">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl bg-white shadow-sm px-4 py-4 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase mb-1.5 text-zinc-500">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-2xl bg-white shadow-sm px-4 py-4 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
              />
            </div>
          </div>

          <div className="relative" ref={categoryDropdownRef}>
            <label className="block text-xs font-black uppercase mb-1.5 text-zinc-500">Category</label>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => {
                  setCategorySearch(e.target.value);
                  setIsCategoryDropdownOpen(true);
                  // If user clears the field, clear the categoryId too
                  if (!e.target.value) setCategoryId('');
                }}
                onFocus={() => setIsCategoryDropdownOpen(true)}
                placeholder="Search or select category..."
                className="w-full rounded-2xl bg-white shadow-sm pl-11 pr-11 py-4 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
              />
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 transition-colors"
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
                  {filteredCategories.length === 0 ? (
                    <div className="p-4 text-center text-xs font-bold text-zinc-400 uppercase">
                      No matching categories
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
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

          <div>
            <label className="block text-xs font-black uppercase mb-1.5 text-zinc-500">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full rounded-2xl bg-white shadow-sm px-4 py-4 h-24 resize-none text-base font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10 transition-shadow"
              placeholder="What was this for?"
            />
          </div>

          {/* File Upload */}
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs font-black uppercase text-zinc-500">Receipt Image</label>
            <div className="relative">
              {isCompressingFile ? (
                <div className="flex items-center gap-2 px-4 h-11 rounded-full bg-white shadow-sm">
                  <Loader2 className="w-4 h-4 text-zinc-900 animate-spin" />
                  <span className="text-[10px] font-black uppercase text-zinc-900">Compressing...</span>
                </div>
              ) : preview ? (
                <div className="relative w-32 h-11 rounded-2xl overflow-hidden shadow-sm">
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
                <label className="flex items-center gap-2 px-4 h-11 rounded-full bg-white shadow-sm cursor-pointer hover:shadow-md transition-shadow">
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

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || deleting}
              className="w-full rounded-full bg-zinc-900 text-white py-4 font-bold text-base shadow-md hover:shadow-lg hover:bg-zinc-800 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {(loading || deleting) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="w-full rounded-full bg-white text-zinc-900 py-4 font-bold text-base shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
            >
              Clear
            </button>

            {editingTransaction && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading || deleting}
                className="w-full rounded-full bg-red-100 text-red-600 py-4 font-bold text-base shadow-sm hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-50"
              >
                Delete Transaction
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
