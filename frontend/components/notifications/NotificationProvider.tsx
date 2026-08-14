"use client";

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { CheckCircleIcon, XCircleIcon, AlertTriangleIcon, InfoIcon, BotIcon } from "../icons/Icons";
import { motion, AnimatePresence } from "framer-motion";

export type NotificationType = "success" | "error" | "warning" | "info" | "agent-complete";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  agent?: string;
  timestamp: number;
  read: boolean;
  autoDismiss?: boolean;
}

interface NotificationContextValue {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  addNotification: () => {},
  markAllRead: () => {},
  markRead: () => {},
  dismiss: () => {},
  clearAll: () => {},
});

const MAX_NOTIFICATIONS = 50;
const MAX_TOASTS = 4;
const TOAST_DURATION = 5000;

// Icon mapping
const typeIcons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircleIcon size={16} color="var(--green)" />,
  error: <XCircleIcon size={16} color="var(--red)" />,
  warning: <AlertTriangleIcon size={16} color="var(--yellow)" />,
  info: <InfoIcon size={16} color="var(--brand-blue-bright)" />,
  "agent-complete": <BotIcon size={16} color="var(--brand)" />,
};

const typeColors: Record<NotificationType, string> = {
  success: "var(--green)",
  error: "var(--red)",
  warning: "var(--yellow)",
  info: "var(--brand-blue-bright)",
  "agent-complete": "var(--brand)",
};

interface Toast extends Notification {
  expiresAt: number;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read">) => {
      const notification: Notification = {
        ...n,
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        read: false,
      };

      setNotifications((prev) => [notification, ...prev].slice(0, MAX_NOTIFICATIONS));

      // Show toast for auto-dismiss notifications (default true)
      if (n.autoDismiss !== false) {
        const toast: Toast = {
          ...notification,
          expiresAt: Date.now() + TOAST_DURATION,
        };
        setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));

        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, TOAST_DURATION);
      }
    },
    []
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setToasts([]);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAllRead, markRead, dismiss, clearAll }}
    >
      {children}

      {/* Toast container — fixed above input bar */}
      <div
        className="fixed bottom-24 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
        style={{ maxWidth: "380px", width: "calc(100vw - 32px)" }}
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: `1px solid color-mix(in srgb, ${typeColors[toast.type]} 20%, var(--border-muted))`,
                backdropFilter: "blur(16px)",
              }}
            >
              <span className="flex-shrink-0 mt-0.5">{typeIcons[toast.type]}</span>
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {toast.title}
                </div>
                {toast.message && (
                  <div
                    className="text-xs mt-0.5 line-clamp-2"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {toast.message}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-colors"
                style={{ color: "var(--text-faint)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
