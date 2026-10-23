"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessageData as Message } from "@/lib/chat-message";
import { getSessionId } from "@/lib/session";
import { getAuthHeaders } from "@/lib/auth";
import { getAgent } from "@/config/agents";
import { useNotifications } from "@/components/notifications/NotificationProvider";
import { ExportMenu } from "./ExportMenu";
import { PromptTemplates } from "./PromptTemplates";
import { WorkspaceWelcome } from "@/components/workspace/WorkspaceWelcome";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { createLiveText } from "@/lib/chat-motion";
import { useChatScroll } from "@/hooks/useChatScroll";
import { transition } from "@/config/motion";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const WS_BASE = API_URL.replace("http", "ws");

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
  const taskOptionsRef = useDialogFocus(inputExpanded, () => setInputExpanded(false));
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const followMessagesRef = useRef(true);
  const sendingRef = useRef(false);
  const conversationGenerationRef = useRef(0);
  const createRequestRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const stopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingMessageRef = useRef<{ id: string; buffer: ReturnType<typeof createLiveText> } | null>(null);
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
  const cameraDialogRef = useDialogFocus(cameraOpen, () => closeCamera());
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
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollToLatest = useChatScroll(scrollRef, contentRef, followMessagesRef, setShowScrollToBottom, conversationId, loadingConversation);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync external ref (for keyboard shortcuts from parent)
  useEffect(() => {
    if (externalInputRef && inputRef.current) {
      (externalInputRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = inputRef.current;
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); }, []);
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

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input, messages.length === 0, loadingConversation]);

  // Cancel stale reads when switching chats. Preserve the optimistic first
  // message only for the conversation created by this composer.
  useEffect(() => {
    const controller = new AbortController();
    conversationGenerationRef.current += 1;
    followMessagesRef.current = true;
    setShowScrollToBottom(false);
    if (skipNextLoadRef.current && conversationId) {
      skipNextLoadRef.current = false;
      return () => { controller.abort(); createRequestRef.current?.abort(); };
    }
    pendingMessageRef.current = null;
    pendingAttachmentsRef.current = [];
    streamingMessageRef.current?.buffer.cancel();
    streamingMessageRef.current = null;
    setIsStopping(false);
    if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    sendingRef.current = false;
    setIsThinking(false);
    setToolActivity(null);
    setThinkingAgent("");
    setThinkingPhase("");
    setError(null);
    setMessages([]);
    setInput("");
    setAttachedFiles([]);
    setInputExpanded(false);
    resetPipeline();
    setLoadingConversation(!!conversationId);
    if (conversationId) {
      (async () => {
        try {
          const res = await fetch(`${API_URL}/api/v1/chat/conversations/${conversationId}`, {
            headers: getAuthHeaders(), signal: controller.signal,
          });
          if (!res.ok) throw new Error("Unable to load this conversation. Please retry.");
          const data = await res.json();
          if (!controller.signal.aborted) setMessages(data.messages || []);
        } catch (err) {
          if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load conversation.");
        } finally {
          if (!controller.signal.aborted) setLoadingConversation(false);
        }
      })();
    }
    return () => {
      controller.abort();
      createRequestRef.current?.abort();
    };
  }, [conversationId, loadAttempt, resetPipeline]);

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

    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let destroyed = false;
    let streamSequence = 0;
    let toolClearTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (destroyed) return;
      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }

      const ws = new WebSocket(`${WS_BASE}/api/v1/chat/ws/${conversationId}`);
      wsRef.current = ws;
      setWsConnected(false);

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
          sendingRef.current = true;
          setIsThinking(true);
          ws.send(JSON.stringify(msg));
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
            if (toolClearTimeout) clearTimeout(toolClearTimeout);
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
            if (toolClearTimeout) clearTimeout(toolClearTimeout);
            toolClearTimeout = setTimeout(() => {
              if (!destroyed && wsRef.current === ws) setToolActivity(null);
            }, 800);
            break;
          }

          case "agent_complete":
            cb.updateAgent(data.agent, { status: "complete", durationMs: data.duration_ms, summary: data.summary, toolName: undefined, toolArgs: undefined });
            break;

          case "synthesis_start":
            cb.updateAgent("orchestrator", { status: "thinking", phase: "synthesizing", startTime: Date.now() });
            break;

          case "pipeline_complete":
            // Stay busy until the saved response arrives; it follows this event.
            setActiveAgents([]);
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
            setIsStopping(false);
            if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
            sendingRef.current = false;
            setIsThinking(false);
            setToolActivity(null);
            setThinkingAgent("");
            thinkingAgentRef.current = "";
            setThinkingPhase("");
            if (streamingMessageRef.current) {
              // A streaming message already exists — replace it with the final version
              const streamId = streamingMessageRef.current.id;
              streamingMessageRef.current.buffer.flush();
              streamingMessageRef.current.buffer.cancel();
              streamingMessageRef.current = null;
              if (data.message) {
                setMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, ...data.message, renderKey: m.renderKey, liveText: undefined, awaiting: false, isStreaming: false, incomplete: false, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms } : m
                ));
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === streamId ? { ...m, liveText: undefined, awaiting: false, isStreaming: false, incomplete: false, content: data.content ?? m.liveText?.content ?? m.content, contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms } : m
                ));
              }
            } else {
              setMessages(prev => {
                const pending = prev.find(m => m.awaiting);
                const message: Message = {
                  ...(data.message || { id: Date.now(), role: "agent", agent_name: data.agent, content: data.content }),
                  renderKey: pending?.renderKey, animateIn: !pending,
                  contributing_agents: data.contributing_agents, pipeline_duration_ms: data.pipeline_duration_ms,
                };
                return pending ? prev.map(m => m === pending ? message : m) : [...prev, message];
              });
            }
            cb.onMessageSent();
            break;

          case "message_saved":
            cb.onMessageSent();
            break;

          case "message_updated":
            setMessages(prev => prev.map(m => m.id === data.id ? { ...m, critic_score: data.critic_score, critic_review: data.critic_review } : m));
            break;

          case "busy":
            setError(data.content);
            break;

          case "cancelled":
            if (!sendingRef.current) break;
            streamingMessageRef.current?.buffer.flush();
            streamingMessageRef.current?.buffer.cancel();
            streamingMessageRef.current = null;
            sendingRef.current = false;
            setIsThinking(false);
            setIsStopping(false);
            if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
            setToolActivity(null);
            setActiveAgents([]);
            setMessages(prev => prev.map(m => (m.isStreaming || m.awaiting) ? {
              ...m, ...data.message, renderKey: m.renderKey,
              content: data.message?.content ?? m.liveText?.content ?? m.content,
              liveText: undefined, isStreaming: false, awaiting: false, interrupted: data.message?.interrupted ?? true,
            } : m));
            if (data.save_failed) setError("Reply stopped, but couldn't save it. Copy any text you want to keep.");
            cb.emitPipeline(false);
            cb.onMessageSent();
            break;

          case "error":
            setIsStopping(false);
            if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
            sendingRef.current = false;
            streamingMessageRef.current?.buffer.flush();
            streamingMessageRef.current?.buffer.cancel();
            streamingMessageRef.current = null;
            setMessages(prev => prev.filter(m => !m.awaiting).map(m => m.isStreaming ? { ...m, ...data.message, renderKey: m.renderKey, content: data.message?.content ?? m.liveText?.content ?? m.content, liveText: undefined, isStreaming: false, incomplete: true } : m));
            setActiveAgents([]);
            setThinkingAgent("");
            setThinkingPhase("");
            setIsThinking(false);
            setToolActivity(null);
            setError(data.content);
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

          case "stream_start": {
            streamingMessageRef.current?.buffer.cancel();
            const id = `stream-${Date.now()}-${++streamSequence}`;
            const buffer = createLiveText({
              request: callback => requestAnimationFrame(callback),
              cancel: id => cancelAnimationFrame(id),
            });
            streamingMessageRef.current = { id, buffer };
            setMessages(prev => {
              const pending = prev.find(m => m.awaiting || m.isStreaming);
              const message: Message = {
                id, renderKey: pending?.renderKey ?? id, animateIn: !pending,
                isStreaming: true, liveText: buffer,
                role: "agent", agent_name: data.agent || "orchestrator", content: "",
              };
              return pending ? prev.map(m => m === pending ? message : m) : [...prev, message];
            });
            break;
          }

          case "stream_token":
            if (streamingMessageRef.current && typeof data.token === "string") {
              streamingMessageRef.current.buffer.append(data.token);
            }
            break;

          case "stream_reset":
            streamingMessageRef.current?.buffer.cancel();
            streamingMessageRef.current = null;
            setMessages(prev => prev.map(m => m.isStreaming ? { ...m, content: "", liveText: undefined, isStreaming: false, awaiting: true } : m));
            break;

          case "stream_end":
            streamingMessageRef.current?.buffer.flush();
            break;

          case "critic_review":
            // Critic review event — store the review data for the current streaming message
            // The actual score/review will be attached via the response event's message data
            cb.updateAgent("critic", {
              status: "complete",
              durationMs: 0,
              summary: data.score ? `Score: ${data.score}/10` : "Review complete",
            });
            break;
        }
      };

      ws.onclose = () => {
        if (destroyed || wsRef.current !== ws) return;
        if (pingInterval) clearInterval(pingInterval);
        setWsConnected(false);
        setIsStopping(false);
        if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
        if (sendingRef.current && !pendingMessageRef.current) {
          setError("Connection interrupted. Your response may be incomplete. Reopen this chat after reconnecting to load saved messages.");
        }
        sendingRef.current = !!pendingMessageRef.current;
        setIsThinking(!!pendingMessageRef.current);
        setToolActivity(null);
        setActiveAgents([]);
        streamingMessageRef.current?.buffer.flush();
        streamingMessageRef.current?.buffer.cancel();
        streamingMessageRef.current = null;
        setMessages(prev => prev.filter(m => !m.awaiting).map(m => m.isStreaming ? { ...m, content: m.liveText?.content ?? m.content, liveText: undefined, isStreaming: false, incomplete: true } : m));
        if (toolClearTimeout) clearTimeout(toolClearTimeout);
        callbacksRef.current.emitPipeline(false);
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
      if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
      streamingMessageRef.current?.buffer.cancel();
      if (toolClearTimeout) clearTimeout(toolClearTimeout);
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
    if ((!rawContent && filesToSend.length === 0) || sendingRef.current || isThinking || loadingConversation) return;
    sendingRef.current = true;
    const generation = conversationGenerationRef.current;
    followMessagesRef.current = true;
    setShowScrollToBottom(false);
    setInput("");
    setAttachedFiles([]);
    setError(null);
    resetPipeline();

    const userMsg: Message = { id: Date.now(), role: "user", animateIn: true, content, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg, { id: `pending-${userMsg.id}`, renderKey: `pending-${userMsg.id}`, role: "agent", content: "", awaiting: true, animateIn: true }]);
    setIsThinking(true);

    let activeConvId = conversationId;

    if (!activeConvId) {
      const controller = new AbortController();
      createRequestRef.current = controller;
      try {
        const res = await fetch(`${API_URL}/api/v1/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ title: content.slice(0, 80) }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not create a chat. Your draft has been restored; please retry.");
        const conv = await res.json();
        if (typeof conv.id !== "string" || !conv.id) throw new Error("Invalid conversation response. Please retry.");
        if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
        activeConvId = conv.id;
        pendingMessageRef.current = content;
        pendingAttachmentsRef.current = binaryAttachments;
        skipNextLoadRef.current = true;
        onConversationCreated(conv.id);
      } catch (err) {
        if (controller.signal.aborted || generation !== conversationGenerationRef.current) return;
        setError(err instanceof Error ? err.message : "Failed to create conversation. Please retry.");
        setMessages(prev => prev.filter(message => message.id !== userMsg.id && message.id !== `pending-${userMsg.id}`));
        setInput(current => current || rawContent);
        setAttachedFiles(current => current.length ? current : filesToSend);
        sendingRef.current = false;
        setIsThinking(false);
        return;
      }
    }

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

  const handleStop = () => {
    if (!sendingRef.current || isStopping || stopTimeoutRef.current) return;
    if (createRequestRef.current && !conversationId) createRequestRef.current.abort();
    if (pendingMessageRef.current || !conversationId) {
      pendingMessageRef.current = null;
      pendingAttachmentsRef.current = [];
      sendingRef.current = false;
      setIsThinking(false);
      setMessages(prev => prev.map(m => m.awaiting ? { ...m, awaiting: false, interrupted: true } : m));
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setIsStopping(true);
      wsRef.current.send(JSON.stringify({ type: "stop" }));
      stopTimeoutRef.current = setTimeout(() => {
        // Closing the socket also cancels server work if an old deployment
        // cannot acknowledge Stop. Never unlock while that turn is still live.
        wsRef.current?.close();
      }, 5000);
    }
  };
  const sendHandlerRef = useRef(handleSend);
  sendHandlerRef.current = handleSend;
  const sendFromMessage = useCallback((text: string) => { void sendHandlerRef.current(text); }, []);
  const saveFeedback = useCallback((id: string | number, feedback: "up" | "down") => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, feedback } : m));
  }, []);
  const responseStatus = isStopping ? "Stopping…" : toolActivity?.status === "calling" ? `Using ${toolActivity.tool}…`
    : thinkingPhase === "planning" ? "Thinking it through…"
    : thinkingPhase === "synthesizing" ? "Bringing the answer together…"
    : thinkingAgent ? `${getAgent(thinkingAgent.toLowerCase()).displayName} is working…` : "Thinking…";

  const isEmpty = messages.length === 0 && !isThinking && !loadingConversation;
  useEffect(() => {
    if (!isThinking && !loadingConversation && messages.length > 0 && document.activeElement === document.body) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [isThinking, loadingConversation]);

  const insertPrompt = (prompt: string) => {
    setInput(prompt);
    setShowTemplates(false);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(prompt.length, prompt.length); });
  };
  const composer = <div className="task-composer"
    onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
    <input ref={fileInputRef} type="file" multiple accept={ALL_ACCEPT} className="hidden" onChange={e => { if (e.target.files) processFiles(e.target.files); e.target.value = ""; }}/>
    {isDragging && <div className="drop-zone-overlay"><span>Drop something interesting here</span></div>}
    {attachedFiles.length > 0 && <div className="file-chips">{attachedFiles.map(file => <div key={file.id} className={`file-chip ${file.type === "image" ? "file-chip--image" : ""}`}>
      {file.type === "image" && file.preview ? <img src={file.preview} alt={file.name} className="file-chip__preview"/> : <span className="file-chip__icon">{fileTypeIcon(file.type)}</span>}
      <span className="file-chip__name">{file.name}</span><span className="file-chip__size">{formatFileSize(file.size)}</span><button className="file-chip__remove" aria-label={`Remove ${file.name}`} onClick={() => removeFile(file.id)}>×</button>
    </div>)}</div>}
    <textarea ref={inputRef} aria-label="Message" value={input} onChange={e => setInput(e.target.value)} onPaste={handlePaste}
      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
      placeholder={isThinking ? "Draft your next message…" : attachedFiles.length ? "What should we do with these files?" : isEmpty ? "Ask a question or describe a task…" : "Message AgentVerse…"}
      rows={1} disabled={loadingConversation || (isThinking && !conversationId)}/>
    <div className="composer-toolbar"><div className="composer-tools">
      <button className="composer-attach" aria-label="Attach files" onClick={() => fileInputRef.current?.click()} disabled={loadingConversation || (isThinking && !conversationId)}><WorkspaceIcon name="attach" size={17}/><span>Attach files</span></button>
      {isRecording && <button className="icon-button is-recording" onClick={toggleRecording} aria-label="Stop voice input" title="Stop voice input"><WorkspaceIcon name="mic" size={17}/></button>}
      <div className="composer-more"><button className="icon-button" onClick={() => setInputExpanded(v => !v)} disabled={loadingConversation || (isThinking && !conversationId)} aria-label="More tools" aria-expanded={inputExpanded}>···</button>
        {inputExpanded && <div className="composer-menu-dismiss" aria-hidden="true" onClick={() => setInputExpanded(false)}/>}
        <AnimatePresence>
          {inputExpanded && <motion.div key="tools" ref={taskOptionsRef} role="dialog" aria-label="Task options" tabIndex={-1} className="composer-menu" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4, pointerEvents: "none" }} transition={transition.fast}>
            <button onClick={() => { toggleRecording(); setInputExpanded(false); }}>{isRecording ? "Stop voice input" : "Use voice input"}</button>
            <button onClick={() => { openCamera(); setInputExpanded(false); }}>Take a photo</button>
            <button onClick={() => { setShowTemplates(v => !v); setInputExpanded(false); }}>Browse prompt templates</button>
          </motion.div>}
        </AnimatePresence>
      </div>
    </div>
    <div className="composer-helper">{isThinking ? "You can draft your next message" : <>Enter to send <span className="key-divider">·</span> Shift + Enter for a new line</>}</div>
    {isThinking ? <button className="stop-response-button" aria-label="Stop response" onClick={handleStop} disabled={isStopping}><span className="stop-symbol" aria-hidden="true"/>{isStopping ? "Stopping…" : "Stop"}</button>
      : <button className="start-task-button" aria-label="Send message" onClick={() => handleSend()} disabled={loadingConversation || (!input.trim() && !attachedFiles.length)}><span>Send</span><WorkspaceIcon name="arrow" size={18}/></button>}
    </div>
    {showTemplates && <div className="composer-templates"><button className="text-action" onClick={() => setShowTemplates(false)}>Close templates ×</button><PromptTemplates onInsert={insertPrompt}/></div>}
  </div>;

  return (
    <div className="studio-chat flex flex-col h-full min-h-0 min-w-0" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="chat-topbar">
        <span>{conversationId && !wsConnected ? "Connecting…" : isEmpty ? "A little help for your next idea" : "Your conversation"}</span>
        {!isEmpty && !isThinking && <ExportMenu messages={messages}/>}
      </div>

      {/* Resize observation follows content growth without token-by-token jumps. */}
      <div ref={scrollRef} className="chat-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain" aria-label="Conversation messages" tabIndex={0} aria-busy={loadingConversation}>
        <div ref={contentRef} className={`chat-scroll-content ${isEmpty ? "is-welcome" : ""}`}>
        {loadingConversation ? (
          <div className="p-8 text-center text-sm" role="status" style={{ color: "var(--text-muted)" }}>Loading conversation…</div>
        ) : isEmpty ? (
          <WorkspaceWelcome onPrompt={insertPrompt}/>
        ) : (
          /* Message list */
          <div className="conversation-messages">
            {messages.map(message => <ChatMessage key={message.renderKey ?? `${conversationId}-${message.role}-${message.id}`} message={message} status={message.awaiting || message.isStreaming ? responseStatus : undefined} busy={!!message.content.includes("[APPROVAL_REQUIRED:") && isThinking} onSend={sendFromMessage} onFeedback={saveFeedback}/>)}
          </div>
        )}
        </div>
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
            <span role="alert">{error}</span>
            {conversationId && messages.length === 0 && <button className="ml-3 underline" onClick={() => setLoadAttempt(n => n + 1)}>Retry</button>}
            <button aria-label="Dismiss error" onClick={() => setError(null)} className="ml-3 transition-colors hover:opacity-70">✕</button>
          </motion.div>
        </div>
      )}

      <div className="conversation-composer">
        <AnimatePresence>
          {showScrollToBottom && <motion.button key="latest" className="latest-messages-button" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={transition.fast} onClick={scrollToLatest}>↓ Latest messages</motion.button>}
        </AnimatePresence>
        <div className="conversation-composer-inner">{composer}</div>
      </div>
      {/* Camera modal */}
      {cameraOpen && (
        <div className="camera-modal">
          <div ref={cameraDialogRef} role="dialog" aria-modal="true" aria-label="Take a photo" tabIndex={-1} className="camera-modal__inner">
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
