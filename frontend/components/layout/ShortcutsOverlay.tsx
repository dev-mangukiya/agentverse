"use client";

/**
 * Keyboard Shortcuts Overlay — triggered by "?" key.
 *
 * Lists all available shortcuts. Uses same panel styling
 * as the rest of the system.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { transition, DURATION } from "@/config/motion";

interface ShortcutsOverlayProps {
  open: boolean;
  onClose: () => void;
}

const shortcuts = [
  { keys: "⌘K", description: "Open Command Palette" },
  { keys: "⌘N", description: "New Chat" },
  { keys: "⌘/", description: "Toggle Sidebar" },
  { keys: "?", description: "Keyboard Shortcuts" },
  { keys: "Esc", description: "Close Overlay / Modal" },
];

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.fast }}
            className="fixed inset-0 z-[100]"
            style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={transition.fast}
            className="fixed z-[101] rounded-2xl overflow-hidden shadow-2xl"
            style={{
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              width: "min(360px, calc(100vw - 32px))",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-muted)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Keyboard Shortcuts
              </span>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-faint)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Shortcuts list */}
            <div className="px-4 py-3 space-y-2">
              {shortcuts.map((s) => (
                <div key={s.keys} className="flex items-center justify-between py-1.5">
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {s.description}
                  </span>
                  <kbd
                    className="text-[11px] px-2 py-1 rounded-md font-mono"
                    style={{
                      backgroundColor: "var(--bg-raised)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                      minWidth: "32px",
                      textAlign: "center",
                    }}
                  >
                    {s.keys}
                  </kbd>
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div
              className="px-4 py-2.5 text-[10px]"
              style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}
            >
              On Windows/Linux, use Ctrl instead of ⌘
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
