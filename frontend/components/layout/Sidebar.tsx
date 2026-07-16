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
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="relative flex flex-col h-full overflow-hidden z-10"
      style={{ backgroundColor: "var(--bg-sidebar)", borderRight: "1px solid var(--border-subtle)" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0">
        <div className="relative group/logo">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
              backgroundSize: "200% 200%",
              animation: "gradientShift 4s ease-in-out infinite",
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="relative z-10">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="white" strokeWidth="1.2" fill="none"/>
              <circle cx="12" cy="8" r="1.5" fill="white"/>
              <circle cx="8" cy="14" r="1.5" fill="white"/>
              <circle cx="16" cy="14" r="1.5" fill="white"/>
              <circle cx="12" cy="12" r="2" fill="white" opacity="0.9"/>
              <line x1="12" y1="10" x2="12" y2="8" stroke="white" strokeWidth="1" opacity="0.7"/>
              <line x1="10.5" y1="13" x2="8.5" y2="14" stroke="white" strokeWidth="1" opacity="0.7"/>
              <line x1="13.5" y1="13" x2="15.5" y2="14" stroke="white" strokeWidth="1" opacity="0.7"/>
            </svg>
            {/* Shine effect */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.2) 50%, transparent 60%)",
                backgroundSize: "200% 100%",
                animation: "shine 3s ease-in-out infinite",
              }}
            />
          </div>
        </div>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <div className="font-semibold text-base tracking-tight gradient-text">Cortex AI</div>
            <div className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>Multi-Agent Platform</div>
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {navItems.map((item, i) => {
          const isActive = currentView === item.id;
          const showBadge = item.id === "agents" && activeAgentCount > 0;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <button
                onClick={() => onNavigate(item.id)}
                className={clsx("nav-item relative group/nav", isActive && "nav-item--active")}
                title={collapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0 relative" style={{ color: isActive ? "var(--brand-text)" : "var(--text-muted)" }}>
                  {item.icon}
                  {/* Activity dot for agents nav */}
                  {showBadge && (
                    <span
                      className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: "var(--brand)",
                        boxShadow: "0 0 8px var(--brand)",
                        animation: "pulse 1.5s ease-in-out infinite",
                        border: "1.5px solid var(--bg-sidebar)",
                      }}
                    />
                  )}
                </span>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="text-sm flex-1"
                    style={{ color: isActive ? "var(--brand-text)" : "var(--text-secondary)", fontWeight: isActive ? 500 : 400 }}
                  >
                    {item.label}
                  </motion.span>
                )}
                {/* Agent count badge */}
                {!collapsed && showBadge && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--brand-dim)",
                      color: "var(--brand-text)",
                      border: "1px solid color-mix(in srgb, var(--brand) 15%, transparent)",
                    }}
                  >
                    {activeAgentCount}
                  </motion.span>
                )}

                {/* Collapsed tooltip */}
                {collapsed && (
                  <div
                    className="absolute left-full ml-3 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity duration-200 pointer-events-none z-50"
                    style={{
                      backgroundColor: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-muted)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    {item.label}
                  </div>
                )}
              </button>
            </motion.div>
          );
        })}
      </nav>

      {/* Pipeline status indicator */}
      {!collapsed && pipelineActive && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-3 px-3 py-3 rounded-xl relative overflow-hidden"
          style={{
            backgroundColor: "var(--brand-dim)",
            border: "1px solid color-mix(in srgb, var(--brand) 15%, transparent)",
          }}
        >
          {/* Animated shimmer */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--brand) 5%, transparent), transparent)",
              backgroundSize: "200% 100%",
              animation: "shimmer 2s ease-in-out infinite",
            }}
          />
          <div className="flex items-center gap-2 mb-1 relative z-10">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: "var(--brand)",
                boxShadow: "0 0 8px var(--brand)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
            <span className="text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>
              Pipeline Active
            </span>
          </div>
          <div className="text-[10px] relative z-10" style={{ color: "var(--text-muted)" }}>
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
