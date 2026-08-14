"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus email on open
  useEffect(() => {
    if (open) {
      setError("");
      setTimeout(() => emailRef.current?.focus(), 200);
    }
  }, [open, tab]);

  // Reset on tab change
  const switchTab = (t: "login" | "register") => {
    setTab(t);
    setError("");
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    let result: { error?: string };
    if (tab === "login") {
      result = await login(email, password);
    } else {
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        setLoading(false);
        return;
      }
      result = await register(name, email, password);
    }

    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      // Success — close and notify
      setEmail("");
      setPassword("");
      setName("");
      onClose();
      onSuccess?.();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed inset-0 z-[10001] flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
          >
            <div
              className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: "var(--glass-bg)",
                backdropFilter: "blur(40px) saturate(1.6)",
                WebkitBackdropFilter: "blur(40px) saturate(1.6)",
                border: "1px solid var(--glass-border)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.3), 0 0 80px -20px var(--brand-glow)",
              }}
            >
              {/* Header with brand accent */}
              <div
                className="px-6 pt-6 pb-4"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, var(--aurora-1), var(--aurora-3))",
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                        fill="white"
                        opacity="0.9"
                      />
                    </svg>
                  </div>
                  <div>
                    <h2
                      className="text-lg font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tab === "login" ? "Welcome back" : "Create account"}
                    </h2>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {tab === "login"
                        ? "Sign in to access your chats everywhere"
                        : "Sign up to sync your chats across devices"}
                    </p>
                  </div>
                </div>

                {/* Tab switcher */}
                <div
                  className="flex rounded-xl p-1 gap-1"
                  style={{ backgroundColor: "var(--bg-hover)" }}
                >
                  {(["login", "register"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => switchTab(t)}
                      className="flex-1 py-2 text-sm font-medium rounded-lg transition-all duration-200"
                      style={{
                        backgroundColor: tab === t ? "var(--bg-elevated)" : "transparent",
                        color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                        boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.15)" : "none",
                      }}
                    >
                      {t === "login" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                <AnimatePresence mode="wait">
                  {tab === "register" && (
                    <motion.div
                      key="name"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: "hidden" }}
                    >
                      <label
                        className="block text-xs font-medium mb-1.5"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name (optional)"
                        className="w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 outline-none"
                        style={{
                          backgroundColor: "var(--bg-base)",
                          border: "1px solid var(--border-muted)",
                          color: "var(--text-primary)",
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = "var(--brand)";
                          e.currentTarget.style.boxShadow = "0 0 0 3px var(--brand-dim)";
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = "var(--border-muted)";
                          e.currentTarget.style.boxShadow = "none";
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Email
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 outline-none"
                    style={{
                      backgroundColor: "var(--bg-base)",
                      border: "1px solid var(--border-muted)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--brand)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px var(--brand-dim)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-muted)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-medium mb-1.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tab === "register" ? "Min 6 characters" : "••••••••"}
                    required
                    className="w-full px-4 py-2.5 rounded-xl text-sm transition-all duration-200 outline-none"
                    style={{
                      backgroundColor: "var(--bg-base)",
                      border: "1px solid var(--border-muted)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--brand)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px var(--brand-dim)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-muted)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
                      style={{
                        backgroundColor: "var(--red-dim)",
                        color: "var(--red)",
                        border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)",
                      }}
                    >
                      <span>⚠️</span>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 relative overflow-hidden"
                  style={{
                    background: loading
                      ? "var(--bg-hover)"
                      : "linear-gradient(135deg, var(--aurora-1), var(--aurora-3))",
                    color: loading ? "var(--text-muted)" : "white",
                    opacity: !email || !password ? 0.5 : 1,
                    cursor: loading ? "wait" : !email || !password ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span
                        className="w-4 h-4 border-2 rounded-full animate-spin"
                        style={{
                          borderColor: "color-mix(in srgb, var(--text-muted) 30%, transparent)",
                          borderTopColor: "var(--text-muted)",
                        }}
                      />
                      {tab === "login" ? "Signing in..." : "Creating account..."}
                    </span>
                  ) : tab === "login" ? (
                    "Sign In"
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>

              {/* Footer */}
              <div
                className="px-6 py-4 text-center"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <p className="text-xs" style={{ color: "var(--text-faint)" }}>
                  {tab === "login" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        onClick={() => switchTab("register")}
                        className="font-medium transition-colors"
                        style={{ color: "var(--brand)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        onClick={() => switchTab("login")}
                        className="font-medium transition-colors"
                        style={{ color: "var(--brand)" }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = "underline";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = "none";
                        }}
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
