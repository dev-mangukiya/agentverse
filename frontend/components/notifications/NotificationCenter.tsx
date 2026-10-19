"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "./NotificationProvider";
import type { NotificationType } from "./NotificationProvider";
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, InfoIcon, BotIcon } from "../icons/Icons";

const typeIcons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircleIcon size={14} color="var(--green)" />,
  error: <XCircleIcon size={14} color="var(--red)" />,
  warning: <AlertTriangleIcon size={14} color="var(--yellow)" />,
  info: <InfoIcon size={14} color="var(--brand-blue-bright)" />,
  "agent-complete": <BotIcon size={14} color="var(--brand)" />,
};

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function getNotificationPlacement(rect: { top: number; bottom: number; right: number }, viewportWidth: number, viewportHeight: number) {
  const width = Math.min(352, viewportWidth - 24);
  const below = Math.max(0, viewportHeight - rect.bottom - 20);
  const above = Math.max(0, rect.top - 20);
  const opensBelow = below >= Math.min(280, viewportHeight * .7) || below >= above;
  const maxHeight = Math.min(420, viewportHeight * .7, opensBelow ? below : above);
  return {
    width, maxHeight,
    top: opensBelow ? rect.bottom + 8 : rect.top - 8 - maxHeight,
    left: Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12)),
  };
}

export function NotificationCenter({ onNotificationClick }: { onNotificationClick?: (conversationId: string) => void }) {
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useDialogFocus(open, () => setOpen(false));
  const [pos, setPos] = useState({ top: 0, left: 0, width: 352, maxHeight: 420 });

  // SSR-safe: only render Portal after mount to avoid hydration mismatch
  useEffect(() => { setMounted(true); }, []);

  // Anchor to the header and choose whichever side has room on short screens.
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    setPos(getNotificationPlacement(buttonRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight));
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Update position on open and on scroll/resize
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <>
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
          if (!open) markAllRead();
        }}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-150 relative"
        style={{
          color: "var(--text-muted)",
        }}
        aria-label="Notifications" aria-expanded={open} aria-haspopup="dialog"
        title="Notifications"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Unread badge */}
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
              style={{
                backgroundColor: "var(--brand)",
                boxShadow: "0 0 8px var(--brand-glow)",
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Dropdown panel — rendered via Portal to escape Header's backdrop-filter stacking context */}
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={panelRef} role="dialog" aria-label="Notifications" tabIndex={-1}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed w-80 max-w-[calc(100vw-16px)] max-h-[min(420px,70dvh)] rounded-xl shadow-2xl overflow-hidden flex flex-col"
              style={{
                ...pos,
                zIndex: 9999,
                background: "var(--glass-bg)",
                backdropFilter: "blur(40px) saturate(1.6)",
                WebkitBackdropFilter: "blur(40px) saturate(1.6)",
                border: "1px solid var(--glass-border)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Notifications
                </span>
                <div className="flex items-center gap-2">
                  <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close notifications">×</button>
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAll}
                      className="text-[10px] font-medium px-2 py-1 rounded-lg transition-colors"
                      style={{ color: "var(--text-faint)", backgroundColor: "var(--bg-hover)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--red)";
                        e.currentTarget.style.backgroundColor = "var(--red-dim)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-faint)";
                        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto notification-scroll">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4">
                    <div className="text-2xl mb-2">🔔</div>
                    <div className="text-xs text-center" style={{ color: "var(--text-faint)" }}>
                      No notifications yet.
                      <br />
                      They&apos;ll appear here when agents complete tasks.
                    </div>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 group/notif"
                      style={{
                        borderBottom: "1px solid var(--border-subtle)",
                        backgroundColor: notif.read ? "transparent" : "var(--bg-hover)",
                        cursor: notif.conversationId ? "pointer" : "default",
                      }}
                      onClick={() => {
                        if (notif.conversationId && onNotificationClick) {
                          onNotificationClick(notif.conversationId);
                          setOpen(false);
                        }
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = notif.read ? "transparent" : "var(--bg-hover)";
                      }}
                    >
                      <span className="text-sm flex-shrink-0 mt-0.5">{typeIcons[notif.type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {notif.title}
                        </div>
                        {notif.message && (
                          <div
                            className="text-[11px] mt-0.5 line-clamp-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {notif.message}
                          </div>
                        )}
                        <div className="text-[10px] mt-1" style={{ color: "var(--text-faint)" }}>
                          {timeAgo(notif.timestamp)}
                        </div>
                      </div>
                      <button
                        onClick={() => dismiss(notif.id)}
                        className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover/notif:opacity-100 transition-colors"
                        style={{ color: "var(--text-faint)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
                      >
                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
