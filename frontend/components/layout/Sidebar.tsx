"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import { AgentVerseLogo } from "@/components/brand/AgentVerseLogo";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";

type View = "dashboard" | "agents" | "chat";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
  pipelineActive?: boolean;
  activeAgentCount?: number;
  // Chat history
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  historyRefreshTrigger?: number;
  // System
  backendStatus?: "online" | "waking" | "offline";
  onAuthChange?: () => void;
  onNotificationClick?: (conversationId: string) => void;
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

export function Sidebar({
  currentView,
  onNavigate,
  collapsed,
  onToggle,
  pipelineActive,
  activeAgentCount = 0,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  historyRefreshTrigger,
  backendStatus = "online",
  onAuthChange,
  onNotificationClick,
}: SidebarProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, isLoggedIn, logout } = useAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    onAuthChange?.();
  };

  const handleAuthSuccess = () => {
    onAuthChange?.();
  };

  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?";

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex flex-col h-full overflow-hidden z-10"
        style={{
          backgroundColor: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center px-4 h-14 flex-shrink-0 overflow-hidden">
          <AgentVerseLogo
            size={32}
            showWordmark={!collapsed}
            showTagline={false}
            animated
          />
        </div>

        {/* Navigation items */}
        <nav className="px-3 py-2 space-y-0.5 flex-shrink-0">
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

        {/* Separator */}
        {!collapsed && (
          <div className="mx-4 my-1 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }} />
        )}

        {/* Chat history — integrated in sidebar, only on chat view */}
        {!collapsed && currentView === "chat" && onSelectConversation && onNewChat && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ChatHistory
              activeId={activeConversationId ?? null}
              onSelect={onSelectConversation}
              onNewChat={onNewChat}
              refreshTrigger={historyRefreshTrigger ?? 0}
            />
          </div>
        )}

        {/* For non-chat views or collapsed state, fill remaining space */}
        {(collapsed || currentView !== "chat") && (
          <div className="flex-1" />
        )}

        {/* Pipeline status indicator */}
        {!collapsed && pipelineActive && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-3 mb-2 px-3 py-2.5 rounded-xl relative overflow-hidden flex-shrink-0"
            style={{
              backgroundColor: "var(--brand-dim)",
              border: "1px solid color-mix(in srgb, var(--brand) 15%, transparent)",
            }}
          >
            <div className="flex items-center gap-2 relative z-10">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: "var(--brand)",
                  boxShadow: "0 0 8px var(--brand)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
              <span className="text-[11px] font-semibold" style={{ color: "var(--brand-text)" }}>
                {activeAgentCount} agent{activeAgentCount !== 1 ? "s" : ""} active
              </span>
            </div>
          </motion.div>
        )}

        {/* Bottom bar: settings + user account (like Gemini) */}
        <div className="flex-shrink-0 px-3 pb-3 pt-1" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          {/* System status + settings row */}
          {!collapsed && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              {/* System status dot */}
              <div
                className="flex items-center gap-1.5 flex-1"
                title={backendStatus === "online" ? "System Online" : backendStatus === "waking" ? "Waking up..." : "Offline"}
              >
                {backendStatus === "waking" ? (
                  <span
                    className="w-2.5 h-2.5 border-[1.5px] rounded-full animate-spin flex-shrink-0"
                    style={{
                      borderColor: "color-mix(in srgb, var(--yellow, #eab308) 30%, transparent)",
                      borderTopColor: "var(--yellow, #eab308)",
                    }}
                  />
                ) : (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: backendStatus === "online" ? "var(--green)" : "var(--red)",
                      boxShadow: backendStatus === "online" ? "0 0 4px var(--green)" : "0 0 4px var(--red)",
                    }}
                  />
                )}
                <span className="text-[10px] font-medium" style={{
                  color: backendStatus === "online" ? "var(--green)"
                    : backendStatus === "waking" ? "var(--yellow, #eab308)"
                    : "var(--red)",
                }}>
                  {backendStatus === "online" ? "Online" : backendStatus === "waking" ? "Waking..." : "Offline"}
                </span>
              </div>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
                style={{ color: "var(--text-muted)" }}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                {theme === "dark" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Notifications */}
              <NotificationCenter onNotificationClick={onNotificationClick} />
            </div>
          )}

          {/* User account (like Gemini bottom) */}
          <div className="relative" ref={menuRef}>
            {isLoggedIn ? (
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={clsx(
                  "w-full flex items-center gap-2.5 rounded-xl transition-all duration-200",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                title={collapsed ? (user?.name || user?.email || "Account") : undefined}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
                  }}
                >
                  <span className="text-xs font-bold text-white">{userInitial}</span>
                </div>
                {!collapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {user?.name || "User"}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                      {user?.email}
                    </div>
                  </div>
                )}
                {!collapsed && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className={clsx(
                  "w-full flex items-center gap-2.5 rounded-xl transition-all duration-200",
                  collapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
                title="Sign in"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="4" fill="white" opacity="0.9"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="white" opacity="0.9"/>
                  </svg>
                </div>
                {!collapsed && (
                  <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                    Sign in
                  </span>
                )}
              </button>
            )}

            {/* User dropdown menu */}
            <AnimatePresence>
              {userMenuOpen && isLoggedIn && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden shadow-xl z-[200]"
                  style={{
                    background: "var(--glass-bg)",
                    backdropFilter: "blur(40px) saturate(1.6)",
                    WebkitBackdropFilter: "blur(40px) saturate(1.6)",
                    border: "1px solid var(--glass-border)",
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
                  }}
                >
                  <div className="p-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                        e.currentTarget.style.color = "var(--red)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className="nav-item w-full justify-center mt-1 sidebar-collapse-toggle"
            title={collapsed ? "Expand" : "Collapse"}
          >
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

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
