import React, { useEffect, useState } from 'react';
import { supabase, type ActivityLog, type Bucket } from '../lib/supabase';
import { formatDate, cn } from '../lib/utils';
import { ArrowLeft, History, User, Info, AlertCircle, UserPlus, UserMinus, Shield, Edit, Plus, Trash2, RotateCcw, Archive } from 'lucide-react';
import { motion } from 'motion/react';

interface ActivityLogViewProps {
  bucket: Bucket;
  profiles: Record<string, string>;
  onBack: () => void;
}

export function ActivityLogView({ bucket, profiles, onBack }: ActivityLogViewProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [bucket.id]);

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('bucket_id', bucket.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      if (data) setLogs(data);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'bucket_created': return <Plus className="w-4 h-4 text-green-600" />;
      case 'bucket_archived': return <Archive className="w-4 h-4 text-zinc-400" />;
      case 'bucket_restored': return <RotateCcw className="w-4 h-4 text-blue-600" />;
      case 'invite_sent': return <UserPlus className="w-4 h-4 text-blue-600" />;
      case 'invite_accepted': return <UserPlus className="w-4 h-4 text-green-600" />;
      case 'invite_cancelled': return <UserMinus className="w-4 h-4 text-red-600" />;
      case 'access_changed': return <Shield className="w-4 h-4 text-zinc-600" />;
      case 'user_removed': return <UserMinus className="w-4 h-4 text-red-600" />;
      case 'transaction_added': return <Plus className="w-4 h-4 text-green-600" />;
      case 'transaction_edited': return <Edit className="w-4 h-4 text-blue-600" />;
      case 'transaction_deleted': return <Trash2 className="w-4 h-4 text-red-600" />;
      case 'transaction_restored': return <RotateCcw className="w-4 h-4 text-green-600" />;
      default: return <Info className="w-4 h-4 text-zinc-400" />;
    }
  };

  const formatActionMessage = (log: ActivityLog) => {
    const user = log.user_email;
    const details = log.details || {};

    switch (log.action) {
      case 'bucket_created': return `created the bucket "${details.name}"`;
      case 'bucket_archived': return `archived the bucket`;
      case 'bucket_restored': return `restored the bucket from archive`;
      case 'invite_sent': return `invited ${details.shared_with} with ${details.access_level} access`;
      case 'invite_accepted': return `joined the bucket (invited by ${details.shared_by})`;
      case 'invite_cancelled': return `cancelled invitation for ${details.email}`;
      case 'access_changed': return `changed access for ${details.email} from ${details.old_level} to ${details.new_level}`;
      case 'user_removed': return `removed ${details.email} from the bucket`;
      case 'transaction_added': return `added transaction: "${details.remarks}" (${details.amount})`;
      case 'transaction_edited': {
        const changes = details.changes || {};
        const changeMsgs = Object.entries(changes).map(([key, val]: [string, any]) => 
          `${key} from "${val.old}" to "${val.new}"`
        );
        return `edited transaction "${details.remarks}": ${changeMsgs.join(', ')}`;
      }
      case 'transaction_deleted': return `deleted transaction: "${details.remarks}" (${details.amount})`;
      case 'transaction_restored': return `restored transaction: "${details.remarks}"`;
      default: return `performed ${log.action}`;
    }
  };

  return (
    <div className="space-y-6 pb-32">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 brutal-card bg-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-none">Activity Log</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-black uppercase text-zinc-400">History of {bucket.name}</span>
            <span className="w-1 h-1 bg-zinc-300 rounded-full" />
            <span className="text-[10px] font-black uppercase text-amber-500">Top 20 Logs Retained</span>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border-2 border-amber-500 p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
        <p className="text-[9px] font-bold uppercase text-amber-700 leading-tight">
          To save database space, only the last 20 activity logs are kept. Older logs are automatically deleted.
        </p>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 brutal-card bg-zinc-100 border-dashed">
            <p className="text-xs font-bold uppercase text-zinc-400">No activity recorded yet</p>
          </div>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
            {logs.map((log) => (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                key={log.id}
                className="relative pl-12"
              >
                <div className="absolute left-0 top-1 w-10 h-10 brutal-card bg-white flex items-center justify-center z-10">
                  {getActionIcon(log.action)}
                </div>
                <div className="brutal-card bg-white p-3 space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-black uppercase text-zinc-900 flex items-center gap-1">
                      <User className="w-3 h-3" /> {profiles[log.user_id] || profiles[log.user_email] || log.user_email}
                    </span>
                    <span className="text-[8px] font-bold uppercase text-zinc-400 whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-zinc-600 leading-tight">
                    {formatActionMessage(log)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const Loader2 = ({ className }: { className?: string }) => (
  <svg className={cn("animate-spin", className)} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2V6M12 18V22M6 12H2M22 12H18M19.078 4.922L16.25 7.75M7.75 16.25L4.922 19.078M19.078 19.078L16.25 16.25M7.75 7.75L4.922 4.922" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
