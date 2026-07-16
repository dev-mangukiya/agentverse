"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AgentCard, agentMeta } from "./AgentCard";

type AgentStatus = "idle" | "activated" | "thinking" | "tool_call" | "complete" | "error";

interface PipelineAgent {
  name: string;
  status: AgentStatus;
  task?: string;
  phase?: string;
  toolName?: string;
  toolArgs?: Record<string, string>;
  durationMs?: number;
  summary?: string;
  startTime?: number;
}

interface DelegationEvent {
  from: string;
  to: string;
  reason: string;
  timestamp: number;
}

interface ToolEvent {
  agent: string;
  tool: string;
  status: "calling" | "done";
  durationMs?: number;
  result?: string;
  timestamp: number;
}

interface AgentPipelineProps {
  agents: PipelineAgent[];
  delegations: DelegationEvent[];
  toolEvents: ToolEvent[];
  pipelineActive: boolean;
  pipelineDurationMs?: number;
  totalAgentsUsed?: number;
}

const toolIcons: Record<string, string> = {
  web_search: "🔍",
  open_url: "🌐",
  execute_python: "⚡",
  calculate: "🧮",
  get_current_time: "🕐",
  read_file: "📄",
  write_file: "✍️",
};

export function AgentPipeline({
  agents,
  delegations,
  toolEvents,
  pipelineActive,
  pipelineDurationMs,
  totalAgentsUsed,
}: AgentPipelineProps) {
  const hasActivity = agents.length > 0 || pipelineActive;

  return (
    <div className="pipeline-container h-full flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: pipelineActive ? "var(--green)" : "var(--text-faint)",
                boxShadow: pipelineActive ? "0 0 10px var(--green)" : "none",
                animation: pipelineActive ? "pulse 1.5s ease-in-out infinite" : "none",
              }}
            />
            <span
              className="text-[10px] font-bold uppercase tracking-widest transition-colors duration-300"
              style={{ color: pipelineActive ? "var(--green)" : "var(--text-faint)" }}
            >
              {pipelineActive ? "Pipeline Active" : "Pipeline Idle"}
            </span>
          </div>
        </div>

        {pipelineDurationMs !== undefined && !pipelineActive && (
          <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
            <span>{totalAgentsUsed || 0} agents</span>
            <span>·</span>
            <span className="font-mono">{(pipelineDurationMs / 1000).toFixed(1)}s</span>
          </div>
        )}
      </div>

      {/* Pipeline content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <AnimatePresence mode="sync">
          {!hasActivity ? (
            /* Idle state — agent constellation */
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full text-center px-4"
            >
              <div className="mb-6 relative">
                {/* Floating constellation */}
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <div
                    className="absolute inset-0 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, var(--brand) 0%, var(--agent-data) 100%)",
                      opacity: 0.12,
                    }}
                  />
                  <span
                    className="absolute inset-0 flex items-center justify-center text-2xl"
                    style={{ animation: "constellation 3s ease-in-out infinite" }}
                  >
                    ⚡
                  </span>
                  {/* Orbiting dots */}
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="absolute w-1.5 h-1.5 rounded-full"
                      style={{
                        top: "50%",
                        left: "50%",
                        marginTop: "-3px",
                        marginLeft: "-3px",
                        backgroundColor: "var(--brand)",
                        opacity: 0.4,
                        animation: `orbit ${3 + i * 0.5}s linear ${i * 0.5}s infinite`,
                        ["--orbit-radius" as string]: `${24 + i * 6}px`,
                      }}
                    />
                  ))}
                </div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  Agent Orchestration
                </h3>
                <p className="text-xs max-w-[200px] mx-auto" style={{ color: "var(--text-muted)" }}>
                  Send a message to see your AI agents collaborate in real-time
                </p>
              </div>

              {/* Agent roster */}
              <div className="w-full space-y-1.5">
                {Object.entries(agentMeta).slice(0, 6).map(([key, meta], i) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.07, duration: 0.3 }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group/agent cursor-default"
                    style={{ backgroundColor: "var(--bg-raised)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                      e.currentTarget.style.borderColor = `color-mix(in srgb, ${meta.color} 15%, transparent)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-raised)";
                    }}
                  >
                    <div
                      className="agent-avatar agent-avatar--sm"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${meta.color} 15%, var(--bg-panel))`,
                        border: `1px solid color-mix(in srgb, ${meta.color} 20%, transparent)`,
                      }}
                    >
                      <span style={{ fontSize: "10px" }}>{meta.icon}</span>
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        {meta.label}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {meta.role}
                      </div>
                    </div>
                    <div
                      className="w-1.5 h-1.5 rounded-full transition-all duration-300 group-hover/agent:scale-150"
                      style={{
                        backgroundColor: "var(--text-faint)",
                        opacity: 0.4,
                      }}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* Active pipeline — timeline view */
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {/* Pipeline nodes */}
              {agents.map((agent, i) => {
                const meta = agentMeta[agent.name.toLowerCase()];
                const isActive = agent.status === "activated" || agent.status === "thinking" || agent.status === "tool_call";
                const isComplete = agent.status === "complete";

                // Find delegation for this agent
                const delegation = delegations.find(d => d.to === agent.name);

                // Find tool events for this agent
                const agentTools = toolEvents.filter(t => t.agent === agent.name);

                return (
                  <motion.div
                    key={agent.name}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                    className={`pipeline-node ${isActive ? "pipeline-node--active" : ""}`}
                    style={{ "--agent-color": meta?.color || "var(--brand)" } as React.CSSProperties}
                  >
                    {/* Timeline dot */}
                    <div
                      className={`pipeline-dot ${isActive ? "pipeline-dot--active" : ""} ${isComplete ? "pipeline-dot--complete" : ""}`}
                      style={{ "--agent-color": meta?.color || "var(--brand)" } as React.CSSProperties}
                    >
                      {isActive && (
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: meta?.color || "var(--brand)" }}
                        />
                      )}
                    </div>

                    {/* Delegation label */}
                    {delegation && (
                      <motion.div
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[10px] mb-1.5 flex items-center gap-1"
                        style={{ color: "var(--text-faint)" }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                          <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>{delegation.reason}</span>
                      </motion.div>
                    )}

                    {/* Agent card */}
                    <AgentCard
                      name={agent.name}
                      status={agent.status}
                      task={agent.task}
                      phase={agent.phase}
                      toolName={agent.toolName}
                      toolArgs={agent.toolArgs}
                      durationMs={agent.durationMs}
                      summary={agent.summary}
                      startTime={agent.startTime}
                    />

                    {/* Tool events timeline */}
                    {agentTools.length > 0 && (
                      <div className="ml-4 mt-2 space-y-1.5">
                        {agentTools.map((tool, j) => (
                          <motion.div
                            key={`${tool.tool}-${j}`}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: j * 0.06 }}
                            className={`tool-pill ${tool.status === "calling" ? "tool-pill--active" : ""}`}
                          >
                            <span>{toolIcons[tool.tool] || "🔧"}</span>
                            <span>{tool.tool}</span>
                            {tool.status === "calling" ? (
                              <div
                                className="w-3 h-3 border-[1.5px] rounded-full"
                                style={{
                                  borderColor: "var(--brand-dim)",
                                  borderTopColor: "var(--brand)",
                                  animation: "spinSlow 0.8s linear infinite",
                                }}
                              />
                            ) : tool.durationMs !== undefined ? (
                              <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                                {(tool.durationMs / 1000).toFixed(1)}s
                              </span>
                            ) : (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                <path d="M20 6L9 17l-5-5" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {/* Pipeline complete summary */}
              {!pipelineActive && pipelineDurationMs !== undefined && agents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="mt-4 px-4 py-3.5 rounded-xl text-center relative overflow-hidden"
                  style={{
                    backgroundColor: "var(--green-dim)",
                    border: "1px solid color-mix(in srgb, var(--green) 20%, transparent)",
                  }}
                >
                  {/* Sparkle effect */}
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 rounded-full"
                      style={{
                        backgroundColor: "var(--green)",
                        left: `${20 + i * 20}%`,
                        top: `${30 + (i % 2) * 40}%`,
                        animation: `sparkle 2s ease-in-out ${i * 0.3}s infinite`,
                      }}
                    />
                  ))}
                  <div className="flex items-center justify-center gap-2 mb-1 relative z-10">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M20 6L9 17l-5-5" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-xs font-bold" style={{ color: "var(--green)" }}>
                      Pipeline Complete
                    </span>
                  </div>
                  <div className="text-[10px] font-mono relative z-10" style={{ color: "var(--text-muted)" }}>
                    {totalAgentsUsed || agents.length} agents · {(pipelineDurationMs / 1000).toFixed(1)}s total
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
