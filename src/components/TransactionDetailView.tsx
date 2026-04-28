import React from 'react';
import { type Transaction, type BucketShare } from '../lib/supabase';
import { formatCurrency, formatDate, cn, formatUserDisplay } from '../lib/utils';
import { ArrowLeft, Calendar, Tag, FileText, ExternalLink, Mail } from 'lucide-react';

interface TransactionDetailViewProps {
  transaction: Transaction;
  shares: BucketShare[];
  profiles: Record<string, string>;
  ownerEmail: string;
  onBack: () => void;
  onEdit: () => void;
}

export function TransactionDetailView({ transaction, shares, profiles, ownerEmail, onBack, onEdit }: TransactionDetailViewProps) {
  const activeShareEmails = shares.filter(s => s.bucket_id === transaction.bucket_id && s.status === 'accepted').map(s => s.shared_with_email);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-zinc-100 transition-all border-2 border-zinc-900 bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-black uppercase tracking-tight">Transaction Details</h2>
        </div>
        <button 
          onClick={onEdit}
          className="p-2 brutal-card bg-zinc-900 text-white flex items-center gap-2 hover:bg-zinc-800"
        >
          <FileText className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase">Edit</span>
        </button>
      </div>

      <div className="brutal-card bg-white p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <span className={cn(
              "text-[10px] font-black uppercase px-2 py-1 border-2 border-zinc-900",
              transaction.type === 'Credit' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              {transaction.type}
            </span>
            <h3 className="text-2xl font-black mt-3 tracking-tighter">
              {transaction.type === 'Credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
            </h3>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-zinc-400">
              <Calendar className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase">{formatDate(transaction.date)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t-2 border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-zinc-400">Category</span>
              <span className="font-black text-sm">{transaction.category?.name || ''}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-zinc-400">Remarks</span>
              <span className="font-bold text-sm">{transaction.remarks || ''}</span>
            </div>
          </div>

          {transaction.last_edited_by && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase text-zinc-400">Added By</span>
                <span className={cn(
                  "font-bold text-sm",
                  !activeShareEmails.includes(transaction.last_edited_by) && transaction.last_edited_by !== ownerEmail
                    ? "text-zinc-400 italic"
                    : "text-zinc-900"
                )}>
                  {formatUserDisplay(transaction.last_edited_by, ownerEmail, activeShareEmails, profiles)}
                </span>
              </div>
            </div>
          )}
        </div>

        {transaction.file_url && (
          <div className="pt-6 border-t-2 border-zinc-100">
            <span className="block text-[10px] font-black uppercase text-zinc-400 mb-3">Receipt / Attachment</span>
            <div className="brutal-card overflow-hidden bg-zinc-100">
              <img 
                src={transaction.file_url} 
                alt="Receipt" 
                className="w-full h-auto object-contain max-h-[400px]"
                referrerPolicy="no-referrer"
              />
              <div className="p-3 bg-white border-t-2 border-zinc-900 flex justify-end">
                <a 
                  href={transaction.file_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[10px] font-black uppercase underline"
                >
                  Open Original <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
