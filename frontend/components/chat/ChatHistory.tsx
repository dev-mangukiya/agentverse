"use client";

import { useState, useEffect, useRef } from "react";
import { getAuthHeaders, useAuth } from "@/lib/auth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface ConversationItem {
  id: string;
  title: string;
  updated_at: string;
  is_pinned?: boolean;
}
interface ChatHistoryProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  refreshTrigger: number;
  compact?: boolean;
}

export function ChatHistory({ activeId, onSelect, onNewChat, refreshTrigger, compact = false }: ChatHistoryProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ConversationItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const listVersion = useRef(0);

  useEffect(() => {
    setConversations([]);
    setResults(null);
    setQuery("");
    setDeleteId(null);
    setPending(null);
    return () => { mutationController.current?.abort(); };
  }, [user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++listVersion.current;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations`, { headers: getAuthHeaders(), signal: controller.signal });
        if (!res.ok) throw new Error("Could not load chats.");
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("Could not load chats.");
        if (!controller.signal.aborted && version === listVersion.current) setConversations(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load chats.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [refreshTrigger, retry, user?.id]);

  useEffect(() => {
    const controller = new AbortController();
    const term = query.trim();
    setResults(null);
    if (!term) { setSearching(false); return; }
    setSearching(true);
    const titleMatches = conversations.filter(c => c.title.toLowerCase().includes(term.toLowerCase()));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations/search?q=${encodeURIComponent(term)}`, {
          headers: getAuthHeaders(), signal: controller.signal,
        });
        if (!res.ok) throw new Error("Search unavailable");
        const data: ConversationItem[] = await res.json();
        const merged = new Map(titleMatches.map(c => [c.id, c]));
        data.forEach(c => merged.set(c.id, c));
        if (!controller.signal.aborted) setResults(Array.from(merged.values()));
      } catch {
        if (!controller.signal.aborted) setResults(titleMatches);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, conversations]);

  const mutate = async (id: string, action: "pin" | "delete") => {
    if (mutationController.current) return;
    const controller = new AbortController();
    mutationController.current = controller;
    setPending(id);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/v1/chat/conversations/${id}${action === "pin" ? "/pin" : ""}`, {
        method: action === "pin" ? "PATCH" : "DELETE", headers: getAuthHeaders(), signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Could not ${action === "pin" ? "update" : "delete"} chat. Please retry.`);
      if (controller.signal.aborted) return;
      // A list request started before this mutation must not restore stale rows.
      listVersion.current += 1;
      if (action === "delete") {
        setConversations(list => list.filter(c => c.id !== id));
        setResults(list => list?.filter(c => c.id !== id) ?? null);
        setDeleteId(null);
        if (activeId === id) onNewChat();
      } else {
        const data = await res.json();
        if (controller.signal.aborted) return;
        setConversations(list => list.map(c => c.id === id ? { ...c, is_pinned: data.is_pinned } : c));
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not update chat. Please retry.");
    } finally {
      if (mutationController.current === controller) mutationController.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  };

  const visible = (query.trim() ? results ?? conversations.filter(c => c.title.toLowerCase().includes(query.trim().toLowerCase())) : conversations)
    .slice().sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned) || Date.parse(b.updated_at) - Date.parse(a.updated_at));

  return (
    <section className="flex flex-col h-full min-h-0" aria-label="Conversations">
      {!compact && <div className="p-3 space-y-3 flex-shrink-0">
        <button onClick={onNewChat} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium" style={{ background: "var(--brand-dim)", color: "var(--brand-text)" }}>＋ New chat</button>
        <div className="relative">
          <input aria-label="Search conversations" placeholder="Search chats…" value={query} onChange={e => setQuery(e.target.value)}
            className="w-full min-w-0 pl-3 pr-10 py-2 rounded-lg text-sm" style={{ background: "var(--bg-raised)", color: "var(--text-primary)", border: "1px solid var(--border-subtle)" }} />
          {query && <button aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-0 top-0 h-full w-10">×</button>}
        </div>
      </div>
      }
      {error && <div className="mx-3 mb-2 text-xs" role="alert" style={{ color: "var(--red)" }}>{error} <button className="underline p-1" onClick={() => setRetry(n => n + 1)}>Retry</button></div>}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 pb-3" aria-busy={loading || searching}>
        {loading && !visible.length ? <p role="status" className="p-3 text-xs" style={{ color: "var(--text-muted)" }}>Loading chats…</p> : null}
        {searching && <p role="status" className="px-3 py-1 text-xs" style={{ color: "var(--text-muted)" }}>Searching…</p>}
        {!loading && !searching && !error && !visible.length && <p className="p-3 text-sm" style={{ color: "var(--text-muted)" }}>{query ? "No matching chats." : "Your conversations will appear here."}</p>}
        {visible.map(conv => <div key={conv.id} className="history-row rounded-xl mb-1" style={{ background: activeId === conv.id ? "var(--bg-active)" : undefined }}>
          <div className="flex items-center min-w-0">
            <button onClick={() => onSelect(conv.id)} aria-current={activeId === conv.id ? "true" : undefined} title={conv.title}
              className="min-w-0 flex-1 text-left px-3 py-3 text-sm truncate" style={{ color: activeId === conv.id ? "var(--brand-text)" : "var(--text-secondary)" }}>{conv.title || "Untitled chat"}</button>
            <div className="history-actions flex flex-shrink-0 pr-1">
              <button aria-label={`${conv.is_pinned ? "Unpin" : "Pin"} ${conv.title}`} aria-pressed={!!conv.is_pinned} disabled={pending !== null}
                onClick={() => mutate(conv.id, "pin")} className="history-action" title={conv.is_pinned ? "Unpin" : "Pin"} style={{ color: conv.is_pinned ? "var(--brand-text)" : "var(--text-muted)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={conv.is_pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5"><path d="m16 2 5 5-5.5 5.5 3 3L12 22l-1-7-7-1 6.5-6.5 3 3z"/></svg>
              </button>
              <button aria-label={`Delete ${conv.title}`} disabled={pending !== null} onClick={() => setDeleteId(deleteId === conv.id ? null : conv.id)} className="history-action" title="Delete chat" style={{ color: "var(--text-muted)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></svg>
              </button>
            </div>
          </div>
          {deleteId === conv.id && <div className="px-3 pb-3 text-xs" role="group" aria-label={`Confirm deletion of ${conv.title}`}>
            <p className="mb-2" style={{ color: "var(--text-secondary)" }}>Delete this chat permanently?</p>
            <div className="flex gap-2"><button disabled={pending !== null} onClick={() => mutate(conv.id, "delete")} className="rounded-lg px-3 py-2" style={{ color: "var(--red)", background: "var(--red-dim)" }}>{pending === conv.id ? "Deleting…" : "Delete"}</button>
            <button disabled={pending !== null} onClick={() => setDeleteId(null)} className="rounded-lg px-3 py-2">Cancel</button></div>
          </div>}
        </div>)}
      </div>
    </section>
  );
}
