"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type AgentStatus = "idle" | "activated" | "thinking" | "tool_call" | "complete" | "error";

interface AgentCardProps {
  name: string;
  status: AgentStatus;
  task?: string;
  phase?: string;
  toolName?: string;
  toolArgs?: Record<string, string>;
  durationMs?: number;
  summary?: string;
  startTime?: number;
  compact?: boolean;
}

const agentMeta: Record<string, { icon: string; color: string; label: string; role: string }> = {
  orchestrator: { icon: "🧠", color: "var(--agent-orchestrator)", label: "Orchestrator", role: "Planning & Coordination" },
  research:     { icon: "🔬", color: "var(--agent-research)", label: "Research", role: "Web Search & Analysis" },
  coding:       { icon: "💻", color: "var(--agent-coding)", label: "Coding", role: "Code & Execution" },
  writer:       { icon: "✍️", color: "var(--agent-writer)", label: "Writer", role: "Content & Reports" },
  critic:       { icon: "🔍", color: "var(--agent-critic)", label: "Critic", role: "Quality & Review" },
  data:         { icon: "📊", color: "var(--agent-data)", label: "Data Analyst", role: "Data & Insights" },
  memory:       { icon: "🧩", color: "var(--agent-memory)", label: "Memory", role: "RAG & Vector Store" },
};

const statusConfig: Record<AgentStatus, { label: string; animation: boolean }> = {
  idle:       { label: "Idle", animation: false },
  activated:  { label: "Activated", animation: true },
  thinking:   { label: "Thinking", animation: true },
  tool_call:  { label: "Using Tool", animation: true },
  complete:   { label: "Complete", animation: false },
  error:      { label: "Error", animation: false },
};

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 100) / 10);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <span className="agent-timer agent-timer--active">
      {elapsed.toFixed(1)}s
    </span>
  );
}

export function AgentCard({
  name,
  status,
  task,
  phase,
  toolName,
  durationMs,
  summary,
  startTime,
  compact = false,
}: AgentCardProps) {
  const meta = agentMeta[name.toLowerCase()] || {
    icon: "🤖",
    color: "var(--brand)",
    label: name.charAt(0).toUpperCase() + name.slice(1),
    role: "Agent",
  };

  const isActive = status === "activated" || status === "thinking" || status === "tool_call";
  const isComplete = status === "complete";
  const statusInfo = statusConfig[status] || statusConfig.idle;

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2"
      >
        <div
          className="agent-avatar agent-avatar--sm"
          style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 25%, var(--bg-panel))` }}
        >
          <span style={{ fontSize: "10px" }}>{meta.icon}</span>
        </div>
        <span className="text-[11px] font-medium" style={{ color: isActive ? meta.color : "var(--text-muted)" }}>
          {meta.label}
        </span>
        {isActive && (
          <div
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: meta.color }}
          />
        )}
        {isComplete && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M20 6L9 17l-5-5" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`agent-card ${isActive ? "agent-card--active" : ""} ${isComplete ? "agent-card--complete" : ""}`}
      style={{ "--agent-color": meta.color } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative">
          <div
            className="agent-avatar"
            style={{
              backgroundColor: `color-mix(in srgb, ${meta.color} 20%, var(--bg-panel))`,
              border: `1.5px solid color-mix(in srgb, ${meta.color} 40%, transparent)`,
            }}
          >
            {meta.icon}
          </div>
          {isActive && (
            <div
              className="absolute inset-0 rounded-[10px]"
              style={{
                background: meta.color,
                opacity: 0.15,
                animation: "pulseRing 1.5s ease-out infinite",
              }}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {meta.label} Agent
            </span>
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: isActive
                  ? `color-mix(in srgb, ${meta.color} 15%, transparent)`
                  : isComplete
                    ? "var(--green-dim)"
                    : "var(--bg-hover)",
                color: isActive
                  ? meta.color
                  : isComplete
                    ? "var(--green)"
                    : "var(--text-faint)",
              }}
            >
              {statusInfo.label}
            </span>
          </div>

          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {phase === "planning" && "Analyzing request and planning delegation..."}
            {phase === "executing" && (task ? task.slice(0, 80) : meta.role)}
            {phase === "synthesizing" && "Combining agent results..."}
            {!phase && (task ? task.slice(0, 80) : meta.role)}
          </div>

          {/* Tool call indicator */}
          {status === "tool_call" && toolName && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              className="mt-2"
            >
              <div className="tool-pill tool-pill--active">
                <div
                  className="w-3 h-3 border-[1.5px] rounded-full"
                  style={{
                    borderColor: "var(--brand-dim)",
                    borderTopColor: meta.color,
                    animation: "spinSlow 0.8s linear infinite",
                  }}
                />
                <span>{toolName}</span>
              </div>
            </motion.div>
          )}

          {/* Duration on complete */}
          {isComplete && durationMs !== undefined && (
            <div className="text-[10px] mt-1 font-mono" style={{ color: "var(--text-faint)" }}>
              Completed in {(durationMs / 1000).toFixed(1)}s
              {summary && <span className="ml-1">· {summary.slice(0, 50)}</span>}
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="flex-shrink-0 mt-0.5">
          {isActive && startTime ? (
            <ElapsedTimer startTime={startTime} />
          ) : durationMs !== undefined ? (
            <span className="agent-timer">{(durationMs / 1000).toFixed(1)}s</span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

export { agentMeta };
