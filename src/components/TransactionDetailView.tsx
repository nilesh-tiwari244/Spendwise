import React, { useEffect, useState } from 'react';
import { supabase, type Transaction, type BucketShare } from '../lib/supabase';
import { formatCurrency, formatDate, cn, formatUserDisplay } from '../lib/utils';
import { ArrowLeft, Calendar, Tag, FileText, ExternalLink, Mail, History, Loader2, GitCommit } from 'lucide-react';
import { motion } from 'motion/react';

interface TransactionDetailViewProps {
  transaction: Transaction;
  shares: BucketShare[];
  profiles: Record<string, string>;
  ownerEmail: string;
  onBack: () => void;
  onEdit: () => void;
}

export function TransactionDetailView({ transaction, shares, profiles, ownerEmail, onBack, onEdit }: TransactionDetailViewProps) {
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const activeShareEmails = shares.filter(s => s.bucket_id === transaction.bucket_id && s.status === 'accepted').map(s => s.shared_with_email);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('transaction_history')
          .select('*')
          .eq('transaction_id', transaction.id)
          .order('edited_at', { ascending: false });

        if (error) throw error;
        setHistoryLogs(data || []);
      } catch (err) {
        console.error('Error fetching history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [transaction.id]);

  // Format the created_at timestamp
  let formattedAddedDate = '';
  if (transaction.created_at) {
    const d = new Date(transaction.created_at);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    formattedAddedDate = `${timeStr} ${dateStr}`;
  }

  // Format the updated_at timestamp (6 hour safety check)
  let formattedUpdatedDate = '';
  const isUpdated = transaction.updated_at && transaction.created_at && (new Date(transaction.updated_at).getTime() - new Date(transaction.created_at).getTime() > 21600000);
  
  if (isUpdated && transaction.updated_at) {
    const d = new Date(transaction.updated_at);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    formattedUpdatedDate = `${timeStr} ${dateStr}`;
  }

  return (
    <div className="space-y-6 pb-32">
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

      {/* MAIN CURRENT TRANSACTION CARD */}
      <div className="brutal-card bg-white p-6 space-y-6 relative z-10">
        <div className="absolute -top-3 left-4 bg-zinc-900 text-white text-[10px] font-black uppercase px-2 py-1 shadow-[2px_2px_0px_0px_rgba(250,204,21,1)] border-2 border-zinc-900">
          Current State
        </div>

        <div className="flex justify-between items-start pt-2">
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
              <span className="font-black text-sm">{transaction.category?.name || '---'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="block text-[10px] font-black uppercase text-zinc-400">Remarks</span>
              <span className="font-bold text-sm">{transaction.remarks || '---'}</span>
            </div>
          </div>

          {transaction.last_edited_by && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
                <Mail className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase text-zinc-400">Last Edited By</span>
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

          {/* Added On Row */}
          {formattedAddedDate && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-zinc-900 flex items-center justify-center bg-zinc-50">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase text-zinc-400">Added On</span>
                <span className="font-bold text-sm text-zinc-900">
                  {formattedAddedDate}
                </span>
              </div>
            </div>
          )}

          {/* Updated On Row */}
          {formattedUpdatedDate && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 flex items-center justify-center bg-blue-50">
                <History className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <span className="block text-[10px] font-black uppercase text-blue-500">Updated On</span>
                <span className="font-bold text-sm text-blue-600">
                  {formattedUpdatedDate}
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

      {/* VERSION HISTORY STACK */}
      {loadingHistory ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : historyLogs.length > 0 ? (
        <div className="relative pt-6 space-y-4 before:absolute before:left-8 before:top-0 before:bottom-8 before:w-0.5 before:bg-zinc-300 before:z-0">
          <div className="flex items-center gap-2 pl-2">
            <History className="w-4 h-4 text-zinc-400 relative z-10 bg-[#fafafa]" />
            <h3 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest bg-[#fafafa] pr-2 relative z-10">
              Previous Versions ({historyLogs.length})
            </h3>
          </div>

          {historyLogs.map((log, index) => {
            const editDate = new Date(log.edited_at);
            const formattedEditTime = `${editDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} ${editDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
            
            return (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={log.id} 
                className="relative pl-14 pr-2"
              >
                {/* Timeline Dot */}
                <div className="absolute left-[26px] top-4 w-4 h-4 rounded-full bg-zinc-200 border-2 border-white flex items-center justify-center z-10">
                  <GitCommit className="w-3 h-3 text-zinc-500" />
                </div>

                <div className="brutal-card bg-zinc-50 border-dashed border-2 border-zinc-200 p-4 space-y-3 shadow-none opacity-80 hover:opacity-100 transition-opacity">
                  <div className="flex justify-between items-center pb-2 border-b-2 border-zinc-200/50">
                    <div>
                      <span className="block text-[8px] font-black uppercase text-zinc-400">Changed By</span>
                      <span className="text-xs font-bold text-zinc-600">
                        {formatUserDisplay(log.edited_by, ownerEmail, activeShareEmails, profiles)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[8px] font-black uppercase text-blue-500">Replaced On</span>
                      <span className="text-xs font-black text-blue-600">{formattedEditTime}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-zinc-400">Amount</span>
                    <span className={cn(
                      "font-black tracking-tight",
                      log.type === 'Credit' ? "text-green-600/70" : "text-red-600/70"
                    )}>
                      {log.type === 'Credit' ? '+' : '-'}{formatCurrency(log.amount)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-zinc-400">Date</span>
                    <span className="font-bold text-sm text-zinc-500">{formatDate(log.date)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase text-zinc-400">Category</span>
                    <span className="font-bold text-sm text-zinc-500">{log.category_name || '---'}</span>
                  </div>

                  <div className="flex justify-between items-start pt-1">
                    <span className="text-[10px] font-black uppercase text-zinc-400">Remarks</span>
                    <span className="font-bold text-sm text-zinc-500 text-right max-w-[60%]">{log.remarks || '---'}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}