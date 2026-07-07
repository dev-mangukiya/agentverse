"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

export function ChatPanel({ conversationId, onConversationCreated, onMessageSent }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAgent, setThinkingAgent] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag to distinguish intentional close (new chat / navigation) from unexpected disconnect
  const intentionalCloseRef = useRef(false);
  // Queue: if user sends a message before WS is open, buffer it here
  const pendingMessageRef = useRef<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, toolActivity, isThinking]);

  // Load conversation messages when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations/${conversationId}`);
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };
    loadMessages();
  }, [conversationId]);

  // WebSocket connection
  const connectWs = useCallback((convId: string) => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection intentionally
    if (wsRef.current) {
      intentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;

    const ws = new WebSocket(`${WS_BASE}/api/v1/chat/ws/${convId}`);

    // Keep-alive ping to prevent Render load balancer from dropping idle connections (55s limit)
    let pingInterval: ReturnType<typeof setInterval> | null = null;

    ws.onopen = () => {
      setWsConnected(true);
      setError(null);
      pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);

      // Flush any message that was queued while WS was connecting
      if (pendingMessageRef.current) {
        ws.send(JSON.stringify({ type: "message", content: pendingMessageRef.current }));
        pendingMessageRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "thinking":
          setIsThinking(true);
          setThinkingAgent(data.agent || "orchestrator");
          break;

        case "tool_call":
          setToolActivity({
            tool: data.tool,
            status: "calling",
            args: data.args,
          });
          break;

        case "tool_result":
          setToolActivity({
            tool: data.tool,
            status: "done",
            result: data.result,
          });
          // Clear after brief display
          setTimeout(() => setToolActivity(null), 1500);
          break;

        case "response":
          setIsThinking(false);
          setToolActivity(null);
          setThinkingAgent("");
          if (data.message) {
            setMessages((prev) => [...prev, data.message]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now(),
                role: "agent",
                agent_name: data.agent,
                content: data.content,
              },
            ]);
          }
          onMessageSent();
          break;

        case "message_saved":
          // Backend echo of saved user message — already shown via optimistic UI, skip
          break;

        case "error":
          setIsThinking(false);
          setToolActivity(null);
          setError(data.content);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: "system",
              content: `⚠️ ${data.content}`,
            },
          ]);
          break;

        case "pong":
          break;
      }
    };

    ws.onclose = () => {
      if (pingInterval) clearInterval(pingInterval);
      setWsConnected(false);
      setIsThinking(false);
      setToolActivity(null);

      // Only reconnect if this was NOT an intentional close (e.g. user pressed New Chat)
      if (!intentionalCloseRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (convId) connectWs(convId);
        }, 3000);
      }
    };

    ws.onerror = () => {
      // onerror is always followed by onclose, so just clear UI state here
      setWsConnected(false);
    };

    wsRef.current = ws;
  }, [onMessageSent]);

  // Connect/disconnect WS when conversation changes
  useEffect(() => {
    if (conversationId) {
      connectWs(conversationId);
    } else {
      // conversationId is null (New Chat) — clean up intentionally
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
    }

    return () => {
      // Cleanup on unmount or before re-running effect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        intentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [conversationId, connectWs]);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    const content = input.trim();
    setInput("");
    setError(null);

    let activeConvId = conversationId;

    // Create conversation if needed
    if (!activeConvId) {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 80) }),
        });
        const conv = await res.json();
        activeConvId = conv.id;

        // Queue the message so it gets sent as soon as WS opens
        pendingMessageRef.current = content;

        // This triggers the useEffect which calls connectWs
        onConversationCreated(conv.id);
      } catch (err) {
        setError("Failed to create conversation");
        return;
      }
    }

    // Optimistic UI: add user message immediately
    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // If WS is already open (existing conversation), send immediately
    // If WS is connecting (new conversation), the message is queued in pendingMessageRef
    if (!pendingMessageRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "message", content }));
    } else if (!pendingMessageRef.current && wsRef.current?.readyState === WebSocket.CONNECTING) {
      // WS is still connecting, queue the message
      pendingMessageRef.current = content;
    } else if (!pendingMessageRef.current) {
      // WS is not connected and no pending message — try to reconnect
      setError("Not connected to server. Reconnecting...");
      if (activeConvId) {
        pendingMessageRef.current = content;
        connectWs(activeConvId);
      }
    }
  };

  const toolIcons: Record<string, string> = {
    web_search: "🔍",
    open_url: "🌐",
    execute_python: "💻",
    calculate: "🧮",
    get_current_time: "🕐",
    read_file: "📄",
    write_file: "✍️",
  };

  return (
    <div className="glass-panel flex flex-col h-full">
      {/* Chat Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
          A
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">AgentVerse</div>
          <div className="text-[10px] text-zinc-500">Multi-agent AI workforce</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`status-dot ${wsConnected ? "status-dot--ok" : "status-dot--error"}`} />
          <span className={`text-xs ${wsConnected ? "text-emerald-400" : "text-red-400"}`}>
            {wsConnected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.length === 0 && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500/20 to-purple-500/20 flex items-center justify-center mb-4">
              <span className="text-2xl">⬡</span>
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">AgentVerse Ready</h3>
            <p className="text-sm text-zinc-500 max-w-md">
              Tell me what you need. I can search the web, open websites, run code,
              do calculations, and more.
            </p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {["Open YouTube", "Search for AI news", "What is 25 * 37?", "What time is it?"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:text-zinc-300 transition-all"
                  >
                    {suggestion}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={`${msg.id}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-brand-600/30 text-brand-100 rounded-br-md"
                    : msg.role === "system"
                    ? "bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-bl-md"
                    : "glass-panel-subtle text-zinc-300 rounded-bl-md"
                }`}
              >
                {msg.role === "agent" && msg.agent_name && (
                  <div className="text-[10px] font-semibold text-brand-400 mb-1 uppercase tracking-wider">
                    {msg.agent_name}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                {msg.created_at && (
                  <div className="text-[10px] text-zinc-600 mt-1.5">
                    {new Date(msg.created_at).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Tool Activity Indicator */}
        {toolActivity && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[rgba(34,34,51,0.5)] border border-white/[0.04] w-fit"
          >
            <span className="text-base">{toolIcons[toolActivity.tool] || "🔧"}</span>
            <div>
              <span className="text-xs font-medium text-zinc-300">
                {toolActivity.status === "calling" ? `Using ${toolActivity.tool}...` : `${toolActivity.tool} complete`}
              </span>
              {toolActivity.args && Object.keys(toolActivity.args).length > 0 && (
                <div className="text-[10px] text-zinc-500 font-mono truncate max-w-[300px]">
                  {JSON.stringify(toolActivity.args)}
                </div>
              )}
            </div>
            {toolActivity.status === "calling" && (
              <div className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
            )}
          </motion.div>
        )}

        {/* Thinking Indicator */}
        {isThinking && !toolActivity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs text-zinc-500"
          >
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span>{thinkingAgent || "Agent"} is thinking...</span>
          </motion.div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-5 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-500 hover:text-red-300">✕</button>
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask anything — search, open websites, run code..."
            className="input-field flex-1"
            disabled={isThinking}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {isThinking ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
