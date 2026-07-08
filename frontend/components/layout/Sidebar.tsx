"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

type View = "dashboard" | "agents" | "chat";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const navItems: { id: View; label: string; icon: React.ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: "agents",
    label: "Agents",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="4.5" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="19.5" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 11.5v2M12 13.5L5.5 16M12 13.5L18.5 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export function Sidebar({ currentView, onNavigate, collapsed, onToggle }: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 260 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full bg-[#111111] overflow-hidden z-10"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0">
        <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-lg">
          A
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="font-semibold text-[#e8eaed] text-base tracking-tight">AgentVerse</div>
            <div className="text-[10px] text-[#5f6368]">AI Workforce</div>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={clsx(
                "nav-item",
                isActive && "nav-item--active"
              )}
            >
              <span className={clsx("flex-shrink-0 transition-colors", isActive ? "text-[#8ab4f8]" : "text-[#9aa0a6]")}>
                {item.icon}
              </span>
              {!collapsed && (
                <span className={clsx("text-sm", isActive ? "text-[#8ab4f8] font-medium" : "text-[#c4c7c5]")}>
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 pb-4 flex-shrink-0">
        <button
          onClick={onToggle}
          className="nav-item w-full justify-center"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            className={clsx("text-[#9aa0a6] transition-transform duration-300", !collapsed && "rotate-180")}
          >
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && <span className="text-xs text-[#9aa0a6]">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
