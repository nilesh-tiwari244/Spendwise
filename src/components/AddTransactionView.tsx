import React, { useState, useMemo, useRef, useEffect } from 'react';
import { supabase, type Category, type Transaction, type Bucket } from '../lib/supabase';
import { ArrowLeft, Loader2, Camera, X, ChevronDown, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { ConfirmationModal } from './ConfirmationModal';
import { logActivity } from '../lib/activity';
import { motion, AnimatePresence } from 'motion/react';

interface AddTransactionViewProps {
  categories: Category[];
  selectedBucket: Bucket | null;
  editingTransaction?: Transaction | null;
  onBack: () => void;
  onSuccess: () => void;
  onOptimisticAdd: (tx: Partial<Transaction>) => void;
  onOptimisticEdit?: (tx: Partial<Transaction>) => void;
  onOptimisticDelete?: (id: string) => void;
}

export function AddTransactionView({ categories, selectedBucket, editingTransaction, onBack, onSuccess, onOptimisticAdd, onOptimisticEdit, onOptimisticDelete }: AddTransactionViewProps) {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleDelete = async () => {
    if (!editingTransaction) return;
    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from('transactions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', editingTransaction.id);

      if (deleteError) throw deleteError;
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
    setLoading(true);
    setError(null);

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

      if (!editingTransaction) {
        onOptimisticAdd(transactionData);
      }

      if (editingTransaction) {
        const { error: updateError } = await supabase
          .from('transactions')
          .update(transactionData)
          .eq('id', editingTransaction.id);
        
        if (updateError) throw updateError;
        
        if (onOptimisticEdit) {
          onOptimisticEdit({ id: editingTransaction.id, ...transactionData });
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
    <div className="space-y-6">
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
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter">Add Transaction</h2>
      </div>

      {!selectedBucket && !editingTransaction ? (
        <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
          <p className="text-xs font-bold uppercase text-zinc-400">Please select a bucket first</p>
          <button onClick={onBack} className="mt-4 text-[10px] font-black uppercase underline">Go Back</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Type Toggle */}
          <div className="flex border-2 border-zinc-900">
            <button
              type="button"
              onClick={() => setType('Debit')}
              className={cn(
                "flex-1 py-3 font-black uppercase text-sm transition-all",
                type === 'Debit' ? "bg-red-500 text-white" : "bg-white text-zinc-900"
              )}
            >
              Debit
            </button>
            <button
              type="button"
              onClick={() => setType('Credit')}
              className={cn(
                "flex-1 py-3 font-black uppercase text-sm transition-all",
                type === 'Credit' ? "bg-green-500 text-white" : "bg-white text-zinc-900"
              )}
            >
              Credit
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="brutal-input"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="brutal-input"
              />
            </div>
          </div>

          <div className="relative" ref={categoryDropdownRef}>
            <label className="block text-xs font-black uppercase mb-1">Category</label>
            <div className="relative group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors">
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
                className="brutal-input pl-10 pr-10 w-full bg-white"
              />
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                className="absolute right-0 top-0 bottom-0 px-3 border-l-2 border-zinc-900 bg-zinc-100 hover:bg-zinc-200 transition-colors"
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
                  className="absolute z-50 left-0 right-0 mt-2 bg-white border-4 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-60 overflow-y-auto"
                >
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

          <div>
            <label className="block text-xs font-black uppercase mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="brutal-input h-20 resize-none"
              placeholder="What was this for?"
            />
          </div>

          {/* File Upload */}
          <div className="flex items-center justify-between gap-4">
            <label className="text-xs font-black uppercase">Receipt Image</label>
            <div className="relative">
              {preview ? (
                <div className="relative brutal-card w-32 h-[42px] overflow-hidden">
                  <img src={preview} alt="Receipt preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => { setFile(null); setPreview(null); }}
                    className="absolute top-0 right-0 p-1 bg-zinc-900 text-white border-l-2 border-b-2 border-zinc-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 h-[42px] brutal-card bg-zinc-100 cursor-pointer hover:bg-zinc-200 transition-all">
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

          <div className="flex flex-col gap-3 pt-4">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 brutal-button bg-white text-zinc-900"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={loading || deleting}
                className="flex-[2] brutal-button flex items-center justify-center gap-2"
              >
                {(loading || deleting) && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
              </button>
            </div>
            
            {editingTransaction && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={loading || deleting}
                className="w-full brutal-button bg-red-100 text-red-600 border-red-600 hover:bg-red-200"
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
