import React, { useState } from 'react';
import { supabase, type Category, type Bucket } from '../lib/supabase';
import { ArrowLeft, Loader2, Plus, Trash2, Edit2 } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

interface CategoryManagerViewProps {
  categories: Category[];
  selectedBucket: Bucket | null;
  onBack: () => void;
  onSuccess: () => void;
}

export function CategoryManagerView({ categories, selectedBucket, onBack, onSuccess }: CategoryManagerViewProps) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { error } = await supabase
        .from('categories')
        .insert({ user_id: user.id, bucket_id: selectedBucket?.id, name: newName.trim() });

      if (error) throw error;
      setNewName('');
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editingName.trim()) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('categories')
        .update({ name: editingName.trim() })
        .eq('id', id);

      if (error) throw error;
      setEditingId(null);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setDeletingId(null);
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
        title="Delete Category?"
        message="This will permanently delete the category. Transactions using this category will become uncategorized."
        onConfirm={() => {
          if (deletingId) handleDelete(deletingId);
          setShowDeleteConfirm(false);
        }}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeletingId(null);
        }}
      />
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-2xl font-black uppercase tracking-tighter">Categories</h2>
      </div>

      {selectedBucket ? (
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-xs font-black uppercase mb-1">New Category Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="brutal-input"
                placeholder="e.g. Travel"
              />
              <button
                type="submit"
                disabled={loading}
                className="brutal-button aspect-square p-2 flex items-center justify-center"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {error && <p className="text-red-600 text-xs font-bold uppercase">{error}</p>}
        </form>
      ) : (
        <div className="brutal-card bg-zinc-100 p-2 border-dashed">
          <p className="text-[10px] font-bold uppercase text-zinc-400 text-center">
            Select a bucket to add new categories
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest border-b-2 border-zinc-900 pb-2">Existing Categories</h3>
        <div className="grid grid-cols-1 gap-2">
          {categories.map((c) => (
            <div key={c.id} className="brutal-card pl-1 pr-4 py-1 flex items-center justify-between bg-white">
              {editingId === c.id ? (
                <div className="flex items-center w-full gap-2">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="brutal-input py-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={() => handleUpdate(c.id)}
                    className="text-[10px] font-black uppercase underline"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-[10px] font-black uppercase underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : deletingId === c.id ? (
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-[10px] font-black uppercase text-red-600">Delete?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-[10px] font-black uppercase underline"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="text-[10px] font-black uppercase underline"
                    >
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="font-black text-sm pl-2">{c.name}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditingId(c.id);
                        setEditingName(c.name);
                      }}
                      className="p-1.5 text-zinc-600 hover:bg-zinc-50 transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(c.id);
                        setShowDeleteConfirm(true);
                      }}
                      className="p-1.5 text-red-600 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
