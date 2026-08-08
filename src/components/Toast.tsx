import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Info } from 'lucide-react';

export type ToastMessage = { id: string; message: string };

interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[90%] max-w-sm space-y-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            onClick={() => onDismiss(t.id)}
            className="pointer-events-auto border-2 border-zinc-200 bg-zinc-900 text-white px-4 py-3 flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.12)] cursor-pointer"
          >
            <Info className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-tight leading-tight">{t.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
