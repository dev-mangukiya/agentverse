"use client";

import { useState, useEffect } from "react";
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

const statusDotClass: Record<string, string> = {
  active: "bg-[#10b981]",
  working: "bg-[#f59e0b]",
  idle: "bg-[#5f6368]",
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
  orchestrator:  { x: 42, y: 52 },
  research:      { x: 15, y: 20 },
  memory:        { x: 48, y: 14 },
  data:          { x: 80, y: 20 },
  data_analyst:  { x: 80, y: 50 },
  coding:        { x: 15, y: 75 },
  writer:        { x: 80, y: 78 },
  critic:        { x: 48, y: 82 },
};

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const [agents, setAgents] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

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

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[480px]";
  const selectedAgent = agents.find(a => a.id === selected);

  return (
    <div className={`glass-panel ${height} relative overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Agent Network</h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {loading ? "Loading…" : `${agents.length} agents · ${agents.filter(a => a.status !== "idle").length} active`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[
            { color: "bg-[#10b981]", label: "Online" },
            { color: "bg-[#f59e0b]", label: "Active" },
            { color: "bg-[#5f6368]", label: "Idle" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative px-8 pt-4 pb-10">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--brand-dim)", borderTopColor: "var(--brand)" }} />
          </div>
        ) : (
          <>
            {/* SVG Edges */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(99,102,241,0.2)" />
                </marker>
                {/* Animated gradient for active edges */}
                <linearGradient id="activeEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.1" />
                  <stop offset="50%" stopColor="var(--brand)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.1" />
                </linearGradient>
              </defs>
              {edges.map((edge, i) => {
                const from = agents.find(a => a.id === edge.from);
                const to = agents.find(a => a.id === edge.to);
                if (!from || !to) return null;
                const isActive = from.status === "working" || to.status === "working";
                return (
                  <line
                    key={i}
                    x1={`${from.x}%`} y1={`${from.y}%`}
                    x2={`${to.x}%`}   y2={`${to.y}%`}
                    stroke={isActive ? "url(#activeEdge)" : "rgba(255,255,255,0.06)"}
                    strokeWidth={isActive ? "1.5" : "1"}
                    strokeDasharray={isActive ? "6 4" : "4 4"}
                    markerEnd="url(#arrowhead)"
                    style={isActive ? { animation: "flowLine 1s linear infinite" } : undefined}
                  />
                );
              })}
            </svg>

            {/* Agent Nodes */}
            <AnimatePresence>
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ delay: i * 0.07, type: "spring", stiffness: 220 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10 cursor-pointer"
                  style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
                  onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                >
                  {/* Active glow ring */}
                  {agent.status === "working" && (
                    <div
                      className="absolute inset-0 rounded-xl"
                      style={{
                        backgroundColor: agent.color,
                        opacity: 0.12,
                        animation: "pulseRing 1.5s ease-out infinite",
                        margin: "-6px",
                        borderRadius: "14px",
                      }}
                    />
                  )}

                  {/* Node */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-lg transition-all duration-200 hover:scale-110"
                    style={{
                      backgroundColor: `${agent.color}15`,
                      borderWidth: "1.5px",
                      borderStyle: "solid",
                      borderColor: selected === agent.id ? agent.color : `${agent.color}40`,
                      boxShadow: selected === agent.id
                        ? `0 0 24px ${agent.color}40`
                        : `0 0 12px ${agent.color}15`,
                    }}
                  >
                    {agentIcons[agent.id] || agent.label[0]}
                  </div>

                  {/* Status dot */}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 ${statusDotClass[agent.status]}`}
                    style={{ bottom: "-1px", right: "-1px", borderColor: "var(--bg-panel)" }}
                  />

                  {/* Label below */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap text-center pointer-events-none">
                    <div className="text-[10px] font-medium leading-tight" style={{ color: "var(--text-secondary)" }}>{agent.label}</div>
                    {agent.message_count > 0 && (
                      <div className="text-[9px] mt-0.5" style={{ color: "var(--text-faint)" }}>{agent.message_count} msgs</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}
      </div>

      {/* Selected agent detail panel */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-4 left-4 right-4 glass-panel-subtle px-4 py-3 flex items-center gap-4 z-20"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{
                backgroundColor: `${selectedAgent.color}20`,
                border: `1.5px solid ${selectedAgent.color}40`,
              }}
            >
              {agentIcons[selectedAgent.id] || selectedAgent.label[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{selectedAgent.label}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{selectedAgent.role}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1.5 justify-end mb-0.5">
                <span className={`w-2 h-2 rounded-full ${statusDotClass[selectedAgent.status]}`} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{statusLabel[selectedAgent.status]}</span>
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{selectedAgent.message_count} responses total</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="transition-colors ml-1 text-sm"
              style={{ color: "var(--text-faint)" }}
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
