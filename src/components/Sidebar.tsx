import React from 'react';
import { NavLink } from 'react-router-dom'; //[cite: 9]
import { X, Trash2, LogOut, PieChart, Download, Clock, Archive, UserCircle, Loader2 } from 'lucide-react'; //[cite: 14]
import { cn } from '../lib/utils'; //[cite: 14]
import { motion, AnimatePresence } from 'motion/react'; //[cite: 14]

interface SidebarProps {
  isOpen: boolean; //[cite: 14]
  onClose: () => void; //[cite: 14]
  onLogout: () => void; //[cite: 14]
  onExport: () => void | Promise<void>; //[cite: 14]
  isExporting?: boolean;
}

export function Sidebar({ isOpen, onClose, onLogout, onExport, isExporting = false }: SidebarProps) {
  // Map items to actual application URL paths[cite: 9]
  const menuItems = [
    { path: '/analyze', label: 'Analyze', icon: PieChart }, //[cite: 9, 14]
    { path: '/recently-added', label: 'Recently Added', icon: Clock }, //[cite: 9, 14]
    { path: '/archive', label: 'Archive', icon: Archive }, //[cite: 9, 14]
    { path: '/deleted', label: 'Recycle Bin', icon: Trash2 }, //[cite: 9, 14]
  ];

  // Keep the drawer open while the export runs so the user can see progress,
  // then close once the CSV has been handed off to the browser.
  const handleExportClick = async () => {
    if (isExporting) return;
    try {
      await onExport();
    } finally {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && ( //[cite: 14]
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} //[cite: 14]
            animate={{ opacity: 1 }} //[cite: 14]
            exit={{ opacity: 0 }} //[cite: 14]
            onClick={onClose} //[cite: 14]
            className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40" //[cite: 14]
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '-100%' }} //[cite: 14]
            animate={{ x: 0 }} //[cite: 14]
            exit={{ x: '-100%' }} //[cite: 14]
            transition={{ type: 'spring', damping: 25, stiffness: 200 }} //[cite: 14]
            className="fixed top-0 left-0 bottom-0 w-64 bg-white rounded-r-3xl shadow-xl z-50 p-6 flex flex-col" //[cite: 14]
          >
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Menu</h2> {/*[cite: 14] */}
              <button onClick={onClose} className="p-2 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"> {/*[cite: 14] */}
                <X className="w-5 h-5" /> {/*[cite: 14] */}
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {menuItems.map((item) => (
                <NavLink //[cite: 9]
                  key={item.path} //[cite: 9]
                  to={item.path} //[cite: 9]
                  onClick={onClose} //[cite: 9]
                  className={({ isActive }) => cn( //[cite: 9]
                    "w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black uppercase text-sm active:scale-95", //[cite: 14]
                    isActive //[cite: 9]
                      ? "bg-zinc-900 text-white shadow-md" //[cite: 14]
                      : "bg-white text-zinc-900 shadow-sm hover:shadow-md" //[cite: 14]
                  )}
                >
                  <item.icon className="w-5 h-5" /> {/*[cite: 14] */}
                  {item.label} {/*[cite: 14] */}
                </NavLink>
              ))}

              {/* Export Button uses motion since it triggers a local function instead of routing */}
              <motion.button
                whileTap={isExporting ? undefined : { scale: 0.95 }} //[cite: 14]
                onClick={handleExportClick}
                disabled={isExporting}
                aria-busy={isExporting}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl font-black uppercase text-sm transition-all", //[cite: 14]
                  isExporting
                    ? "bg-zinc-200 text-zinc-500 cursor-not-allowed"
                    : "bg-zinc-100 text-zinc-900 shadow-sm hover:shadow-md" //[cite: 14]
                )}
              >
                {isExporting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" /> //[cite: 14]
                )}
                {isExporting ? 'Exporting...' : 'Export Data'} {/*[cite: 14] */}
              </motion.button>
            </nav>

            <NavLink //[cite: 9]
              to="/profile" //[cite: 9]
              onClick={onClose} //[cite: 9]
              className={({ isActive }) => cn( //[cite: 9]
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-black uppercase text-sm mb-2 active:scale-95", //[cite: 14]
                isActive //[cite: 9]
                  ? "bg-zinc-900 text-white shadow-md" //[cite: 14]
                  : "bg-white text-zinc-900 shadow-sm hover:shadow-md" //[cite: 14]
              )}
            >
              <UserCircle className="w-5 h-5" /> {/*[cite: 14] */}
              Profile {/*[cite: 14] */}
            </NavLink>

            <motion.button
              whileTap={{ scale: 0.95 }} //[cite: 14]
              onClick={() => {
                onLogout(); //[cite: 14]
                onClose(); //[cite: 14]
              }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-100 text-red-600 font-black uppercase text-sm shadow-sm hover:shadow-md transition-all" //[cite: 14]
            >
              <LogOut className="w-5 h-5" /> {/*[cite: 14] */}
              Logout {/*[cite: 14] */}
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
