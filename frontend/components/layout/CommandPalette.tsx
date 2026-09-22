"use client";

/**
 * Command Palette — full ⌘K modal for navigation, actions, and chat search.
 *
 * Replaces the previous ⌘K → focus-input behavior with a searchable
 * command list. Uses existing motion tokens and panel styling.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAgent, getAgentIcon, AGENT_REGISTRY } from "@/config/agents";
import { getAuthHeaders } from "@/lib/auth";
import { getSessionId } from "@/lib/session";
import { transition, EASE, DURATION } from "@/config/motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

type View = "dashboard" | "agents" | "chat";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  onFocusInput: () => void;
  onSelectConversation: (id: string) => void;
  onToggleSidebar: () => void;
  onOpenAgentCompare: (agentId?: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  category: "navigation" | "action" | "agent" | "chat";
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

interface SearchResult {
  id: string;
  title: string;
  message_count?: number;
}

const NAV_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const ACTION_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const SEARCH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onNewChat,
  onFocusInput,
  onSelectConversation,
  onToggleSidebar,
  onOpenAgentCompare,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setSearchResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Static commands
  const staticCommands = useMemo((): CommandItem[] => {
    const cmds: CommandItem[] = [
      // Navigation
      { id: "nav-dashboard", label: "Go to Dashboard", category: "navigation", icon: NAV_ICON, onSelect: () => { onNavigate("dashboard"); onClose(); } },
      { id: "nav-agents", label: "Go to Agents", category: "navigation", icon: NAV_ICON, onSelect: () => { onNavigate("agents"); onClose(); } },
      { id: "nav-chat", label: "Go to Chat", category: "navigation", icon: NAV_ICON, onSelect: () => { onNavigate("chat"); onClose(); } },
      // Actions
      { id: "act-new-chat", label: "New Chat", category: "action", icon: ACTION_ICON, shortcut: "⌘N", onSelect: () => { onNewChat(); onClose(); } },
      { id: "act-focus-input", label: "Focus Chat Input", category: "action", icon: ACTION_ICON, onSelect: () => { onFocusInput(); onClose(); } },
      { id: "act-sidebar", label: "Toggle Sidebar", category: "action", icon: ACTION_ICON, shortcut: "⌘/", onSelect: () => { onToggleSidebar(); onClose(); } },
    ];

    // Agent quick-jump (jump to Compare with a specific agent pre-selected)
    const agentIds = Object.keys(AGENT_REGISTRY).filter(id => id !== "orchestrator");
    for (const id of agentIds) {
      const info = getAgent(id);
      cmds.push({
        id: `agent-${id}`,
        label: `Compare: ${info.displayName}`,
        category: "agent",
        icon: <span style={{ color: info.color }}>{getAgentIcon(id, 14)}</span>,
        onSelect: () => { onOpenAgentCompare(id); onClose(); },
      });
    }

    return cmds;
  }, [onNavigate, onClose, onNewChat, onFocusInput, onToggleSidebar, onOpenAgentCompare]);

  // Filtered commands
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return staticCommands;
    const q = query.toLowerCase();
    return staticCommands.filter(
      cmd => cmd.label.toLowerCase().includes(q) || cmd.category.includes(q)
    );
  }, [staticCommands, query]);

  // Search chats when query changes (debounced)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const sessionId = getSessionId();
        const res = await fetch(
          `${API_URL}/api/v1/chat/conversations/search?q=${encodeURIComponent(query.trim())}`,
          { headers: { "X-Session-Id": sessionId || "", ...getAuthHeaders() } }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults((data || []).slice(0, 5));
        }
      } catch { /* silent */ }
      setSearching(false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query]);

  // All visible items
  const allItems = useMemo(() => {
    const items: { type: "command" | "chat"; item: CommandItem | SearchResult }[] = [];
    for (const cmd of filteredCommands) {
      items.push({ type: "command", item: cmd });
    }
    for (const sr of searchResults) {
      items.push({ type: "chat", item: sr });
    }
    return items;
  }, [filteredCommands, searchResults]);

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= allItems.length) setSelectedIndex(Math.max(0, allItems.length - 1));
  }, [allItems.length, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const executeSelected = useCallback(() => {
    const sel = allItems[selectedIndex];
    if (!sel) return;
    if (sel.type === "command") {
      (sel.item as CommandItem).onSelect();
    } else {
      const chat = sel.item as SearchResult;
      onSelectConversation(chat.id);
      onNavigate("chat");
      onClose();
    }
  }, [allItems, selectedIndex, onSelectConversation, onNavigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeSelected();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [allItems.length, executeSelected, onClose]);

  if (!open) return null;

  // Group commands by category for display
  const categoryLabels: Record<string, string> = {
    navigation: "Navigate",
    action: "Actions",
    agent: "Compare Agent",
  };

  let lastCategory = "";

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
            style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
          />
          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={transition.base}
            className="fixed z-[101] rounded-2xl overflow-hidden shadow-2xl"
            style={{
              top: "min(20%, 160px)",
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(560px, calc(100vw - 32px))",
              maxHeight: "min(480px, 60vh)",
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-muted)",
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <span style={{ color: "var(--text-faint)" }}>{SEARCH_ICON}</span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search chats…"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--text-primary)" }}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-faint)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                esc
              </kbd>
            </div>

            {/* Results list */}
            <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: "calc(min(480px, 60vh) - 52px)" }}>
              {allItems.length === 0 && !searching && (
                <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--text-faint)" }}>
                  No results
                </div>
              )}

              {/* Commands */}
              {allItems.map((entry, i) => {
                if (entry.type === "command") {
                  const cmd = entry.item as CommandItem;
                  const showHeader = cmd.category !== lastCategory;
                  lastCategory = cmd.category;
                  return (
                    <React.Fragment key={cmd.id}>
                      {showHeader && (
                        <div
                          className="text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {categoryLabels[cmd.category] || cmd.category}
                        </div>
                      )}
                      <button
                        data-index={i}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm"
                        style={{
                          backgroundColor: i === selectedIndex ? "var(--bg-hover)" : "transparent",
                          color: i === selectedIndex ? "var(--text-primary)" : "var(--text-secondary)",
                          transition: "background-color var(--duration-instant) var(--ease-out)",
                        }}
                        onClick={() => cmd.onSelect()}
                        onMouseEnter={() => setSelectedIndex(i)}
                      >
                        <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>{cmd.icon}</span>
                        <span className="flex-1 truncate">{cmd.label}</span>
                        {cmd.shortcut && (
                          <kbd
                            className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              backgroundColor: "var(--bg-hover)",
                              color: "var(--text-faint)",
                              border: "1px solid var(--border-subtle)",
                            }}
                          >
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </button>
                    </React.Fragment>
                  );
                } else {
                  const chat = entry.item as SearchResult;
                  const showHeader = lastCategory !== "chat_results";
                  if (showHeader) lastCategory = "chat_results";
                  return (
                    <React.Fragment key={`chat-${chat.id}`}>
                      {showHeader && (
                        <div
                          className="text-[10px] font-semibold uppercase tracking-wider px-4 pt-3 pb-1"
                          style={{ color: "var(--text-faint)" }}
                        >
                          Chats
                        </div>
                      )}
                      <button
                        data-index={i}
                        className="w-full flex items-center gap-3 px-4 py-2 text-left text-sm"
                        style={{
                          backgroundColor: i === selectedIndex ? "var(--bg-hover)" : "transparent",
                          color: i === selectedIndex ? "var(--text-primary)" : "var(--text-secondary)",
                          transition: "background-color var(--duration-instant) var(--ease-out)",
                        }}
                        onClick={() => {
                          onSelectConversation(chat.id);
                          onNavigate("chat");
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(i)}
                      >
                        <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="flex-1 truncate">{chat.title}</span>
                        {chat.message_count != null && (
                          <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: "var(--text-faint)" }}>
                            {chat.message_count} msgs
                          </span>
                        )}
                      </button>
                    </React.Fragment>
                  );
                }
              })}

              {searching && (
                <div className="px-4 py-3 text-xs" style={{ color: "var(--text-faint)" }}>
                  Searching chats…
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
