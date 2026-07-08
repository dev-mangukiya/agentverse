"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { getSessionId } from "@/lib/session";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const WS_BASE = API_URL.replace("http", "ws");

interface Message {
  id: string | number;
  role: "user" | "agent" | "system" | "tool";
  agent_name?: string;
  content: string;
  tool_name?: string;
  created_at?: string;
}

interface ToolActivity {
  tool: string;
  status: "calling" | "done";
  args?: Record<string, unknown>;
  result?: string;
}

interface ChatPanelProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onMessageSent: () => void;
}

const SUGGESTIONS = [
  "Search for the latest AI news",
  "What is 25 × 37?",
  "What time is it right now?",
  "Open YouTube for me",
];

export function ChatPanel({ conversationId, onConversationCreated, onMessageSent }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAgent, setThinkingAgent] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, toolActivity, isThinking]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input]);

  // Load conversation messages
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations/${conversationId}`, {
          headers: { "X-Session-ID": getSessionId() },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };
    load();
  }, [conversationId]);

  // WebSocket connection
  const connectWs = useCallback((convId: string) => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = new WebSocket(`${WS_BASE}/api/v1/chat/ws/${convId}`);
    wsRef.current = ws;

    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      setWsConnected(true);
      setError(null);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 30000);
      if (pendingMessageRef.current) {
        ws.send(JSON.stringify({ type: "message", content: pendingMessageRef.current }));
        pendingMessageRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "thinking":
          setIsThinking(true);
          setThinkingAgent(data.agent || "orchestrator");
          break;
        case "tool_call":
          setToolActivity({ tool: data.tool, status: "calling", args: data.args });
          break;
        case "tool_result":
          setToolActivity({ tool: data.tool, status: "done", result: data.result });
          setTimeout(() => setToolActivity(null), 1500);
          break;
        case "response":
          setIsThinking(false);
          setToolActivity(null);
          setThinkingAgent("");
          if (data.message) {
            setMessages((prev) => [...prev, data.message]);
          } else {
            setMessages((prev) => [...prev, { id: Date.now(), role: "agent", agent_name: data.agent, content: data.content }]);
          }
          onMessageSent();
          break;
        case "message_saved":
          break;
        case "error":
          setIsThinking(false);
          setToolActivity(null);
          setError(data.content);
          setMessages((prev) => [...prev, { id: Date.now(), role: "system", content: `⚠️ ${data.content}` }]);
          break;
        case "pong":
          break;
      }
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      if (wsRef.current !== ws) return;
      setWsConnected(false);
      setIsThinking(false);
      setToolActivity(null);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (convId) connectWs(convId);
      }, 3000);
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      setWsConnected(false);
    };
  }, [onMessageSent]);

  // Connect/disconnect on conversation change
  useEffect(() => {
    if (conversationId) {
      connectWs(conversationId);
    } else {
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { const old = wsRef.current; wsRef.current = null; old.close(); }
      setWsConnected(false);
    }
    return () => {
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { const old = wsRef.current; wsRef.current = null; old.close(); }
    };
  }, [conversationId, connectWs]);

  const handleSend = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || isThinking) return;
    setInput("");
    setError(null);

    let activeConvId = conversationId;

    if (!activeConvId) {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-ID": getSessionId() },
          body: JSON.stringify({ title: content.slice(0, 80) }),
        });
        const conv = await res.json();
        activeConvId = conv.id;
        pendingMessageRef.current = content;
        skipNextLoadRef.current = true;
        onConversationCreated(conv.id);
      } catch {
        setError("Failed to create conversation");
        return;
      }
    }

    const userMsg: Message = { id: Date.now(), role: "user", content, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    if (!pendingMessageRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    } else if (!pendingMessageRef.current && wsRef.current?.readyState === WebSocket.CONNECTING) {
      pendingMessageRef.current = content;
    } else if (!pendingMessageRef.current) {
      setError("Not connected. Reconnecting...");
      if (activeConvId) { pendingMessageRef.current = content; connectWs(activeConvId); }
    }
  };

  const toolIcons: Record<string, string> = {
    web_search: "🔍", open_url: "🌐", execute_python: "💻",
    calculate: "🧮", get_current_time: "🕐", read_file: "📄", write_file: "✍️",
  };

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Persistent top bar */}
      <div
        className="flex items-center justify-between px-5 h-12 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center text-white text-[10px] font-bold">A</div>
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>AgentVerse</span>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>·</span>
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>Multi-agent AI workforce</span>
        </div>

        {conversationId ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-300"
            style={{
              backgroundColor: wsConnected ? "var(--green-dim)" : "var(--red-dim)",
              color: wsConnected ? "var(--green)" : "var(--red)",
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!wsConnected && "animate-pulse"}`}
              style={{ backgroundColor: wsConnected ? "var(--green)" : "var(--red)" }}
            />
            {wsConnected ? "Connected" : "Reconnecting…"}
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
            style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-muted)" }}
          >
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--text-muted)" }} />
            Idle
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center h-full px-6 pb-8">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#4285f4] via-[#8b5cf6] to-[#ec4899] flex items-center justify-center mb-6 shadow-2xl" style={{ boxShadow: "0 8px 32px var(--shadow-brand)" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l2.5 6.5H21l-5.5 4 2 6.5L12 16l-5.5 4 2-6.5L3 9.5h6.5L12 3Z" fill="white" opacity="0.9"/>
              </svg>
            </div>

            <h1 className="text-3xl font-semibold mb-2 text-center" style={{ color: "var(--text-primary)" }}>
              Hello, how can I help?
            </h1>
            <p className="text-sm mb-8 text-center max-w-sm" style={{ color: "var(--text-muted)" }}>
              I can search the web, run code, open websites, do calculations, and more.
            </p>

            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="px-4 py-2 rounded-full text-sm transition-all duration-150"
                  style={{
                    color: "var(--text-secondary)",
                    backgroundColor: "var(--bg-raised)",
                    border: "1px solid var(--border-muted)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-raised)";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => (
                <motion.div
                  key={`${msg.id}-${idx}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role !== "user" && (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 mr-3 mt-0.5">A</div>
                  )}

                  <div
                    className="overflow-hidden"
                    style={{
                      overflowWrap: "anywhere",
                      ...(msg.role === "user" ? {
                        maxWidth: "75%",
                        padding: "12px 16px",
                        borderRadius: "18px 18px 4px 18px",
                        backgroundColor: "var(--bubble-user-bg)",
                        color: "var(--bubble-user-text)",
                        fontSize: "14px",
                        lineHeight: "1.6",
                      } : msg.role === "system" ? {
                        maxWidth: "80%",
                        padding: "12px 16px",
                        borderRadius: "16px",
                        backgroundColor: "var(--red-dim)",
                        color: "var(--red)",
                        border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)",
                        fontSize: "14px",
                      } : {
                        flex: 1,
                        color: "var(--text-primary)",
                        fontSize: "14px",
                        lineHeight: "1.7",
                      }),
                    }}
                  >
                    {msg.role === "agent" && msg.agent_name && (
                      <div className="text-[10px] font-semibold mb-1.5 uppercase tracking-widest" style={{ color: "var(--brand-text)" }}>
                        {msg.agent_name}
                      </div>
                    )}
                    {msg.role === "user"
                      ? <span className="break-words">{msg.content}</span>
                      : <MarkdownRenderer content={msg.content} />
                    }
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Tool activity */}
            {toolActivity && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 ml-10">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-full text-xs"
                  style={{
                    backgroundColor: "var(--brand-dim)",
                    border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
                    color: "var(--brand-text)",
                  }}
                >
                  <span>{toolIcons[toolActivity.tool] || "🔧"}</span>
                  <span>{toolActivity.status === "calling" ? `Using ${toolActivity.tool}…` : `${toolActivity.tool} done`}</span>
                  {toolActivity.status === "calling" && (
                    <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brand-dim)", borderTopColor: "var(--brand)" }} />
                  )}
                </div>
              </motion.div>
            )}

            {/* Thinking indicator */}
            {isThinking && !toolActivity && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 ml-10">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map(i => (
                      <span key={i} className="w-1 h-1 rounded-full bg-white animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{thinkingAgent || "Agent"} is thinking…</span>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 pb-2">
          <div
            className="max-w-3xl mx-auto px-4 py-2 rounded-xl text-xs flex items-center justify-between"
            style={{
              backgroundColor: "var(--red-dim)",
              border: "1px solid color-mix(in srgb, var(--red) 25%, transparent)",
              color: "var(--red)",
            }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3 transition-colors hover:opacity-70">✕</button>
          </div>
        </div>
      )}

      {/* Floating input bar */}
      <div className="px-4 pb-5 pt-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div
            className="relative flex items-end gap-2 rounded-3xl px-4 py-3 transition-all duration-200 shadow-xl"
            style={{
              backgroundColor: "var(--input-bg)",
              border: "1px solid var(--input-border)",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "var(--input-border-focus)";
              el.style.backgroundColor = "var(--input-bg-focus)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "var(--input-border)";
              el.style.backgroundColor = "var(--input-bg)";
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask AgentVerse anything…"
              rows={1}
              className="flex-1 bg-transparent text-sm outline-none resize-none leading-6 max-h-[180px] overflow-y-auto"
              style={{ color: "var(--text-primary)" }}
              disabled={isThinking}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isThinking}
              className="send-btn flex-shrink-0 mb-0.5"
            >
              {isThinking ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-[10px] mt-2" style={{ color: "var(--text-faint)" }}>
            AgentVerse can make mistakes. Consider verifying important information.
          </p>
        </div>
      </div>
    </div>
  );
}

