import React from 'react';
import { X, Search, Trash2, Home, LogOut, Tag, PieChart, Download, Clock, Archive, UserCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  onNavigate: (view: any) => void;
  onLogout: () => void;
  onExport: () => void;
}

export function Sidebar({ isOpen, onClose, currentView, onNavigate, onLogout, onExport }: SidebarProps) {
  const menuItems = [
    { id: 'analyze', label: 'Analyze', icon: PieChart },
    { id: 'recently-added', label: 'Recently Added', icon: Clock },
    { id: 'archive', label: 'Archive', icon: Archive },
    { id: 'deleted', label: 'Recycle Bin', icon: Trash2 },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-64 bg-white border-r-4 border-zinc-900 z-50 p-6 flex flex-col"
          >
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Menu</h2>
              <button onClick={onClose} className="p-2 border-2 border-zinc-900 bg-zinc-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {menuItems.map((item) => (
                <motion.button
                  whileTap={{ scale: 0.95, x: 2, y: 2 }}
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 border-2 transition-all font-black uppercase text-sm",
                    currentView === item.id 
                      ? "bg-zinc-900 text-white border-zinc-900 translate-x-1 -translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" 
                      : "bg-white text-zinc-900 border-zinc-900 hover:bg-zinc-50"
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </motion.button>
              ))}
              
              <motion.button
                whileTap={{ scale: 0.95, x: 2, y: 2 }}
                onClick={() => {
                  onExport();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-zinc-900 bg-zinc-50 text-zinc-900 font-black uppercase text-sm hover:bg-zinc-100 transition-all"
              >
                <Download className="w-5 h-5" />
                Export Data
              </motion.button>
            </nav>

              <motion.button
                whileTap={{ scale: 0.95, x: 2, y: 2 }}
                onClick={() => {
                  onNavigate('profile');
                  onClose();
                }}
                className={cn(
                  "w-full flex items-center gap-4 p-4 border-2 transition-all font-black uppercase text-sm mb-2",
                  currentView === 'profile'
                    ? "bg-zinc-900 text-white border-zinc-900 translate-x-1 -translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-white text-zinc-900 border-zinc-900 hover:bg-zinc-50"
                )}
              >
                <UserCircle className="w-5 h-5" />
                Profile
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.95, x: 2, y: 2 }}
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-zinc-900 bg-red-50 text-red-600 font-black uppercase text-sm hover:bg-red-100 transition-all"
              >
              <LogOut className="w-5 h-5" />
              Logout
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
