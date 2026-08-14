"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { agentMeta } from "@/components/agents/AgentCard";
import { useTheme } from "@/lib/theme";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";

type View = "dashboard" | "agents" | "chat";

interface ActiveAgent {
  name: string;
  status: string;
  toolName?: string;
}

interface HeaderProps {
  currentView: View;
  onMobileMenuToggle?: () => void;
  pipelineActive?: boolean;
  activeAgents?: ActiveAgent[];
  backendStatus?: "online" | "waking" | "offline";
  onAuthChange?: () => void;
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export function Header({ currentView, onMobileMenuToggle, pipelineActive, activeAgents = [], backendStatus = "online", onAuthChange }: HeaderProps) {
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

  const handleAuthSuccess = () => {
    onAuthChange?.();
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
    onAuthChange?.();
  };

  const userInitial = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?";

  return (
    <>
      <header
        className="relative flex-shrink-0 z-[100]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--bg-base) 75%, transparent)",
          backdropFilter: "blur(24px) saturate(1.5)",
          WebkitBackdropFilter: "blur(24px) saturate(1.5)",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center justify-between px-4 md:px-6 h-14">
          {/* Left: Mobile hamburger + Pipeline status */}
          <div className="flex items-center gap-3">
            {onMobileMenuToggle && (
              <button
                onClick={onMobileMenuToggle}
                className="lg:hidden p-2 rounded-xl transition-all duration-200"
                style={{ color: "var(--text-muted)" }}
                aria-label="Toggle menu"
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Live pipeline status */}
            <AnimatePresence>
              {pipelineActive && activeAgents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, x: -16, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -16, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl"
                  style={{
                    backgroundColor: "var(--brand-dim)",
                    border: "1px solid color-mix(in srgb, var(--brand) 12%, transparent)",
                  }}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: "var(--brand)",
                      boxShadow: "0 0 8px var(--brand)",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div className="hidden sm:flex items-center gap-1">
                    {activeAgents.slice(0, 3).map((agent) => {
                      const meta = agentMeta[agent.name?.toLowerCase()];
                      return (
                        <motion.div
                          key={agent.name}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 15 }}
                          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${meta?.color || "var(--brand)"} 20%, var(--bg-panel))`,
                            border: `1px solid color-mix(in srgb, ${meta?.color || "var(--brand)"} 25%, transparent)`,
                            fontSize: "10px",
                          }}
                          title={meta?.label || agent.name}
                        >
                          {meta?.icon || "🤖"}
                        </motion.div>
                      );
                    })}
                  </div>
                  <span className="text-[10px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: "var(--brand-text)" }}>
                    {activeAgents.length} active
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2.5 ml-auto">
            {/* System status badge */}
            <div
              className="items-center gap-1.5 px-3 py-1.5 rounded-xl border hidden sm:flex transition-all duration-200"
              style={{
                backgroundColor: backendStatus === "online" ? "var(--green-dim)"
                  : backendStatus === "waking" ? "color-mix(in srgb, var(--yellow, #eab308) 10%, var(--bg-panel))"
                  : "color-mix(in srgb, var(--red) 10%, var(--bg-panel))",
                borderColor: backendStatus === "online" ? "color-mix(in srgb, var(--green) 15%, transparent)"
                  : backendStatus === "waking" ? "color-mix(in srgb, var(--yellow, #eab308) 15%, transparent)"
                  : "color-mix(in srgb, var(--red) 15%, transparent)",
              }}
            >
              {backendStatus === "waking" ? (
                <span
                  className="w-3 h-3 border-[1.5px] rounded-full animate-spin"
                  style={{
                    borderColor: "color-mix(in srgb, var(--yellow, #eab308) 30%, transparent)",
                    borderTopColor: "var(--yellow, #eab308)",
                  }}
                />
              ) : (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: backendStatus === "online" ? "var(--green)" : "var(--red)",
                    boxShadow: backendStatus === "online" ? "0 0 6px var(--green)" : "0 0 6px var(--red)",
                  }}
                />
              )}
              <span className="text-xs font-medium" style={{
                color: backendStatus === "online" ? "var(--green)"
                  : backendStatus === "waking" ? "var(--yellow, #eab308)"
                  : "var(--red)",
              }}>
                {backendStatus === "online" ? "System Online"
                  : backendStatus === "waking" ? "Waking up..."
                  : "Offline"}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 relative overflow-hidden"
              style={{
                backgroundColor: "var(--bg-hover)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                e.currentTarget.style.borderColor = "var(--border-muted)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <AnimatePresence mode="wait">
                {theme === "dark" ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <SunIcon />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                    animate={{ rotate: 0, opacity: 1, scale: 1 }}
                    exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {/* Notification Center */}
            <NotificationCenter />

            {/* User Avatar / Auth */}
            <div className="relative" ref={menuRef}>
              {isLoggedIn ? (
                <>
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="w-9 h-9 rounded-xl flex items-center justify-center relative group/avatar cursor-pointer overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
                      backgroundSize: "200% 200%",
                      animation: "gradientShift 4s ease-in-out infinite",
                    }}
                    title={user?.name || user?.email || "Account"}
                  >
                    <span className="text-sm font-bold text-white relative z-10">
                      {userInitial}
                    </span>
                    <div
                      className="absolute inset-0 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300"
                      style={{
                        background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                        backgroundSize: "200% 100%",
                        animation: "shine 2s ease-in-out infinite",
                      }}
                    />
                  </button>

                  {/* User dropdown */}
                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-12 w-64 rounded-xl overflow-hidden shadow-xl z-[200]"
                        style={{
                          background: "var(--glass-bg)",
                          backdropFilter: "blur(40px) saturate(1.6)",
                          WebkitBackdropFilter: "blur(40px) saturate(1.6)",
                          border: "1px solid var(--glass-border)",
                          boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
                        }}
                      >
                        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {user?.name || "User"}
                          </div>
                          <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                            {user?.email}
                          </div>
                        </div>
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
                </>
              ) : (
                <button
                  onClick={() => setAuthModalOpen(true)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center relative group/avatar cursor-pointer overflow-hidden"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
                    backgroundSize: "200% 200%",
                    animation: "gradientShift 4s ease-in-out infinite",
                  }}
                  title="Sign in"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="relative z-10">
                    <circle cx="12" cy="8" r="4" fill="white" opacity="0.9"/>
                    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="white" opacity="0.9"/>
                  </svg>
                  <div
                    className="absolute inset-0 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300"
                    style={{
                      background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                      backgroundSize: "200% 100%",
                      animation: "shine 2s ease-in-out infinite",
                    }}
                  />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Animated aurora gradient bar under header when pipeline is active */}
        <AnimatePresence>
          {pipelineActive && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ scaleX: 0, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
              className="absolute bottom-0 left-0 right-0 h-[2px]"
              style={{
                background: "linear-gradient(90deg, var(--aurora-1) 0%, var(--aurora-2) 25%, var(--aurora-3) 50%, var(--aurora-4) 75%, var(--aurora-5) 100%)",
                backgroundSize: "200% 100%",
                animation: "gradientShift 3s linear infinite",
                transformOrigin: "left",
              }}
            />
          )}
        </AnimatePresence>
      </header>

      {/* Auth Modal */}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
