import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = true,
  isLoading = false
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isLoading ? undefined : onCancel}
            className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-[100]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white border-4 border-zinc-900 z-[101] p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className={isDestructive ? "text-red-600" : "text-zinc-900"}>
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter leading-none mb-2">{title}</h3>
                <p className="text-xs font-bold text-zinc-500 uppercase leading-relaxed">{message}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1 py-3 border-2 border-zinc-900 bg-white text-zinc-900 font-black uppercase text-xs hover:bg-zinc-50 transition-all disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`flex-1 py-3 border-2 border-zinc-900 font-black uppercase text-xs text-white transition-all disabled:opacity-50 ${
                  isDestructive ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"
                }`}
              >
                {isLoading ? "Wait..." : confirmText}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
