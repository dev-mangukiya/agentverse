"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";

const DISMISSED_KEY = "agentverse_welcome_dismissed";

/**
 * Welcome popup shown once to anonymous users on first visit.
 * Offers sign-in/sign-up or "Continue as guest".
 * Dismissal is saved to localStorage so it only appears once.
 */
export function WelcomeModal() {
  const { isLoggedIn } = useAuth();
  const [visible, setVisible] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    // Don't show if already logged in
    if (isLoggedIn) return;

    // Don't show if previously dismissed
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed) return;
    }

    // Show after a short delay so the page loads first
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, [isLoggedIn]);

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  const handleSignIn = () => {
    setVisible(false);
    setAuthOpen(true);
  };

  const handleAuthSuccess = () => {
    setAuthOpen(false);
    localStorage.setItem(DISMISSED_KEY, "1");
  };

  // Don't render anything if logged in
  if (isLoggedIn) return null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[9998]"
              style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
              onClick={handleDismiss}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 32, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 350, damping: 30, delay: 0.1 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              onClick={(e) => e.target === e.currentTarget && handleDismiss()}
            >
              <div
                className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: "var(--glass-bg)",
                  backdropFilter: "blur(40px) saturate(1.6)",
                  WebkitBackdropFilter: "blur(40px) saturate(1.6)",
                  border: "1px solid var(--glass-border)",
                  boxShadow: "0 24px 80px rgba(0,0,0,0.3), 0 0 60px -20px var(--brand-glow)",
                }}
              >
                {/* Gradient top accent */}
                <div
                  style={{
                    height: "3px",
                    background: "linear-gradient(90deg, var(--aurora-1), var(--aurora-2), var(--aurora-3), var(--aurora-4))",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 3s ease-in-out infinite",
                  }}
                />

                <div className="px-6 pt-6 pb-5">
                  {/* Logo + Title */}
                  <div className="flex flex-col items-center text-center mb-5">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                      style={{
                        background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-3))",
                        boxShadow: "0 8px 24px var(--brand-glow)",
                      }}
                    >
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.9"/>
                        <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="1.5" fill="none" opacity="0.7"/>
                        <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="1.5" fill="none" opacity="0.8"/>
                      </svg>
                    </div>
                    <h2
                      className="text-lg font-bold mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Welcome to AgentVerse
                    </h2>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      Sign in to sync your conversations across devices and unlock your full chat history.
                    </p>
                  </div>

                  {/* Benefits */}
                  <div className="space-y-2.5 mb-6">
                    {[
                      { icon: "sync", text: "Sync chats across all your devices" },
                      { icon: "history", text: "Persistent conversation history" },
                      { icon: "agents", text: "Create and save custom agents" },
                    ].map(({ icon, text }) => (
                      <div key={icon} className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: "var(--brand-dim)",
                          }}
                        >
                          {icon === "sync" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6M2.5 22v-6h6"/>
                              <path d="M2.5 11.5a10 10 0 0118-4l1 1.5M21.5 12.5a10 10 0 01-18 4l-1-1.5"/>
                            </svg>
                          )}
                          {icon === "history" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                            </svg>
                          )}
                          {icon === "agents" && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                            </svg>
                          )}
                        </div>
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* CTA Buttons */}
                  <div className="space-y-2.5">
                    <button
                      onClick={handleSignIn}
                      className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200"
                      style={{
                        background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-3))",
                        color: "white",
                        boxShadow: "0 4px 16px var(--brand-glow)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                        e.currentTarget.style.boxShadow = "0 6px 20px var(--brand-glow)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 4px 16px var(--brand-glow)";
                      }}
                    >
                      Sign In / Sign Up
                    </button>
                    <button
                      onClick={handleDismiss}
                      className="w-full py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
                      style={{
                        color: "var(--text-muted)",
                        backgroundColor: "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                    >
                      Continue as guest
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Auth modal (opened from welcome) */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </>
  );
}
