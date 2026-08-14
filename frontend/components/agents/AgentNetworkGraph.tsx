"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface AgentNode {
  id: string;
  label: string;
  role: string;
  status: "active" | "idle" | "working";
  color: string;
  x: number;
  y: number;
  message_count: number;
  last_seen: string | null;
}

interface AgentEdge {
  from: string;
  to: string;
}

const statusColors: Record<string, string> = {
  active: "var(--green)",
  working: "var(--yellow)",
  idle: "var(--text-faint)",
};

const agentIcons: Record<string, string> = {
  orchestrator: "O",
  research: "R",
  coding: "C",
  writer: "W",
  critic: "Q",
  data: "D",
  data_analyst: "D",
  memory: "M",
};

/**
 * Lay out agents in a hub-and-spoke pattern.
 * Orchestrator sits at the center, all others form an even ring.
 */
function computeLayout(agents: AgentNode[]): AgentNode[] {
  const orchestrator = agents.find(a => a.id === "orchestrator");
  const satellites = agents.filter(a => a.id !== "orchestrator");

  const cx = 50;
  const cy = 46;
  const radius = 34; // % of container

  const positioned: AgentNode[] = [];

  if (orchestrator) {
    positioned.push({ ...orchestrator, x: cx, y: cy });
  }

  satellites.forEach((agent, i) => {
    const angle = (2 * Math.PI * i) / satellites.length - Math.PI / 2; // start from top
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    positioned.push({ ...agent, x, y });
  });

  return positioned;
}

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const [rawAgents, setRawAgents] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agents`);
        if (res.ok) {
          const data = await res.json();
          const fixed = (data.agents || []).map((a: AgentNode) => ({
            ...a,
            label: a.label.replace(/_/g, " "),
          }));
          setRawAgents(fixed);
          setEdges(data.edges || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 15000);
    return () => clearInterval(interval);
  }, []);

  // Compute positions using hub-and-spoke layout
  const agents = useMemo(() => computeLayout(rawAgents), [rawAgents]);

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[320px] md:h-[520px]";
  const selectedAgent = agents.find(a => a.id === selected);
  const totalMessages = agents.reduce((s, a) => s + a.message_count, 0);

  // Hover-connected agents
  const connectedTo = useMemo(() => {
    if (!hovered) return null;
    const connected = new Set<string>();
    connected.add(hovered);
    edges.forEach(e => {
      if (e.from === hovered) connected.add(e.to);
      if (e.to === hovered) connected.add(e.from);
    });
    return connected;
  }, [hovered, edges]);

  // Only draw edges to/from orchestrator for a clean hub layout
  const hubEdges = useMemo(() => {
    const orch = agents.find(a => a.id === "orchestrator");
    if (!orch) return [];
    return agents
      .filter(a => a.id !== "orchestrator")
      .map(a => ({ from: "orchestrator", to: a.id }));
  }, [agents]);

  return (
    <div className={`glass-panel-premium ${height} relative overflow-hidden flex flex-col max-w-full`}>
      {/* Subtle grid background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 46%, var(--brand-dim) 0%, transparent 70%)`,
          opacity: 0.3,
          zIndex: 0,
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 pt-4 md:pt-5 pb-2 flex-shrink-0 relative z-10">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Agent Network
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {loading
              ? "Loading…"
              : `${agents.length} agents · ${agents.filter(a => a.status !== "idle").length} active · ${totalMessages} messages`}
          </p>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          {[
            { color: "var(--green)", label: "Online" },
            { color: "var(--yellow)", label: "Active" },
            { color: "var(--text-faint)", label: "Idle" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
              />
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph area */}
      <div className="flex-1 relative" style={{ zIndex: 2 }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-10 h-10 border-2 rounded-full"
              style={{
                borderColor: "var(--brand-dim)",
                borderTopColor: "var(--brand)",
                animation: "spinSlow 1s linear infinite",
              }}
            />
          </div>
        ) : (
          <>
            {/* SVG edges — clean lines from center to satellites */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
              <defs>
                <linearGradient id="hubEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.08" />
                </linearGradient>
              </defs>
              {hubEdges.map((edge, i) => {
                const from = agents.find(a => a.id === edge.from);
                const to = agents.find(a => a.id === edge.to);
                if (!from || !to) return null;
                const isHighlighted = hovered && connectedTo?.has(edge.to);
                const isDimmed = hovered && !isHighlighted && hovered !== "orchestrator";
                return (
                  <line
                    key={i}
                    x1={`${from.x}%`}
                    y1={`${from.y}%`}
                    x2={`${to.x}%`}
                    y2={`${to.y}%`}
                    stroke="var(--brand)"
                    strokeWidth={isHighlighted ? "1.5" : "1"}
                    strokeOpacity={isDimmed ? 0.06 : isHighlighted ? 0.5 : 0.15}
                    strokeDasharray="6 8"
                    style={{ transition: "all 0.3s ease" }}
                  />
                );
              })}
            </svg>

            {/* Agent nodes */}
            <AnimatePresence>
              {agents.map((agent, i) => {
                const isOrch = agent.id === "orchestrator";
                const isSelected = selected === agent.id;
                const isHovered = hovered === agent.id;
                const isDimmed = hovered && !connectedTo?.has(agent.id);
                const size = isOrch ? 64 : 52;

                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{
                      opacity: isDimmed ? 0.25 : 1,
                      scale: isHovered ? 1.1 : 1,
                    }}
                    transition={{
                      delay: i * 0.06,
                      type: "spring",
                      stiffness: 200,
                      damping: 20,
                    }}
                    className="absolute cursor-pointer"
                    style={{
                      left: `${agent.x}%`,
                      top: `${agent.y}%`,
                      transform: "translate(-50%, -50%)",
                      zIndex: isSelected || isHovered ? 20 : 10,
                    }}
                    onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                    onMouseEnter={() => setHovered(agent.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Node circle */}
                    <div
                      className="flex items-center justify-center relative"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        borderRadius: isOrch ? "20px" : "16px",
                        backgroundColor: `color-mix(in srgb, ${agent.color} 10%, var(--bg-panel))`,
                        border: `1.5px solid ${isSelected || isHovered ? agent.color : `${agent.color}25`}`,
                        boxShadow: isSelected
                          ? `0 0 24px ${agent.color}30, 0 4px 12px rgba(0,0,0,0.15)`
                          : isHovered
                            ? `0 0 16px ${agent.color}20, 0 4px 12px rgba(0,0,0,0.1)`
                            : `0 2px 8px rgba(0,0,0,0.12)`,
                        transition: "all 0.25s ease",
                      }}
                    >
                      {/* Inner gradient shine */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          borderRadius: "inherit",
                          background: `linear-gradient(135deg, ${agent.color}08 0%, transparent 60%)`,
                        }}
                      />
                      <span
                        className="relative font-bold"
                        style={{
                          fontSize: isOrch ? "18px" : "15px",
                          color: agent.color,
                          fontFamily: "'Inter', system-ui, sans-serif",
                          letterSpacing: "-0.5px",
                        }}
                      >
                        {agentIcons[agent.id] || agent.label[0]}
                      </span>
                    </div>

                    {/* Status indicator */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: "10px",
                        height: "10px",
                        bottom: isOrch ? "0px" : "-1px",
                        right: isOrch ? "0px" : "-1px",
                        backgroundColor: statusColors[agent.status],
                        border: "2px solid var(--bg-panel)",
                        boxShadow: `0 0 4px ${statusColors[agent.status]}`,
                      }}
                    />

                    {/* Label */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none whitespace-nowrap"
                      style={{ top: `${size + 6}px` }}
                    >
                      <div
                        className="text-[10px] font-semibold leading-tight"
                        style={{
                          color: isHovered || isSelected ? "var(--text-primary)" : "var(--text-muted)",
                          transition: "color 0.2s ease",
                        }}
                      >
                        {isOrch ? "Orchestrator" : agent.label}
                      </div>
                      {agent.message_count > 0 && (
                        <div
                          className="text-[9px] mt-0.5 font-medium"
                          style={{ color: "var(--text-faint)" }}
                        >
                          {agent.message_count} msgs
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Selected agent detail — compact bottom bar */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-3 left-3 right-3 z-20"
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "blur(20px) saturate(1.2)",
              WebkitBackdropFilter: "blur(20px) saturate(1.2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            {/* Accent line */}
            <div
              style={{
                height: "2px",
                background: `linear-gradient(90deg, ${selectedAgent.color}, ${selectedAgent.color}40, transparent)`,
              }}
            />
            <div className="px-4 py-3 flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${selectedAgent.color} 12%, var(--bg-panel))`,
                  border: `1px solid ${selectedAgent.color}30`,
                }}
              >
                <span className="font-bold" style={{ color: selectedAgent.color, fontSize: "14px" }}>
                  {agentIcons[selectedAgent.id] || selectedAgent.label[0]}
                </span>
              </div>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selectedAgent.label}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {selectedAgent.role}
                </div>
              </div>
              {/* Stats */}
              <div className="text-right flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: statusColors[selectedAgent.status],
                      boxShadow: `0 0 4px ${statusColors[selectedAgent.status]}`,
                    }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {selectedAgent.status === "active" ? "Online" : selectedAgent.status === "working" ? "Active" : "Idle"}
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--text-faint)" }}>
                  {selectedAgent.message_count} responses
                </div>
              </div>
              {/* Close */}
              <button
                onClick={() => setSelected(null)}
                className="ml-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ color: "var(--text-faint)", backgroundColor: "var(--bg-hover)" }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
