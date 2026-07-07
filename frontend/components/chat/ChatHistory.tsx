"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

  const fetchConversations = useCallback(async () => {
    try {
      setFetchError(false);
      const res = await fetch(`${API_URL}/api/v1/chat/conversations`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      } else {
        setFetchError(true);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
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
    if (!confirm("Delete this conversation?")) return;

    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        onNewChat();
      }
    } catch (err) {
      console.error("Failed to delete conversation:", err);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full">
      {/* New Chat Button */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="w-full btn-primary text-center flex items-center justify-center gap-2"
        >
          <span>+</span>
          <span>New Chat</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {loading && (
          <div className="text-center text-xs text-zinc-500 py-4">Loading...</div>
        )}

        {!loading && fetchError && (
          <div className="text-center py-8 px-3">
            <div className="text-xs text-red-400 mb-2">Failed to load conversations</div>
            <button
              onClick={() => { setLoading(true); fetchConversations(); }}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-zinc-300 transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && conversations.length === 0 && (
          <div className="text-center text-xs text-zinc-600 py-8 px-3">
            No conversations yet. Start a new chat!
          </div>
        )}

        <AnimatePresence>
          {conversations.map((conv) => (
            <motion.button
              key={conv.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group flex items-start gap-2 ${
                activeId === conv.id
                  ? "bg-brand-600/20 text-brand-300"
                  : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-300"
              }`}
            >
              <span className="text-xs mt-0.5 flex-shrink-0 opacity-50">◉</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{conv.title}</div>
                <div className="text-[10px] text-zinc-600 mt-0.5">
                  {formatTime(conv.updated_at)} · {conv.message_count} msgs
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all text-xs flex-shrink-0 mt-0.5"
                title="Delete"
              >
                ✕
              </button>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
