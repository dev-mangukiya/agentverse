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

const statusLabel: Record<string, string> = {
  active: "Online",
  working: "Active recently",
  idle: "Idle",
};

const statusColors: Record<string, string> = {
  active: "var(--green)",
  working: "var(--yellow)",
  idle: "var(--text-faint)",
};

const agentIcons: Record<string, string> = {
  orchestrator: "🧠",
  research: "🔬",
  coding: "💻",
  writer: "✍️",
  critic: "🔍",
  data: "📊",
  data_analyst: "📊",
  memory: "🧩",
};

// Frontend fallback positions — well-spaced circular layout
const FALLBACK_POSITIONS: Record<string, { x: number; y: number }> = {
  orchestrator:  { x: 50, y: 45 },
  research:      { x: 20, y: 20 },
  memory:        { x: 50, y: 10 },
  data:          { x: 80, y: 20 },
  data_analyst:  { x: 82, y: 50 },
  coding:        { x: 18, y: 65 },
  writer:        { x: 80, y: 70 },
  critic:        { x: 50, y: 75 },
};

// Floating particle positions for ambient effect
const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: 2 + Math.random() * 3,
  delay: i * 0.8,
  duration: 4 + Math.random() * 4,
}));

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const [agents, setAgents] = useState<AgentNode[]>([]);
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
          // Apply fallback positions if backend returns cramped/default positions
          const fixedAgents = (data.agents || []).map((agent: AgentNode) => {
            const fallback = FALLBACK_POSITIONS[agent.id];
            if (fallback) {
              return { ...agent, x: fallback.x, y: fallback.y };
            }
            return agent;
          });
          // Fix labels: replace underscores with spaces
          fixedAgents.forEach((agent: AgentNode) => {
            agent.label = agent.label.replace(/_/g, " ");
          });
          setAgents(fixedAgents);
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

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[520px]";
  const selectedAgent = agents.find(a => a.id === selected);

  // Compute connected agents for hover dimming
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

  const totalMessages = agents.reduce((s, a) => s + a.message_count, 0);

  return (
    <div className={`glass-panel-premium ${height} relative overflow-hidden flex flex-col`}>
      {/* Ambient background */}
      <div className="absolute inset-0 network-canvas mesh-gradient network-grid" style={{ zIndex: 0 }} />

      {/* Floating ambient particles */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              background: `radial-gradient(circle, var(--brand) 0%, transparent 70%)`,
              opacity: 0.25,
              animation: `floatParticle ${p.duration}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-2 flex-shrink-0 relative z-10">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Agent Network
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {loading ? "Loading…" : `${agents.length} agents · ${agents.filter(a => a.status !== "idle").length} active · ${totalMessages} messages`}
          </p>
        </div>
        <div className="flex items-center gap-4">
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

      {/* Graph */}
      <div className="flex-1 relative px-8 pt-4 pb-12" style={{ zIndex: 2 }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative">
              <div
                className="w-10 h-10 border-2 rounded-full"
                style={{
                  borderColor: "var(--brand-dim)",
                  borderTopColor: "var(--brand)",
                  animation: "spinSlow 1s linear infinite",
                }}
              />
              <div
                className="absolute inset-0 w-10 h-10 border-2 rounded-full"
                style={{
                  borderColor: "transparent",
                  borderBottomColor: "var(--agent-data)",
                  animation: "spinSlow 1.5s linear infinite reverse",
                }}
              />
            </div>
          </div>
        ) : (
          <>
            {/* SVG Edges with animated flow */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              <defs>
                <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.06" />
                  <stop offset="50%" stopColor="var(--brand)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.06" />
                </linearGradient>
                <linearGradient id="activeEdgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.15" />
                  <stop offset="50%" stopColor="var(--brand)" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
                </linearGradient>
                <filter id="edgeGlow">
                  <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <marker id="arrowPremium" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(99,102,241,0.3)" />
                </marker>
              </defs>
              {edges.map((edge, i) => {
                const from = agents.find(a => a.id === edge.from);
                const to = agents.find(a => a.id === edge.to);
                if (!from || !to) return null;
                const isActive = from.status === "working" || to.status === "working";
                const isHighlighted = hovered && connectedTo?.has(edge.from) && connectedTo?.has(edge.to);
                const isDimmed = hovered && !isHighlighted;
                return (
                  <g key={i}>
                    {/* Glow layer for active edges */}
                    {isActive && (
                      <line
                        x1={`${from.x}%`} y1={`${from.y}%`}
                        x2={`${to.x}%`}   y2={`${to.y}%`}
                        stroke="url(#activeEdgeGradient)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        filter="url(#edgeGlow)"
                        opacity={isDimmed ? 0.1 : 0.4}
                        style={{ transition: "opacity 0.3s ease" }}
                      />
                    )}
                    {/* Main edge line */}
                    <line
                      x1={`${from.x}%`} y1={`${from.y}%`}
                      x2={`${to.x}%`}   y2={`${to.y}%`}
                      stroke={isActive ? "url(#activeEdgeGradient)" : "url(#edgeGradient)"}
                      strokeWidth={isActive ? "1.5" : "1"}
                      strokeDasharray={isActive ? "8 4" : "4 6"}
                      markerEnd="url(#arrowPremium)"
                      opacity={isDimmed ? 0.15 : 1}
                      style={{
                        transition: "opacity 0.3s ease",
                        ...(isActive ? { animation: "edgeFlow 1s linear infinite" } : {}),
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Agent node glow halos (behind nodes) */}
            {agents.map(agent => {
              const isNodeActive = agent.status === "working";
              return isNodeActive ? (
                <div
                  key={`glow-${agent.id}`}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    left: `${agent.x}%`,
                    top: `${agent.y}%`,
                    transform: "translate(-50%, -50%)",
                    width: "120px",
                    height: "120px",
                    background: `radial-gradient(circle, ${agent.color}15 0%, ${agent.color}05 40%, transparent 70%)`,
                    animation: "pulse 3s ease-in-out infinite",
                    zIndex: 1,
                  }}
                />
              ) : null;
            })}

            {/* Agent Nodes */}
            <AnimatePresence>
              {agents.map((agent, i) => {
                const isNodeSelected = selected === agent.id;
                const isNodeHovered = hovered === agent.id;
                const isDimmed = hovered && !connectedTo?.has(agent.id);
                const isWorking = agent.status === "working";
                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.3, y: 20 }}
                    animate={{
                      opacity: isDimmed ? 0.3 : 1,
                      scale: isNodeHovered ? 1.12 : 1,
                      y: 0,
                    }}
                    exit={{ opacity: 0, scale: 0.3 }}
                    transition={{
                      delay: i * 0.08,
                      type: "spring",
                      stiffness: 200,
                      damping: 20,
                      opacity: { duration: 0.2 },
                      scale: { duration: 0.2 },
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer network-node"
                    style={{
                      left: `${agent.x}%`,
                      top: `${agent.y}%`,
                      zIndex: isNodeSelected || isNodeHovered ? 20 : 10,
                    }}
                    onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                    onMouseEnter={() => setHovered(agent.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Pulse ring for working agents */}
                    {isWorking && (
                      <>
                        <div
                          className="absolute rounded-2xl"
                          style={{
                            inset: "-8px",
                            backgroundColor: agent.color,
                            opacity: 0.08,
                            animation: "pulseRing 2s ease-out infinite",
                            borderRadius: "18px",
                          }}
                        />
                        <div
                          className="absolute rounded-2xl"
                          style={{
                            inset: "-4px",
                            backgroundColor: agent.color,
                            opacity: 0.05,
                            animation: "pulseRing 2s ease-out 0.5s infinite",
                            borderRadius: "16px",
                          }}
                        />
                      </>
                    )}

                    {/* Node body */}
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center relative overflow-hidden"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${agent.color} 12%, var(--bg-panel))`,
                        borderWidth: "1.5px",
                        borderStyle: "solid",
                        borderColor: isNodeSelected || isNodeHovered ? agent.color : `${agent.color}30`,
                        boxShadow: isNodeSelected
                          ? `0 0 30px ${agent.color}40, 0 0 60px ${agent.color}15`
                          : isNodeHovered
                            ? `0 0 20px ${agent.color}30`
                            : `0 4px 20px rgba(0,0,0,0.2)`,
                        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                    >
                      {/* Inner shine */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `linear-gradient(135deg, ${agent.color}10 0%, transparent 60%)`,
                        }}
                      />
                      <span
                        className="relative z-10"
                        style={{ fontSize: "20px", lineHeight: 1, width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                      >
                        {agentIcons[agent.id] || agent.label[0]}
                      </span>
                    </div>

                    {/* Status dot */}
                    <div
                      className="absolute w-3.5 h-3.5 rounded-full border-2"
                      style={{
                        bottom: "-2px",
                        right: "-2px",
                        borderColor: "var(--bg-panel)",
                        backgroundColor: statusColors[agent.status],
                        boxShadow: `0 0 6px ${statusColors[agent.status]}`,
                      }}
                    />

                    {/* Label below */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 whitespace-nowrap text-center pointer-events-none">
                      <div
                        className="text-[11px] font-semibold leading-tight"
                        style={{ color: isNodeHovered || isNodeSelected ? "var(--text-primary)" : "var(--text-secondary)" }}
                      >
                        {agent.label}
                      </div>
                      {agent.message_count > 0 && (
                        <div className="text-[9px] mt-0.5 font-medium" style={{ color: "var(--text-faint)" }}>
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

      {/* Selected agent detail panel */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="absolute bottom-4 left-4 right-4 z-20 overflow-hidden"
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
              border: "1px solid var(--glass-border)",
              borderRadius: "16px",
            }}
          >
            {/* Gradient accent bar */}
            <div
              className="h-0.5"
              style={{
                background: `linear-gradient(90deg, ${selectedAgent.color}, ${selectedAgent.color}50, transparent)`,
              }}
            />
            <div className="px-5 py-4 flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center text-lg flex-shrink-0 relative overflow-hidden"
                style={{
                  backgroundColor: `color-mix(in srgb, ${selectedAgent.color} 15%, var(--bg-panel))`,
                  border: `1.5px solid ${selectedAgent.color}40`,
                  boxShadow: `0 0 20px ${selectedAgent.color}20`,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, ${selectedAgent.color}15, transparent)` }}
                />
                <span className="relative">{agentIcons[selectedAgent.id] || selectedAgent.label[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{selectedAgent.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{selectedAgent.role}</div>
              </div>
              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor: statusColors[selectedAgent.status],
                      boxShadow: `0 0 6px ${statusColors[selectedAgent.status]}`,
                    }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {statusLabel[selectedAgent.status]}
                  </span>
                </div>
                <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                  {selectedAgent.message_count} responses total
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="transition-all duration-200 ml-2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{
                  color: "var(--text-faint)",
                  backgroundColor: "var(--bg-hover)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                  e.currentTarget.style.color = "var(--text-faint)";
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
