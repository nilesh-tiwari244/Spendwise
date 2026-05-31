import React from 'react';
import { NavLink } from 'react-router-dom'; //[cite: 9]
import { X, Trash2, LogOut, PieChart, Download, Clock, Archive, UserCircle } from 'lucide-react'; //[cite: 14]
import { cn } from '../lib/utils'; //[cite: 14]
import { motion, AnimatePresence } from 'motion/react'; //[cite: 14]

interface SidebarProps {
  isOpen: boolean; //[cite: 14]
  onClose: () => void; //[cite: 14]
  onLogout: () => void; //[cite: 14]
  onExport: () => void; //[cite: 14]
}

export function Sidebar({ isOpen, onClose, onLogout, onExport }: SidebarProps) {
  // Map items to actual application URL paths[cite: 9]
  const menuItems = [
    { path: '/analyze', label: 'Analyze', icon: PieChart }, //[cite: 9, 14]
    { path: '/recently-added', label: 'Recently Added', icon: Clock }, //[cite: 9, 14]
    { path: '/archive', label: 'Archive', icon: Archive }, //[cite: 9, 14]
    { path: '/deleted', label: 'Recycle Bin', icon: Trash2 }, //[cite: 9, 14]
  ];

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
            className="fixed top-0 left-0 bottom-0 w-64 bg-white border-r-4 border-zinc-900 z-50 p-6 flex flex-col" //[cite: 14]
          >
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-2xl font-black uppercase tracking-tighter">Menu</h2> {/*[cite: 14] */}
              <button onClick={onClose} className="p-2 border-2 border-zinc-900 bg-zinc-100"> {/*[cite: 14] */}
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
                    "w-full flex items-center gap-4 p-4 border-2 transition-all font-black uppercase text-sm", //[cite: 14]
                    "active:scale-95 active:translate-x-[2px] active:translate-y-[2px]", // Custom interactive click bounce style[cite: 9]
                    isActive //[cite: 9]
                      ? "bg-zinc-900 text-white border-zinc-900 translate-x-1 -translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" //[cite: 14]
                      : "bg-white text-zinc-900 border-zinc-900 hover:bg-zinc-50" //[cite: 14]
                  )}
                >
                  <item.icon className="w-5 h-5" /> {/*[cite: 14] */}
                  {item.label} {/*[cite: 14] */}
                </NavLink>
              ))}
              
              {/* Export Button uses motion since it triggers a local function instead of routing */}
              <motion.button
                whileTap={{ scale: 0.95, x: 2, y: 2 }} //[cite: 14]
                onClick={() => {
                  onExport(); //[cite: 14]
                  onClose(); //[cite: 14]
                }}
                className="w-full flex items-center gap-4 p-4 border-2 border-zinc-900 bg-zinc-50 text-zinc-900 font-black uppercase text-sm hover:bg-zinc-100 transition-all" //[cite: 14]
              >
                <Download className="w-5 h-5" /> {/*[cite: 14] */}
                Export Data {/*[cite: 14] */}
              </motion.button>
            </nav>

            <NavLink //[cite: 9]
              to="/profile" //[cite: 9]
              onClick={onClose} //[cite: 9]
              className={({ isActive }) => cn( //[cite: 9]
                "w-full flex items-center gap-4 p-4 border-2 transition-all font-black uppercase text-sm mb-2", //[cite: 14]
                "active:scale-95 active:translate-x-[2px] active:translate-y-[2px]", //[cite: 9]
                isActive //[cite: 9]
                  ? "bg-zinc-900 text-white border-zinc-900 translate-x-1 -translate-y-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]" //[cite: 14]
                  : "bg-white text-zinc-900 border-zinc-900 hover:bg-zinc-50" //[cite: 14]
              )}
            >
              <UserCircle className="w-5 h-5" /> {/*[cite: 14] */}
              Profile {/*[cite: 14] */}
            </NavLink>

            <motion.button
              whileTap={{ scale: 0.95, x: 2, y: 2 }} //[cite: 14]
              onClick={() => {
                onLogout(); //[cite: 14]
                onClose(); //[cite: 14]
              }}
              className="w-full flex items-center gap-4 p-4 border-2 border-zinc-900 bg-red-50 text-red-600 font-black uppercase text-sm hover:bg-red-100 transition-all" //[cite: 14]
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