"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAuthHeaders } from "@/lib/auth";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      setFetchError(false);
      const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
        headers: getAuthHeaders(),
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

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      const q = searchQuery.toLowerCase();
      // Client-side title filtering first
      const titleMatches = conversations.filter((c) =>
        c.title.toLowerCase().includes(q)
      );

      // Try backend search for content matches
      try {
        const res = await fetch(
          `${API_URL}/api/v1/chat/conversations/search?q=${encodeURIComponent(searchQuery)}`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const contentMatches: ConversationItem[] = await res.json();
          // Merge and deduplicate
          const ids = new Set(titleMatches.map((c) => c.id));
          const merged = [...titleMatches];
          for (const m of contentMatches) {
            if (!ids.has(m.id)) merged.push(m);
          }
          setSearchResults(merged);
        } else {
          setSearchResults(titleMatches);
        }
      } catch {
        setSearchResults(titleMatches);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, conversations]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`${API_URL}/api/v1/chat/conversations/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
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

  const displayList = searchResults !== null ? searchResults : conversations;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-sidebar)" }}>
      {/* New Chat Button */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden"
          style={{
            backgroundColor: "var(--bg-raised)",
            border: "1px solid var(--border-muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 20%, transparent)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-raised)";
            e.currentTarget.style.borderColor = "var(--border-muted)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <div
            className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="text-sm font-medium transition-colors" style={{ color: "var(--text-secondary)" }}>
            New chat
          </span>
        </button>
      </div>

      {/* Search Input */}
      <div className="px-3 pb-2 flex-shrink-0">
        <div className="relative">
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-faint)" }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl text-xs transition-all duration-200 outline-none"
            style={{
              backgroundColor: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--input-border-focus)";
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-subtle)";
              e.currentTarget.style.backgroundColor = "var(--bg-raised)";
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center transition-colors"
              style={{ color: "var(--text-faint)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
            >
              <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Section label */}
      {displayList.length > 0 && (
        <div className="px-4 py-1.5 flex-shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            {searchResults !== null ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""}` : "Recent"}
          </span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && (
          <div className="flex flex-col gap-1.5 px-2 pt-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="shimmer-loading h-10 rounded-xl" />
            ))}
          </div>
        )}

        {searching && (
          <div className="flex items-center justify-center py-6">
            <span className="w-4 h-4 border-[1.5px] rounded-full animate-spin" style={{ borderColor: "var(--border-muted)", borderTopColor: "var(--brand)" }} />
          </div>
        )}

        {!loading && fetchError && (
          <div className="text-center py-8 px-3">
            <div className="text-xs mb-2" style={{ color: "var(--red)" }}>Failed to load</div>
            <button
              onClick={() => { setLoading(true); fetchConversations(); }}
              className="px-3 py-1.5 rounded-xl text-xs transition-all"
              style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-hover)" }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !fetchError && !searching && displayList.length === 0 && (
          <div className="text-center py-8 px-4">
            <div className="text-sm font-medium mb-1" style={{ color: "var(--text-faint)", fontFamily: "monospace" }}>{searchResults !== null ? "No results" : "No chats"}</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
              {searchResults !== null ? "No matching chats found" : "Your chats will appear here"}
            </div>
          </div>
        )}

        <AnimatePresence>
          {!searching && displayList.map((conv, i) => {
            const isActive = activeId === conv.id;
            const isHovered = hoveredId === conv.id;
            return (
              <motion.div
                key={conv.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="relative mb-0.5"
                onMouseEnter={() => setHoveredId(conv.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <button
                  onClick={() => onSelect(conv.id)}
                  className="w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 relative overflow-hidden"
                  style={{
                    backgroundColor: isActive ? "var(--bg-active)" : isHovered ? "var(--bg-hover)" : "transparent",
                    color: isActive ? "var(--brand-text)" : "var(--text-secondary)",
                  }}
                >
                  {/* Active gradient accent */}
                  {isActive && (
                    <div
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                      style={{
                        background: "linear-gradient(180deg, var(--brand), #a855f7)",
                        boxShadow: "0 0 8px var(--brand-glow)",
                      }}
                    />
                  )}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 opacity-40">
                    <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="currentColor" strokeWidth="1.5"/>
                  </svg>
                  <span className="truncate flex-1 text-sm">{conv.title}</span>
                  {isHovered && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                      style={{ color: "var(--text-muted)", backgroundColor: "var(--bg-hover)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--red)";
                        e.currentTarget.style.backgroundColor = "var(--red-dim)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                      }}
                      title="Delete"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </motion.button>
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
