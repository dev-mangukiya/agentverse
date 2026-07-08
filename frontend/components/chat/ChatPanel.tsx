"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { getSessionId } from "@/lib/session";
import { agentMeta } from "@/components/agents/AgentCard";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const WS_BASE = API_URL.replace("http", "ws");

interface Message {
  id: string | number;
  role: "user" | "agent" | "system" | "tool";
  agent_name?: string;
  content: string;
  tool_name?: string;
  created_at?: string;
  contributing_agents?: string[];
  pipeline_duration_ms?: number;
}

interface ToolActivity {
  tool: string;
  status: "calling" | "done";
  agent?: string;
  args?: Record<string, unknown>;
  result?: string;
  duration_ms?: number;
}

// Pipeline state types exposed to parent
export interface PipelineAgent {
  name: string;
  status: "idle" | "activated" | "thinking" | "tool_call" | "complete" | "error";
  task?: string;
  phase?: string;
  toolName?: string;
  toolArgs?: Record<string, string>;
  durationMs?: number;
  summary?: string;
  startTime?: number;
}

export interface DelegationEvent {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

export interface ToolEvent {
  agent: string;
  tool: string;
  status: "calling" | "done";
  durationMs?: number;
  result?: string;
  timestamp: number;
}

interface ChatPanelProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onMessageSent: () => void;
  onPipelineUpdate?: (data: {
    agents: PipelineAgent[];
    delegations: DelegationEvent[];
    toolEvents: ToolEvent[];
    active: boolean;
    durationMs?: number;
    totalAgentsUsed?: number;
  }) => void;
}

const SUGGESTIONS = [
  { text: "Research the latest AI breakthroughs", icon: "🔬", agent: "research" },
  { text: "Write a Python web scraper", icon: "💻", agent: "coding" },
  { text: "Draft a professional email", icon: "✍️", agent: "writer" },
  { text: "Analyze trends in tech industry", icon: "📊", agent: "data" },
];

export function ChatPanel({ conversationId, onConversationCreated, onMessageSent, onPipelineUpdate }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingAgent, setThinkingAgent] = useState<string>("");
  const [thinkingPhase, setThinkingPhase] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);

  // Pipeline state
  const pipelineAgentsRef = useRef<PipelineAgent[]>([]);
  const delegationsRef = useRef<DelegationEvent[]>([]);
  const toolEventsRef = useRef<ToolEvent[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);

  // Emit pipeline updates
  const emitPipeline = useCallback((active: boolean, durationMs?: number, totalAgentsUsed?: number) => {
    onPipelineUpdate?.({
      agents: [...pipelineAgentsRef.current],
      delegations: [...delegationsRef.current],
      toolEvents: [...toolEventsRef.current],
      active,
      durationMs,
      totalAgentsUsed,
    });
  }, [onPipelineUpdate]);

  const resetPipeline = useCallback(() => {
    pipelineAgentsRef.current = [];
    delegationsRef.current = [];
    toolEventsRef.current = [];
    setActiveAgents([]);
    emitPipeline(false);
  }, [emitPipeline]);

  const updateAgent = useCallback((name: string, updates: Partial<PipelineAgent>) => {
    const agents = pipelineAgentsRef.current;
    const idx = agents.findIndex(a => a.name === name);
    if (idx >= 0) {
      agents[idx] = { ...agents[idx], ...updates };
    } else {
      agents.push({ name, status: "idle", ...updates } as PipelineAgent);
    }
    pipelineAgentsRef.current = [...agents];
    setActiveAgents(agents.filter(a => ["activated", "thinking", "tool_call"].includes(a.status)).map(a => a.name));
    emitPipeline(true);
  }, [emitPipeline]);

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
        case "pipeline_start":
          resetPipeline();
          emitPipeline(true);
          break;

        case "agent_activated":
          updateAgent(data.agent, {
            status: "activated",
            task: data.task,
            startTime: Date.now(),
          });
          break;

        case "delegation":
          delegationsRef.current = [
            ...delegationsRef.current,
            { from: data.from, to: data.to, reason: data.reason, timestamp: Date.now() },
          ];
          emitPipeline(true);
          break;

        case "thinking":
          setIsThinking(true);
          setThinkingAgent(data.agent || "orchestrator");
          setThinkingPhase(data.phase || "");
          updateAgent(data.agent || "orchestrator", {
            status: "thinking",
            phase: data.phase,
            startTime: pipelineAgentsRef.current.find(a => a.name === (data.agent || "orchestrator"))?.startTime || Date.now(),
          });
          break;

        case "tool_call":
          setToolActivity({ tool: data.tool, status: "calling", agent: data.agent, args: data.args });
          updateAgent(data.agent || thinkingAgent, {
            status: "tool_call",
            toolName: data.tool,
            toolArgs: data.args,
          });
          toolEventsRef.current = [
            ...toolEventsRef.current,
            { agent: data.agent || thinkingAgent, tool: data.tool, status: "calling", timestamp: Date.now() },
          ];
          emitPipeline(true);
          break;

        case "tool_result":
          setToolActivity({
            tool: data.tool,
            status: "done",
            agent: data.agent,
            result: data.result,
            duration_ms: data.duration_ms,
          });
          // Update tool event
          const toolIdx = toolEventsRef.current.findLastIndex(
            t => t.tool === data.tool && t.status === "calling"
          );
          if (toolIdx >= 0) {
            toolEventsRef.current[toolIdx] = {
              ...toolEventsRef.current[toolIdx],
              status: "done",
              durationMs: data.duration_ms,
              result: data.result,
            };
          }
          // Set agent back to thinking
          updateAgent(data.agent || thinkingAgent, {
            status: "thinking",
            toolName: undefined,
            toolArgs: undefined,
          });
          setTimeout(() => setToolActivity(null), 800);
          break;

        case "agent_complete":
          updateAgent(data.agent, {
            status: "complete",
            durationMs: data.duration_ms,
            summary: data.summary,
            toolName: undefined,
            toolArgs: undefined,
          });
          break;

        case "synthesis_start":
          updateAgent("orchestrator", {
            status: "thinking",
            phase: "synthesizing",
            startTime: Date.now(),
          });
          break;

        case "pipeline_complete":
          setIsThinking(false);
          setToolActivity(null);
          setThinkingAgent("");
          setThinkingPhase("");
          emitPipeline(false, data.total_duration_ms, data.agents_used);
          break;

        case "response":
          setIsThinking(false);
          setToolActivity(null);
          setThinkingAgent("");
          setThinkingPhase("");
          if (data.message) {
            setMessages((prev) => [...prev, {
              ...data.message,
              contributing_agents: data.contributing_agents,
              pipeline_duration_ms: data.pipeline_duration_ms,
            }]);
          } else {
            setMessages((prev) => [...prev, {
              id: Date.now(),
              role: "agent",
              agent_name: data.agent,
              content: data.content,
              contributing_agents: data.contributing_agents,
              pipeline_duration_ms: data.pipeline_duration_ms,
            }]);
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
          emitPipeline(false);
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
  }, [onMessageSent, emitPipeline, resetPipeline, updateAgent, thinkingAgent]);

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
    resetPipeline();

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

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Top bar with active agent indicators */}
      <div
        className="flex items-center justify-between px-5 h-12 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white text-[10px] font-bold">A</div>
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>AgentVerse</span>

          {/* Active agents mini bar */}
          {activeAgents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 ml-2 px-2 py-1 rounded-full"
              style={{ backgroundColor: "var(--brand-dim)" }}
            >
              {activeAgents.map(name => {
                const meta = agentMeta[name];
                return (
                  <motion.div
                    key={name}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 rounded-md flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${meta?.color || "var(--brand)"} 25%, transparent)`,
                      fontSize: "8px",
                    }}
                    title={`${meta?.label || name} active`}
                  >
                    {meta?.icon || "🤖"}
                  </motion.div>
                );
              })}
              <span className="text-[10px] font-medium ml-0.5" style={{ color: "var(--brand-text)" }}>
                {activeAgents.length} active
              </span>
            </motion.div>
          )}
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
          /* Multi-agent welcome screen */
          <div className="flex flex-col items-center justify-center h-full px-6 pb-8">
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6"
              style={{
                background: "linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)",
                boxShadow: "0 8px 40px rgba(99,102,241,0.3)",
              }}
            >
              <span className="text-2xl">⚡</span>
            </div>

            <h1 className="text-2xl font-bold mb-2 text-center gradient-text">
              Multi-Agent AI Workforce
            </h1>
            <p className="text-sm mb-8 text-center max-w-md" style={{ color: "var(--text-muted)" }}>
              Your request is analyzed by the Orchestrator and delegated to specialized agents who collaborate in real-time.
            </p>

            {/* Suggestion cards with agent badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
              {SUGGESTIONS.map((s) => {
                const meta = agentMeta[s.agent];
                return (
                  <button
                    key={s.text}
                    onClick={() => handleSend(s.text)}
                    className="flex items-start gap-3 px-4 py-3 rounded-2xl text-left transition-all duration-200 group"
                    style={{
                      backgroundColor: "var(--bg-raised)",
                      border: "1px solid var(--border-muted)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                      e.currentTarget.style.borderColor = `color-mix(in srgb, ${meta?.color || "var(--brand)"} 30%, transparent)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-raised)";
                      e.currentTarget.style.borderColor = "var(--border-muted)";
                    }}
                  >
                    <span className="text-lg mt-0.5">{s.icon}</span>
                    <div>
                      <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{s.text}</div>
                      <div className="text-[10px] mt-1 font-medium" style={{ color: meta?.color || "var(--text-faint)" }}>
                        → {meta?.label || s.agent} Agent
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const meta = msg.agent_name ? agentMeta[msg.agent_name.toLowerCase()] : null;
                return (
                  <motion.div
                    key={`${msg.id}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role !== "user" && (
                      <div
                        className="agent-avatar agent-avatar--sm flex-shrink-0 mr-3 mt-0.5"
                        style={{
                          backgroundColor: meta
                            ? `color-mix(in srgb, ${meta.color} 25%, var(--bg-panel))`
                            : "var(--bg-elevated)",
                          border: meta
                            ? `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`
                            : "1px solid var(--border-muted)",
                        }}
                      >
                        <span style={{ fontSize: "10px" }}>{meta?.icon || "🤖"}</span>
                      </div>
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
                      {/* Agent badge */}
                      {msg.role === "agent" && msg.agent_name && (
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="agent-badge"
                            style={{ "--agent-color": meta?.color || "var(--brand)" } as React.CSSProperties}
                          >
                            <span className="badge-dot" />
                            {meta?.label || msg.agent_name} Agent
                          </span>
                          {msg.contributing_agents && msg.contributing_agents.length > 0 && (
                            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                              with {msg.contributing_agents.map(a => agentMeta[a]?.label || a).join(", ")}
                            </span>
                          )}
                          {msg.pipeline_duration_ms && (
                            <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                              {(msg.pipeline_duration_ms / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                      )}
                      {msg.role === "user"
                        ? <span className="break-words">{msg.content}</span>
                        : <MarkdownRenderer content={msg.content} />
                      }
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Tool activity */}
            {toolActivity && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 ml-10">
                <div
                  className="tool-pill tool-pill--active"
                >
                  {toolActivity.status === "calling" ? (
                    <div
                      className="w-3 h-3 border-[1.5px] rounded-full"
                      style={{ borderColor: "var(--brand-dim)", borderTopColor: "var(--brand)", animation: "spinSlow 0.8s linear infinite" }}
                    />
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  <span>{toolActivity.status === "calling" ? `Using ${toolActivity.tool}…` : `${toolActivity.tool} done`}</span>
                  {toolActivity.duration_ms && (
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                      {(toolActivity.duration_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              </motion.div>
            )}

            {/* Thinking indicator */}
            {isThinking && !toolActivity && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 ml-10">
                <div className="flex items-center gap-2.5">
                  {(() => {
                    const meta = agentMeta[thinkingAgent?.toLowerCase()];
                    return (
                      <div
                        className="agent-avatar agent-avatar--sm"
                        style={{
                          backgroundColor: meta
                            ? `color-mix(in srgb, ${meta.color} 25%, var(--bg-panel))`
                            : "var(--bg-elevated)",
                          border: meta
                            ? `1px solid color-mix(in srgb, ${meta.color} 35%, transparent)`
                            : "1px solid var(--border-muted)",
                        }}
                      >
                        <div className="flex gap-0.5">
                          {[0, 1, 2].map(i => (
                            <span
                              key={i}
                              className="w-[3px] h-[3px] rounded-full animate-bounce"
                              style={{
                                backgroundColor: meta?.color || "var(--brand)",
                                animationDelay: `${i * 150}ms`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {thinkingPhase === "planning" && "Orchestrator is analyzing your request..."}
                    {thinkingPhase === "synthesizing" && "Orchestrator is combining agent results..."}
                    {thinkingPhase === "executing" && `${agentMeta[thinkingAgent?.toLowerCase()]?.label || thinkingAgent} is working...`}
                    {!thinkingPhase && `${agentMeta[thinkingAgent?.toLowerCase()]?.label || thinkingAgent || "Agent"} is thinking…`}
                  </span>
                </div>
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

      {/* Input bar */}
      <div className="px-4 pb-5 pt-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div
            className="relative flex items-end gap-2 rounded-2xl px-4 py-3 transition-all duration-200"
            style={{
              backgroundColor: "var(--input-bg)",
              border: "1px solid var(--input-border)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "var(--input-border-focus)";
              el.style.backgroundColor = "var(--input-bg-focus)";
              el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.15), 0 0 0 3px var(--brand-dim)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "var(--input-border)";
              el.style.backgroundColor = "var(--input-bg)";
              el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.15)";
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
              placeholder="Ask your multi-agent team anything…"
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
            Orchestrator routes your request to specialized agents who collaborate in real-time.
          </p>
        </div>
      </div>
    </div>
  );
}
