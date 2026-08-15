"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { getSessionId } from "@/lib/session";
import { getAuthHeaders } from "@/lib/auth";
import { agentMeta } from "@/components/agents/AgentCard";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { ExportMenu } from "./ExportMenu";
import { PromptTemplates } from "./PromptTemplates";

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
  feedback?: "up" | "down" | null;
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
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

const SUGGESTIONS = [
  { text: "Research the latest AI breakthroughs", agent: "research" },
  { text: "Write a Python web scraper", agent: "coding" },
  { text: "Draft a professional email", agent: "writer" },
  { text: "Analyze trends in tech industry", agent: "data" },
];


// ── File upload constants ─────────────────────────────────────
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_FILES = 5;

const CODE_EXTENSIONS: Record<string, string> = {
  ".py": "python", ".js": "javascript", ".ts": "typescript", ".tsx": "tsx", ".jsx": "jsx",
  ".css": "css", ".html": "html", ".json": "json", ".yml": "yaml", ".yaml": "yaml",
  ".md": "markdown", ".sql": "sql", ".sh": "bash", ".go": "go", ".rs": "rust",
  ".java": "java", ".c": "c", ".cpp": "cpp", ".h": "c",
};
const TEXT_EXTENSIONS = [".txt", ".csv", ".log", ".xml", ".env"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
const DOCUMENT_EXTENSIONS = [".pdf"];
const ALL_ACCEPT = [
  ...Object.keys(CODE_EXTENSIONS), ...TEXT_EXTENSIONS,
  ...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS,
].join(",");

interface AttachedFile {
  id: string;
  name: string;
  size: number;
  type: "code" | "text" | "image" | "document";
  lang?: string;
  content: string;      // text content, or base64 data URL for images/documents
  preview?: string;     // base64 data URL for image thumbnails
  mimeType?: string;    // MIME type for binary files
}

function getFileCategory(name: string): { type: AttachedFile["type"]; lang?: string } {
  const ext = "." + name.split(".").pop()?.toLowerCase();
  if (CODE_EXTENSIONS[ext]) return { type: "code", lang: CODE_EXTENSIONS[ext] };
  if (IMAGE_EXTENSIONS.includes(ext)) return { type: "image" };
  if (DOCUMENT_EXTENSIONS.includes(ext)) return { type: "document" };
  return { type: "text" };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fileTypeIcon(type: AttachedFile["type"]): string {
  if (type === "image") return "IMG";
  if (type === "document") return "DOC";
  if (type === "code") return "</>";
  return "FILE";
}

async function readFile(file: File): Promise<AttachedFile> {
  const cat = getFileCategory(file.name);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Images and documents (PDF) — read as base64 data URL
  if (cat.type === "image" || cat.type === "document") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const isImage = cat.type === "image";
        resolve({
          id, name: file.name, size: file.size, type: cat.type,
          content: `[${isImage ? "Image" : "Document"}: ${file.name}]`,
          preview: dataUrl,  // base64 data URL for both images and documents
          mimeType: file.type || (cat.type === "document" ? "application/pdf" : undefined),
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Text and code files — read as text
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({ id, name: file.name, size: file.size, type: cat.type, lang: cat.lang, content: reader.result as string });
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function ChatPanel({ conversationId, onConversationCreated, onMessageSent, onPipelineUpdate, inputRef: externalInputRef }: ChatPanelProps) {
  const [inputExpanded, setInputExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const streamingMessageRef = useRef<{ agent: string; content: string; id: number } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false); // guard against double-start race conditions

  // ── Robust mic cleanup ────────────────────────────────────────────────
  // This is the ONE function that releases everything. Every code path
  // (manual stop, onend, onerror, component unmount, send) calls this.
  const forceReleaseMic = useCallback(() => {
    // Track whether we were actually recording before cleanup
    const wasRecording = isRecordingRef.current || !!recognitionRef.current;

    // 1. Stop recognition FIRST
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* swallow */ }
      try { recognitionRef.current.stop(); } catch { /* swallow */ }
      recognitionRef.current = null;
    }
    // 2. Stop every track on our owned stream (if any)
    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach(t => {
          t.stop();
          t.enabled = false;
        });
      } catch { /* swallow */ }
      micStreamRef.current = null;
    }
    // 3. Reset state
    isRecordingRef.current = false;
    setIsRecording(false);

    // 4. Safari workaround: only when user was ACTUALLY recording.
    //    Safari's SpeechRecognition holds an internal mic session that
    //    persists after .stop()/.abort(). Acquiring a fresh stream and
    //    immediately stopping it resets Safari's audio session.
    //    We must NOT do this on unmount/navigation or it triggers a
    //    mic permission prompt for no reason.
    if (wasRecording && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(resetStream => {
          resetStream.getTracks().forEach(t => {
            t.stop();
            t.enabled = false;
          });
        })
        .catch(() => { /* permission denied or unavailable — fine */ });
    }
  }, []);

  // Cleanup on unmount — guarantees mic is always released
  useEffect(() => {
    return () => {
      forceReleaseMic();
    };
  }, [forceReleaseMic]);

  const toggleRecording = async () => {
    // ── STOP ─────────────────────────────────────────────────────────────
    if (isRecording || isRecordingRef.current) {
      forceReleaseMic();
      return;
    }

    // ── START ────────────────────────────────────────────────────────────
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    // Prevent double-start
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    // Check mic permission with a quick getUserMedia — then immediately stop
    // the stream. SpeechRecognition manages its own mic session internally;
    // keeping a separate getUserMedia stream causes Safari to show the mic
    // as permanently active (two sessions, only one gets closed).
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately release — we only needed to check permission
      testStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
    } catch (err) {
      console.warn("Mic permission denied:", err);
      isRecordingRef.current = false;
      alert("Microphone access is required for voice input. Please allow microphone access in your browser settings.");
      return;
    }

    let finalTranscript = input;
    let lastInterim = "";
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let maxTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (maxTimer) { clearTimeout(maxTimer); maxTimer = null; }
    };

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // Don't stop on first pause
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    // Reset silence timer on every result
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        // 5s of silence → auto-stop
        try { recognition.stop(); } catch { /* already stopped */ }
      }, 5000);
    };

    recognition.onresult = (event: any) => {
      resetSilenceTimer();

      let interimChunk = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalChunk += transcript;
        } else {
          interimChunk += transcript;
        }
      }

      if (finalChunk) {
        const sep = finalTranscript && !finalTranscript.endsWith(" ") ? " " : "";
        finalTranscript += sep + finalChunk;
      }
      lastInterim = interimChunk;

      // Show combined text in the input box
      const sep = finalTranscript && !finalTranscript.endsWith(" ") && lastInterim ? " " : "";
      setInput(finalTranscript + sep + lastInterim);
    };

    recognition.onerror = (event: any) => {
      console.warn("SpeechRecognition error:", event.error);
      clearTimers();
      // "no-speech" is harmless — user just didn't say anything
      if (event.error === "no-speech" || event.error === "aborted") {
        // Keep whatever text we have
      } else {
        // Actual error (network, not-allowed, etc.)
        console.error("Speech recognition failed:", event.error);
      }
      // Commit interim text if we have it
      if (lastInterim) {
        const sep = finalTranscript && !finalTranscript.endsWith(" ") ? " " : "";
        setInput(finalTranscript + sep + lastInterim);
      }
      forceReleaseMic();
    };

    recognition.onend = () => {
      clearTimers();
      // Commit any remaining interim text as final
      if (lastInterim) {
        const sep = finalTranscript && !finalTranscript.endsWith(" ") ? " " : "";
        finalTranscript += sep + lastInterim;
        lastInterim = "";
        setInput(finalTranscript);
      }
      forceReleaseMic();
    };

    // Safety: max 60 seconds recording
    maxTimer = setTimeout(() => {
      try { recognition.stop(); } catch { /* already stopped */ }
    }, 60000);

    // Start initial silence timer
    resetSilenceTimer();

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recognition:", err);
      clearTimers();
      forceReleaseMic();
    }
  };
  const [thinkingAgent, setThinkingAgent] = useState<string>("");
  const [thinkingPhase, setThinkingPhase] = useState<string>("");
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Notifications
  const { addNotification } = useNotifications();
  const notifyRef = useRef(addNotification);
  notifyRef.current = addNotification;

  // Pipeline state
  const pipelineAgentsRef = useRef<PipelineAgent[]>([]);
  const delegationsRef = useRef<DelegationEvent[]>([]);
  const toolEventsRef = useRef<ToolEvent[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync external ref (for keyboard shortcuts from parent)
  useEffect(() => {
    if (externalInputRef && inputRef.current) {
      (externalInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = inputRef.current;
    }
  });
  const inputBarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingAgentRef = useRef("");
  const pendingMessageRef = useRef<string | null>(null);
  const pendingAttachmentsRef = useRef<Array<{name: string; type: string; data: string}>>([]);
  const skipNextLoadRef = useRef(false);
  const dragCounterRef = useRef(0);


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

  // ── Mobile keyboard fix: keep input bar visible ──────────────────────
  // When the virtual keyboard opens on mobile, the layout viewport doesn't
  // shrink on all browsers. We listen to visualViewport resize events to
  // detect the keyboard and push the input bar up using a CSS translate.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const onResize = () => {
      // The difference between window.innerHeight and visualViewport.height
      // is the space taken by the keyboard.
      const keyboardHeight = window.innerHeight - vv.height;
      const bar = inputBarRef.current;
      if (bar) {
        if (keyboardHeight > 100) {
          // Keyboard is open — lift the input bar above it
          bar.style.transform = `translateY(-${keyboardHeight}px)`;
          bar.style.transition = "transform 0.15s ease-out";
          // Scroll messages to bottom so user sees latest
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
          });
        } else {
          // Keyboard is closed
          bar.style.transform = "";
          bar.style.transition = "transform 0.15s ease-out";
        }
      }
    };

    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  // When the textarea is focused on mobile, scroll the input into view
  // after a short delay to let the keyboard finish animating.
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const onFocus = () => {
      setTimeout(() => {
        inputBarRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 350);
    };
    ta.addEventListener("focus", onFocus);
    return () => ta.removeEventListener("focus", onFocus);
  }, []);

  // Load conversation messages
  useEffect(() => {
    if (!conversationId) { setMessages([]); return; }
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }

    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations/${conversationId}`, {
          headers: getAuthHeaders(),
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

  // Keep all callbacks in a ref so WS handlers always use the latest version
  // without needing to recreate the WebSocket on every render.
  const callbacksRef = useRef({ onMessageSent, emitPipeline, resetPipeline, updateAgent });
  useEffect(() => {
    callbacksRef.current = { onMessageSent, emitPipeline, resetPipeline, updateAgent };
  });

  // WebSocket connection — only re-runs when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      setWsConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

      ws = new WebSocket(`${WS_BASE}/api/v1/chat/ws/${conversationId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (destroyed || wsRef.current !== ws) return;
        setWsConnected(true);
        setError(null);
        if (pingInterval) clearInterval(pingInterval);
        pingInterval = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
        }, 30000);
        // Send any pending message immediately — this ref survives re-renders
        if (pendingMessageRef.current) {
          // Include any pending attachments
          const msg: Record<string, unknown> = { type: "message", content: pendingMessageRef.current };
          if (pendingAttachmentsRef.current.length > 0) {
            msg.attachments = pendingAttachmentsRef.current;
            pendingAttachmentsRef.current = [];
          }
          ws!.send(JSON.stringify(msg));
          pendingMessageRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        if (destroyed || wsRef.current !== ws) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data: any;
        try { data = JSON.parse(event.data); } catch { return; }
        // Always read latest callbacks from ref — never stale
        const cb = callbacksRef.current;

        switch (data.type) {
          case "pipeline_start":
            cb.resetPipeline();
            cb.emitPipeline(true);
            break;

          case "agent_activated":
            cb.updateAgent(data.agent, { status: "activated", task: data.task, startTime: Date.now() });
            break;

          case "delegation":
            delegationsRef.current = [
              ...delegationsRef.current,
              { from: data.from, to: data.to, reason: data.reason, timestamp: Date.now() },
            ];
            cb.emitPipeline(true);
            break;

          case "thinking":
            setIsThinking(true);
            setThinkingAgent(data.agent || "orchestrator");
            thinkingAgentRef.current = data.agent || "orchestrator";
            setThinkingPhase(data.phase || "");
            cb.updateAgent(data.agent || "orchestrator", {
              status: "thinking",
              phase: data.phase,
              startTime: pipelineAgentsRef.current.find(a => a.name === (data.agent || "orchestrator"))?.startTime || Date.now(),
            });
            break;

          case "tool_call":
            setToolActivity({ tool: data.tool, status: "calling", agent: data.agent, args: data.args });
            cb.updateAgent(data.agent || thinkingAgentRef.current, {
              status: "tool_call", toolName: data.tool, toolArgs: data.args,
            });
            toolEventsRef.current = [
              ...toolEventsRef.current,
              { agent: data.agent || thinkingAgentRef.current, tool: data.tool, status: "calling", timestamp: Date.now() },
            ];
            cb.emitPipeline(true);
            break;

          case "tool_result": {
            setToolActivity({ tool: data.tool, status: "done", agent: data.agent, result: data.result, duration_ms: data.duration_ms });
            const toolIdx = toolEventsRef.current.findLastIndex(t => t.tool === data.tool && t.status === "calling");
            if (toolIdx >= 0) {
              toolEventsRef.current[toolIdx] = { ...toolEventsRef.current[toolIdx], status: "done", durationMs: data.duration_ms, result: data.result };
            }
            cb.updateAgent(data.agent || thinkingAgentRef.current, { status: "thinking", toolName: undefined, toolArgs: undefined });
            setTimeout(() => setToolActivity(null), 800);
            break;
          }

          case "agent_complete":
            cb.updateAgent(data.agent, { status: "complete", durationMs: data.duration_ms, summary: data.summary, toolName: undefined, toolArgs: undefined });
            break;

          case "synthesis_start":
            cb.updateAgent("orchestrator", { status: "thinking", phase: "synthesizing", startTime: Date.now() });
            break;

          case "pipeline_complete":
            setIsThinking(false);
            setToolActivity(null);
            setThinkingAgent("");
            thinkingAgentRef.current = "";
            setThinkingPhase("");
            // Mark all remaining active agents as complete
            pipelineAgentsRef.current = pipelineAgentsRef.current.map(a =>
              ["activated", "thinking", "tool_call"].includes(a.status)
                ? { ...a, status: "complete" as const, toolName: undefined, toolArgs: undefined }
                : a
            );
            cb.emitPipeline(false, data.total_duration_ms, data.agents_used);
            // Fire notification
            if (notifyRef.current) {
              const dur = data.total_duration_ms ? `${(data.total_duration_ms / 1000).toFixed(1)}s` : "";
              notifyRef.current({
                type: "agent-complete",
                title: "Pipeline Complete",
                message: `${data.agents_used || 1} agent${(data.agents_used || 1) > 1 ? "s" : ""} finished${dur ? ` in ${dur}` : ""}`,
                conversationId: conversationId || undefined,
              });
            }
            break;

          case "response":
            setIsThinking(false);
            setToolActivity(null);
            setThinkingAgent("");
            thinkingAgentRef.current = "";
            setThinkingPhase("");
            if (streamingMessageRef.current) {
              // A streaming message already exists — replace it with the final version
              const streamId = streamingMessageRef.current.id;
              streamingMessageRef.current = null;
              if (data.message) {
                setMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...data.message, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms } : m
                ));
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, id: data.message?.id || m.id, content: data.content, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms } : m
                ));
              }
            } else if (data.message) {
              setMessages(prev => [...prev, { ...data.message, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms }]);
            } else {
              setMessages(prev => [...prev, { id: Date.now(), role: "agent", agent_name: data.agent, content: data.content, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms }]);
            }
            cb.onMessageSent();
            break;

          case "message_saved":
            break;

          case "error":
            setIsThinking(false);
            setToolActivity(null);
            setError(data.content);
            setMessages(prev => [...prev, { id: Date.now(), role: "system", content: `${data.content}` }]);
            cb.emitPipeline(false);
            // Fire error notification
            if (notifyRef.current) {
              notifyRef.current({
                type: "error",
                title: "Error",
                message: data.content?.slice(0, 120),
              });
            }
            break;

          case "pong":
            break;

          case "stream_start":
            // Begin accumulating a streaming response
            streamingMessageRef.current = {
              agent: data.agent || "orchestrator",
              content: "",
              id: Date.now(),
            };
            // Add a placeholder message
            setMessages(prev => [...prev, {
              id: streamingMessageRef.current!.id,
              role: "agent" as const,
              agent_name: data.agent || "orchestrator",
              content: "",
            }]);
            break;

          case "stream_token":
            if (streamingMessageRef.current) {
              streamingMessageRef.current.content += data.token;
              const currentContent = streamingMessageRef.current.content;
              const currentId = streamingMessageRef.current.id;
              setMessages(prev => prev.map(m =>
                m.id === currentId ? { ...m, content: currentContent } : m
              ));
            }
            break;

          case "stream_end":
            // Don't clear streamingMessageRef here — the "response" handler
            // needs it to replace the streamed placeholder with the final message.
            break;
        }
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        if (destroyed || wsRef.current !== ws) return;
        setWsConnected(false);
        setIsThinking(false);
        setToolActivity(null);
        // Reconnect after 3s using the stable `connect` function from this effect's scope
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        if (destroyed || wsRef.current !== ws) return;
        setWsConnected(false);
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // ── File handling ───────────────────────────────────────────
  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const remaining = MAX_FILES - attachedFiles.length;
    if (remaining <= 0) {
      setError(`Maximum ${MAX_FILES} files allowed per message.`);
      return;
    }
    const toProcess = fileArray.slice(0, remaining);
    if (fileArray.length > remaining) {
      setError(`Only ${remaining} more file(s) can be attached. Some files were skipped.`);
    }

    for (const file of toProcess) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`"${file.name}" exceeds the ${formatFileSize(MAX_FILE_SIZE)} limit (${formatFileSize(file.size)}).`);
        continue;
      }
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
      const isSupported = [...Object.keys(CODE_EXTENSIONS), ...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS].includes(ext);
      if (!isSupported) {
        setError(`"${file.name}" is not a supported file type.`);
        continue;
      }
      try {
        const attached = await readFile(file);
        setAttachedFiles(prev => [...prev, attached]);
      } catch {
        setError(`Failed to read "${file.name}".`);
      }
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const buildMessageWithFiles = (text: string, files: AttachedFile[]): string => {
    if (files.length === 0) return text;
    const fileParts = files.map(f => {
      if (f.type === "image") return `[Attached image: ${f.name}]`;
      if (f.type === "document") return `[Attached document: ${f.name}]`;
      if (f.type === "code") return `[File: ${f.name}]\n\`\`\`${f.lang || ""}\n${f.content}\n\`\`\``;
      return `[File: ${f.name}]\n${f.content}`;
    });
    return `${text}\n\n${fileParts.join("\n\n")}`;
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
  };

  // Clipboard paste handler for images
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      processFiles(imageFiles);
    }
  };

  // ── Camera handlers ────────────────────────────────────────
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Attach stream to video element after render
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setError("Camera access denied. Please allow camera permissions.");
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  };



  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/png");
    const id = `cam-${Date.now()}`;
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false }).replace(/:/g, "-");
    const fileName = `camera-${timestamp}.png`;
    // Estimate size from base64
    const sizeEstimate = Math.round((dataUrl.length * 3) / 4);
    setAttachedFiles(prev => [...prev, {
      id, name: fileName, size: sizeEstimate, type: "image",
      content: `[Image: ${fileName}]`, preview: dataUrl,
    }]);
    closeCamera();
  };

  const handleSend = async (text?: string) => {
    const rawContent = (text || input).trim();
    const filesToSend = [...attachedFiles];
    
    // Stop recording if active
    if (isRecording || isRecordingRef.current) {
      forceReleaseMic();
    }
    
    const content = buildMessageWithFiles(rawContent, filesToSend);
    // Build this before creating a conversation. The WebSocket commonly opens
    // after the conversation is created; keeping attachments in the pending
    // refs ensures a new-chat upload is not silently sent as filename only.
    const binaryAttachments = filesToSend
      .filter(f => (f.type === "image" || f.type === "document") && f.preview)
      .map(f => ({ name: f.name, type: f.type, data: f.preview!, mimeType: f.mimeType }));
    if ((!rawContent && filesToSend.length === 0) || isThinking) return;
    setInput("");
    setAttachedFiles([]);
    setError(null);
    resetPipeline();

    let activeConvId = conversationId;

    if (!activeConvId) {
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ title: content.slice(0, 80) }),
        });
        const conv = await res.json();
        activeConvId = conv.id;
        pendingMessageRef.current = content;
        pendingAttachmentsRef.current = binaryAttachments;
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
      const msg: Record<string, unknown> = { type: "message", content };
      if (binaryAttachments.length > 0) msg.attachments = binaryAttachments;
      wsRef.current.send(JSON.stringify(msg));
    } else if (!pendingMessageRef.current && wsRef.current?.readyState === WebSocket.CONNECTING) {
      pendingMessageRef.current = content;
      pendingAttachmentsRef.current = binaryAttachments;
    } else if (!pendingMessageRef.current) {
      setError("Not connected. Reconnecting...");
      if (activeConvId) {
        pendingMessageRef.current = content;
        pendingAttachmentsRef.current = binaryAttachments;
        if (wsRef.current) { wsRef.current.close(); }
      }
    }
  };

  const isEmpty = messages.length === 0 && !isThinking;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Top bar with active agent indicators */}
      <div
        className="flex items-center justify-between px-3 md:px-5 h-11 md:h-12 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="relative z-10">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.2" opacity="0.5"/>
              <circle cx="12" cy="12" r="5.5" stroke="white" strokeWidth="0.8" opacity="0.4"/>
              <line x1="12" y1="2" x2="12" y2="22" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              <line x1="2" y1="12" x2="22" y2="12" stroke="white" strokeWidth="0.8" opacity="0.6"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="white" strokeWidth="0.8" opacity="0.5"/>
              <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" stroke="white" strokeWidth="0.8" opacity="0.5"/>
              <circle cx="12" cy="12" r="1.8" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>AgentVerse</span>

          {/* Active agents mini bar */}
          {activeAgents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 ml-2 px-2.5 py-1 rounded-xl"
              style={{
                backgroundColor: "var(--brand-dim)",
                border: "1px solid color-mix(in srgb, var(--brand) 10%, transparent)",
              }}
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
                      backgroundColor: `color-mix(in srgb, ${meta?.color || "var(--brand)"} 20%, transparent)`,
                      fontSize: "8px",
                    }}
                    title={`${meta?.label || name} active`}
                  >
                    {meta?.icon || "?"}
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all duration-300"
            style={{
              backgroundColor: wsConnected ? "var(--green-dim)" : "var(--red-dim)",
              color: wsConnected ? "var(--green)" : "var(--red)",
              border: `1px solid color-mix(in srgb, ${wsConnected ? "var(--green)" : "var(--red)"} 15%, transparent)`,
            }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!wsConnected && "animate-pulse"}`}
              style={{
                backgroundColor: wsConnected ? "var(--green)" : "var(--red)",
                boxShadow: `0 0 4px ${wsConnected ? "var(--green)" : "var(--red)"}`,
              }}
            />
            {wsConnected ? "Connected" : "Reconnecting…"}
          </div>
        ) : (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium"
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
          <div className="flex flex-col items-center justify-center h-full px-4 md:px-6 pb-4 md:pb-8 relative">
            {/* Ambient gradient orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div
                className="absolute w-64 h-64 rounded-full"
                style={{
                  top: "15%",
                  left: "20%",
                  background: "radial-gradient(circle, rgba(99,102,241,0.10), transparent 70%)",
                  animation: "floatParticle 8s ease-in-out infinite",
                }}
              />
              <div
                className="absolute w-48 h-48 rounded-full"
                style={{
                  bottom: "20%",
                  right: "15%",
                  background: "radial-gradient(circle, rgba(139,92,246,0.08), transparent 70%)",
                  animation: "floatParticle 10s ease-in-out 2s infinite",
                }}
              />
              <div
                className="absolute w-32 h-32 rounded-full"
                style={{
                  top: "40%",
                  right: "30%",
                  background: "radial-gradient(circle, rgba(6,182,212,0.06), transparent 70%)",
                  animation: "floatParticle 7s ease-in-out 4s infinite",
                }}
              />
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
              className="relative z-10"
            >
              <div
                className="w-18 h-18 rounded-3xl flex items-center justify-center mb-6 mx-auto relative overflow-hidden"
                style={{
                  width: "72px",
                  height: "72px",
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #06b6d4 100%)",
                  backgroundSize: "200% 200%",
                  animation: "gradientShift 4s ease-in-out infinite",
                  boxShadow: "0 12px 48px rgba(99,102,241,0.35), 0 0 80px rgba(139,92,246,0.15)",
                }}
              >
                <span className="text-3xl relative z-10">✦</span>
                <div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)",
                    backgroundSize: "200% 100%",
                    animation: "shine 3s ease-in-out infinite",
                  }}
                />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="text-xl md:text-2xl font-bold mb-2 text-center gradient-text relative z-10"
            >
              Multi-Agent AI Workforce
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              className="text-xs md:text-sm mb-4 md:mb-8 text-center max-w-md relative z-10"
              style={{ color: "var(--text-muted)" }}
            >
              Your request is analyzed by the Orchestrator and delegated to specialized agents who collaborate in real-time.
            </motion.p>

            {/* Suggestion cards with agent badges */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 max-w-md w-full px-2 relative z-10">
              {SUGGESTIONS.map((s, i) => {
                const meta = agentMeta[s.agent];
                return (
                  <motion.button
                    key={s.text}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.4 }}
                    onClick={() => handleSend(s.text)}
                    className="flex items-start gap-3 px-4 py-3.5 rounded-2xl text-left transition-all duration-300 group relative overflow-hidden"
                    style={{
                      background: "var(--glass-bg)",
                      backdropFilter: "blur(16px) saturate(1.2)",
                      WebkitBackdropFilter: "blur(16px) saturate(1.2)",
                      border: "1px solid var(--glass-border)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--bg-elevated)";
                      e.currentTarget.style.borderColor = `color-mix(in srgb, ${meta?.color || "var(--brand)"} 30%, transparent)`;
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.12), 0 0 30px -10px color-mix(in srgb, ${meta?.color || "var(--brand)"} 20%, transparent)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "var(--glass-bg)";
                      e.currentTarget.style.borderColor = "var(--glass-border)";
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <span className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5" style={{ backgroundColor: `color-mix(in srgb, ${meta?.color || 'var(--brand)'} 15%, transparent)`, color: meta?.color || 'var(--brand)' }}>
                      {meta?.icon || <span className="text-sm font-bold">{s.agent[0].toUpperCase()}</span>}
                    </span>
                    <div>
                      <div className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{s.text}</div>
                      <div className="text-[10px] mt-1.5 font-semibold flex items-center gap-1" style={{ color: meta?.color || "var(--text-faint)" }}>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {meta?.label || s.agent} Agent
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Message list */
          <div className="w-full max-w-3xl mx-auto px-2 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg, idx) => {
                const meta = msg.agent_name ? agentMeta[msg.agent_name.toLowerCase()] : null;
                return (
                  <motion.div
                    key={`${msg.id}-${idx}`}
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role !== "user" && (
                      <div
                        className="agent-avatar agent-avatar--sm flex-shrink-0 mr-3 mt-0.5"
                        style={{
                          backgroundColor: meta
                            ? `color-mix(in srgb, ${meta.color} 20%, var(--bg-panel))`
                            : "var(--bg-elevated)",
                          border: meta
                            ? `1px solid color-mix(in srgb, ${meta.color} 30%, transparent)`
                            : "1px solid var(--border-muted)",
                        }}
                      >
                        <span style={{ fontSize: "10px" }}>{meta?.icon || "?"}</span>
                      </div>
                    )}

                    <div
                      className={`overflow-hidden ${
                        msg.role === "agent" && isThinking && idx === messages.length - 1
                          ? "gemini-gradient-border gemini-shimmer"
                          : ""
                      }`}
                      style={{
                        overflowWrap: "anywhere",
                        ...(msg.role === "user" ? {
                          maxWidth: "75%",
                          padding: "12px 16px",
                          borderRadius: "20px 20px 4px 20px",
                          background: "var(--bubble-user-bg)",
                          backdropFilter: "blur(12px)",
                          WebkitBackdropFilter: "blur(12px)",
                          color: "var(--bubble-user-text)",
                          fontSize: "14px",
                          lineHeight: "1.6",
                          border: "1px solid var(--bubble-user-border)",
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
                          paddingLeft: "12px",
                        }),
                      }}
                    >
                      {/* Agent badge */}
                      {msg.role === "agent" && msg.agent_name && (
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                        ? (() => {
                            // Strip file attachment blocks from display
                            const cleanContent = msg.content.replace(/(?:^|\n\n)\[(?:File|Attached image|Attached document): [^\]]+\](?:\n```[\s\S]*?```|\n[\s\S]*?(?=\n\n\[|$))?/g, "").trim();
                            const fileMatches = msg.content.match(/\[(?:File|Attached image|Attached document): ([^\]]+)\]/g) || [];
                            return (
                              <>
                                {cleanContent && <span className="break-words">{cleanContent}</span>}
                                {fileMatches.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {fileMatches.map((match, i) => {
                                      const fileName = match.replace(/\[(?:File|Attached image|Attached document): /, "").replace("]", "");
                                      const cat = getFileCategory(fileName);
                                      return (
                                        <span
                                          key={i}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
                                          style={{
                                            backgroundColor: "rgba(255,255,255,0.1)",
                                            color: "rgba(255,255,255,0.8)",
                                          }}
                                        >
                                          {fileTypeIcon(cat.type)} {fileName}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </>
                            );
                          })()
                        : (() => {
                            const hitlMatch = msg.content.match(/\[APPROVAL_REQUIRED:([^:]+):(.*?)\]/);
                            if (hitlMatch) {
                              const [fullMatch, action, reason] = hitlMatch;
                              const textBefore = msg.content.split(fullMatch)[0];
                              return (
                                <>
                                  {textBefore && <MarkdownRenderer content={textBefore} />}
                                  <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--bg-elevated)" }}>
                                    <div className="flex items-center gap-2 mb-2 text-yellow-500">
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                      <span className="font-bold">Approval Required</span>
                                    </div>
                                    <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
                                      <strong>Action:</strong> <span className="font-mono">{action}</span><br/>
                                      <strong>Reason:</strong> {reason}
                                    </p>
                                    <div className="flex gap-3">
                                      <button
                                        onClick={() => handleSend(`APPROVED action: ${action}`)}
                                        className="px-4 py-2 bg-green-500/20 text-green-500 hover:bg-green-500/30 rounded-lg text-sm font-semibold transition-colors"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleSend(`REJECTED action: ${action}`)}
                                        className="px-4 py-2 bg-red-500/20 text-red-500 hover:bg-red-500/30 rounded-lg text-sm font-semibold transition-colors"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  </div>
                                </>
                              );
                            }
                            const cleanedContent = msg.content.replace(/\[DOWNLOAD_LINK:[^\]]+\]/g, "").trim();
                            return <MarkdownRenderer content={cleanedContent} />;
                          })()
                      }

                      {/* Feedback buttons + download links for agent messages */}
                      {msg.role === "agent" && (
                        <div className="flex items-center gap-1 mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          {/* Download link detection */}
                          {msg.content.match(/\[DOWNLOAD_LINK:([^:]+):([^\]]+)\]/) && (() => {
                            const m = msg.content.match(/\[DOWNLOAD_LINK:([^:]+):([^\]]+)\]/);
                            if (!m) return null;
                            const [, fileId, fileName] = m;
                            return (
                              <a
                                href={`${API_URL}/api/v1/documents/download/${fileId}`}
                                download={fileName}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 mr-auto"
                                style={{
                                  backgroundColor: "var(--brand-dim)",
                                  color: "var(--brand)",
                                  border: "1px solid color-mix(in srgb, var(--brand) 20%, transparent)",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--brand) 20%, transparent)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--brand-dim)"; }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download {fileName}
                              </a>
                            );
                          })()}

                          {/* Thumbs up/down */}
                          <div className="flex items-center gap-0.5 ml-auto">
                            {(["up", "down"] as const).map(fb => (
                              <button
                                key={fb}
                                onClick={async () => {
                                  try {
                                    await fetch(`${API_URL}/api/v1/chat/messages/${msg.id}/feedback`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
                                      body: JSON.stringify({ feedback: fb }),
                                    });
                                    setMessages(prev => prev.map(m =>
                                      m.id === msg.id ? { ...m, feedback: fb } : m
                                    ));
                                  } catch { /* silently fail */ }
                                }}
                                className="p-1.5 rounded-lg transition-all duration-200"
                                style={{
                                  color: msg.feedback === fb
                                    ? fb === "up" ? "var(--green)" : "var(--red)"
                                    : "var(--text-faint)",
                                  backgroundColor: msg.feedback === fb
                                    ? fb === "up" ? "color-mix(in srgb, var(--green) 12%, transparent)" : "color-mix(in srgb, var(--red) 12%, transparent)"
                                    : "transparent",
                                }}
                                title={fb === "up" ? "Helpful" : "Not helpful"}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill={msg.feedback === fb ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                                  style={fb === "down" ? { transform: "rotate(180deg)" } : {}}
                                >
                                  <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Tool activity */}
            {toolActivity && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 ml-10">
                <div className="tool-pill tool-pill--active">
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

            {/* Thinking indicator — Gemini-style gradient shimmer */}
            {isThinking && !toolActivity && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 ml-10"
              >
                <div className="flex items-center gap-3">
                  {/* Agent icon with animated gradient background */}
                  {(() => {
                    const meta = agentMeta[thinkingAgent?.toLowerCase()];
                    return (
                      <div
                        className="relative overflow-hidden flex items-center justify-center"
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "10px",
                          background: meta?.color
                            ? `linear-gradient(135deg, ${meta.color}, color-mix(in srgb, ${meta.color} 60%, var(--aurora-3)))`
                            : "linear-gradient(135deg, var(--aurora-1), var(--aurora-2), var(--aurora-3), var(--aurora-4))",
                          backgroundSize: "300% 300%",
                          animation: "gradientShift 2s ease-in-out infinite",
                          boxShadow: `0 0 14px ${meta?.color || "rgba(99,102,241,0.3)"}60`,
                        }}
                      >
                        <span className="relative z-10" style={{ fontSize: "14px" }}>
                          {meta?.icon || "?"}
                        </span>
                        <div
                          className="absolute inset-0"
                          style={{
                            background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
                            backgroundSize: "200% 100%",
                            animation: "shine 1.5s ease-in-out infinite",
                          }}
                        />
                      </div>
                    );
                  })()}
                  <span className="text-xs font-medium gradient-text">
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
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto px-4 py-2.5 rounded-xl text-xs flex items-center justify-between"
            style={{
              backgroundColor: "var(--red-dim)",
              border: "1px solid color-mix(in srgb, var(--red) 20%, transparent)",
              color: "var(--red)",
            }}
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3 transition-colors hover:opacity-70">✕</button>
          </motion.div>
        </div>
      )}

      {/* Input bar */}
      <div
        ref={inputBarRef}
        className="px-2 md:px-4 pb-3 md:pb-5 pt-2 flex-shrink-0 input-safe-area"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="w-full max-w-3xl mx-auto">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALL_ACCEPT}
            className="hidden"
            onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}
          />

          {/* Export + Templates row */}
          <div className="flex items-center justify-between px-2 mb-1">
            <div className="flex items-center gap-1">
              <ExportMenu messages={messages} />
            </div>
          </div>

          <div
            className="relative rounded-2xl transition-all duration-300 overflow-hidden"
            style={{
              background: "var(--input-bg)",
              backdropFilter: "blur(24px) saturate(1.4)",
              WebkitBackdropFilter: "blur(24px) saturate(1.4)",
              border: "1px solid var(--input-border)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
            }}
            onFocusCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.animation = "auroraBorder 3s ease-in-out infinite";
              el.style.background = "var(--input-bg-focus)";
            }}
            onBlurCapture={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.animation = "none";
              el.style.borderColor = "var(--input-border)";
              el.style.background = "var(--input-bg)";
              el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.12)";
            }}
          >
            {/* Drag overlay */}
            {isDragging && (
              <div className="drop-zone-overlay">
                <span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L8 8m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Drop files here
                </span>
              </div>
            )}

            {/* File preview chips */}
            {attachedFiles.length > 0 && (
              <div className="file-chips">
                {attachedFiles.map((file) => (
                  <div key={file.id} className={`file-chip ${file.type === "image" ? "file-chip--image" : ""}`}>
                    {file.type === "image" && file.preview ? (
                      <img src={file.preview} alt={file.name} className="file-chip__preview" />
                    ) : (
                      <span className="file-chip__icon">{fileTypeIcon(file.type)}</span>
                    )}
                    <span className="file-chip__name">{file.name}</span>
                    <span className="file-chip__size">{formatFileSize(file.size)}</span>
                    <button className="file-chip__remove" onClick={() => removeFile(file.id)} title="Remove">✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3">
              {/* Upload button — always visible */}
              <button
                className="upload-btn"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files (images, code, documents)"
                disabled={isThinking}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Expand button — mobile only, shows camera/mic */}
              <button
                className="upload-btn input-expand-btn"
                onClick={() => setInputExpanded(!inputExpanded)}
                title="More actions"
                disabled={isThinking}
                style={{
                  display: "none", // CSS overrides to flex on mobile
                  ...(inputExpanded ? { color: "var(--brand)", backgroundColor: "var(--brand-dim)" } : {}),
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: inputExpanded ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Camera button — hidden on mobile unless expanded */}
              <button
                className={`upload-btn ${inputExpanded ? '' : 'input-secondary-actions'}`}
                onClick={openCamera}
                title="Take a photo"
                disabled={isThinking}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
              
              {/* Voice recording button — hidden on mobile unless expanded */}
              <button
                className={`upload-btn ${inputExpanded ? '' : 'input-secondary-actions'} ${isRecording ? 'text-red-500 animate-pulse' : ''}`}
                onClick={toggleRecording}
                title="Voice dictation"
                disabled={isThinking}
                style={isRecording ? { color: "var(--red)", backgroundColor: "color-mix(in srgb, var(--red) 15%, transparent)" } : {}}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Template button */}
              <button
                className={`upload-btn ${inputExpanded ? '' : 'input-secondary-actions'}`}
                onClick={() => setShowTemplates(!showTemplates)}
                title="Prompt templates"
                disabled={isThinking}
                style={showTemplates ? { color: "var(--brand)", backgroundColor: "var(--brand-dim)" } : {}}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M4 5h16M4 5v14a2 2 0 002 2h12a2 2 0 002-2V5M10 10h4M10 14h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

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
                onPaste={handlePaste}
                placeholder={attachedFiles.length > 0 ? "Add a message about your files…" : "Ask your multi-agent team anything…"}
                rows={1}
                className="flex-1 bg-transparent text-sm outline-none resize-none leading-6 max-h-[180px] overflow-y-auto"
                style={{ color: "var(--text-primary)" }}
                disabled={isThinking}
              />
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && attachedFiles.length === 0) || isThinking}
                className="send-btn flex-shrink-0"
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
          </div>

          {/* Prompt Templates Panel */}
          <AnimatePresence>
            {showTemplates && (
              <PromptTemplates
                onInsert={(prompt) => setInput(prompt)}
                onClose={() => setShowTemplates(false)}
              />
            )}
          </AnimatePresence>

          <p className="text-center text-[10px] mt-2.5 font-medium" style={{ color: "var(--text-faint)" }}>
            AgentVerse routes your request to specialized agents who collaborate in real-time.
          </p>
        </div>
      </div>

      {/* Camera modal */}
      {cameraOpen && (
        <div className="camera-modal">
          <div className="camera-modal__inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-modal__video"
            />
            <div className="camera-modal__controls">
              <button className="camera-modal__close" onClick={closeCamera} title="Cancel">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <button className="camera-modal__capture" onClick={capturePhoto} title="Capture">
                <div className="camera-modal__capture-ring" />
              </button>
              <div style={{ width: 44 }} />{/* Spacer for centering */}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
