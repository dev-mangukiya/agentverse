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
      <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0 overflow-hidden">
        <div className="relative group/logo">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #E23636 0%, #b91c1c 40%, #1a3a8a 100%)",
              backgroundSize: "200% 200%",
              animation: "gradientShift 4s ease-in-out infinite",
              boxShadow: "0 4px 16px rgba(226,54,54,0.3)",
            }}
          >
            {/* Spider-web inspired icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="relative z-10">
              {/* Outer web ring */}
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1" opacity="0.5"/>
              {/* Inner web ring */}
              <circle cx="12" cy="12" r="5.5" stroke="white" strokeWidth="0.8" opacity="0.4"/>
              {/* Web lines radiating from center */}
              <line x1="12" y1="2" x2="12" y2="22" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              <line x1="2" y1="12" x2="22" y2="12" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="white" strokeWidth="0.8" opacity="0.5"/>
              <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" stroke="white" strokeWidth="0.8" opacity="0.5"/>
              {/* Center dot */}
              <circle cx="12" cy="12" r="1.8" fill="white" opacity="0.9"/>
            </svg>
            {/* Shine effect */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
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
            <div className="font-semibold text-base tracking-tight gradient-text">AgentVerse</div>
            <div className="text-[10px] font-medium" style={{ color: "var(--text-faint)" }}>Superhero AI Platform</div>
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

      {/* Collapse toggle — hidden on mobile drawer */}
      <div className="px-3 pb-4 flex-shrink-0 sidebar-collapse-toggle">
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
