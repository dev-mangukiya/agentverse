"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

type View = "dashboard" | "agents" | "chat";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
  pipelineActive?: boolean;
  activeAgentCount?: number;
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

export function Sidebar({ currentView, onNavigate, collapsed, onToggle, pipelineActive, activeAgentCount = 0 }: SidebarProps) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 260 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full overflow-hidden z-10"
      style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border-subtle)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
            boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
          }}
        >
          A
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="font-semibold text-base tracking-tight" style={{ color: "var(--text-primary)" }}>AgentVerse</div>
            <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>Multi-Agent Platform</div>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const showBadge = item.id === "agents" && activeAgentCount > 0;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={clsx("nav-item relative", isActive && "nav-item--active")}
            >
              <span className="flex-shrink-0 relative" style={{ color: isActive ? "var(--brand-text)" : "var(--text-muted)" }}>
                {item.icon}
                {/* Activity dot for agents nav */}
                {showBadge && (
                  <span
                    className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: "var(--brand)",
                      boxShadow: "0 0 6px var(--brand)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                )}
              </span>
              {!collapsed && (
                <span
                  className="text-sm flex-1"
                  style={{ color: isActive ? "var(--brand-text)" : "var(--text-secondary)", fontWeight: isActive ? 500 : 400 }}
                >
                  {item.label}
                </span>
              )}
              {/* Agent count badge */}
              {!collapsed && showBadge && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--brand-dim)",
                    color: "var(--brand-text)",
                  }}
                >
                  {activeAgentCount}
                </motion.span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Pipeline status indicator */}
      {!collapsed && pipelineActive && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-3 px-3 py-2.5 rounded-xl"
          style={{
            backgroundColor: "var(--brand-dim)",
            border: "1px solid color-mix(in srgb, var(--brand) 15%, transparent)",
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: "var(--brand)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            <span className="text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>
              Pipeline Active
            </span>
          </div>
          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {activeAgentCount} agent{activeAgentCount !== 1 ? "s" : ""} working...
          </div>
        </motion.div>
      )}

      {/* Collapse toggle */}
      <div className="px-3 pb-4 flex-shrink-0">
        <button onClick={onToggle} className="nav-item w-full justify-center" title={collapsed ? "Expand" : "Collapse"}>
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            className={clsx("transition-transform duration-300", !collapsed && "rotate-180")}
            style={{ color: "var(--text-muted)" }}
          >
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
