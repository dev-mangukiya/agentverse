"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSessionId } from "@/lib/session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface ConversationItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface ChatHistoryProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  refreshTrigger: number;
}

export function ChatHistory({ activeId, onSelect, onNewChat, refreshTrigger }: ChatHistoryProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setFetchError(false);
      const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
        headers: { "X-Session-ID": getSessionId() },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations, refreshTrigger]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, {
        method: "DELETE",
        headers: { "X-Session-ID": getSessionId() },
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) onNewChat();
    } catch {
      /* ignore */
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    const hr = Math.floor(diff / 60);
    if (hr < 24) return `${hr}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-sidebar)" }}>
      {/* New Chat Button */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all duration-150 group"
          style={{
            backgroundColor: "var(--bg-raised)",
            border: "1px solid var(--border-muted)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-elevated)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-raised)")}
        >
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-sm font-medium transition-colors" style={{ color: "var(--text-secondary)" }}>
            New chat
          </span>
        </button>
      </div>

      {/* Section label */}
      {conversations.length > 0 && (
        <div className="px-4 py-1 flex-shrink-0">
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Recent
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex flex-col gap-1.5 px-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-full animate-pulse" style={{ backgroundColor: "var(--bg-hover)" }} />
            ))}
          </div>
        )}

        {!loading && fetchError && (
          <div className="text-center py-8 px-3">
            <div className="text-xs mb-2" style={{ color: "var(--red)" }}>Failed to load</div>
            <button
              onClick={() => { setLoading(true); fetchConversations(); }}
              className="px-3 py-1.5 rounded-full text-xs transition-all"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-hover)" }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && conversations.length === 0 && (
          <div className="text-center text-xs py-8 px-4" style={{ color: "var(--text-faint)" }}>
            Your chats will appear here
          </div>
        )}

        <AnimatePresence>
          {conversations.map((conv) => {
            const isActive = activeId === conv.id;
            const isHovered = hoveredId === conv.id;
            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="relative"
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-full text-sm transition-all duration-150"
                  style={{
                    backgroundColor: isActive ? "var(--bg-active)" : isHovered ? "var(--bg-hover)" : "transparent",
                    color: isActive ? "var(--brand-text)" : "var(--text-secondary)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 opacity-50">
                    <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span className="truncate flex-1 text-sm">{conv.title}</span>
                  {isHovered && (
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-all"
                      style={{ color: "var(--text-muted)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                      title="Delete"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
