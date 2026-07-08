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
  active: "bg-[#34a853]",
  working: "bg-[#fbbc04]",
  idle: "bg-[#9aa0a6]",
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
          setAgents(data.agents || []);
          setEdges(data.edges || []);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 20000);
    return () => clearInterval(interval);
  }, []);

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[420px]";
  const selectedAgent = agents.find(a => a.id === selected);

  return (
    <div className={`glass-panel ${height} relative overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-[#e8eaed]">Agent Network</h3>
          <p className="text-xs text-[#9aa0a6] mt-0.5">
            {loading ? "Loading…" : `${agents.length} agents · ${agents.filter(a => a.status !== "idle").length} active`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {[
            { color: "bg-[#34a853]", label: "Online" },
            { color: "bg-[#fbbc04]", label: "Active" },
            { color: "bg-[#9aa0a6]", label: "Idle" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${color}`} />
              <span className="text-[10px] text-[#9aa0a6]">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative p-4">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-[#4285f4]/30 border-t-[#4285f4] rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* SVG Edges */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M 0 0 L 6 3 L 0 6 z" fill="rgba(255,255,255,0.08)" />
                </marker>
              </defs>
              {edges.map((edge, i) => {
                const from = agents.find(a => a.id === edge.from);
                const to = agents.find(a => a.id === edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={i}
                    x1={`${from.x}%`} y1={`${from.y}%`}
                    x2={`${to.x}%`}   y2={`${to.y}%`}
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    markerEnd="url(#arrowhead)"
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
                      className="absolute inset-0 rounded-full animate-ping"
                      style={{ backgroundColor: agent.color, opacity: 0.15, margin: "-8px" }}
                    />
                  )}

                  {/* Node */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 transition-all duration-200 hover:scale-110"
                    style={{
                      backgroundColor: `${agent.color}22`,
                      borderColor: selected === agent.id ? agent.color : `${agent.color}55`,
                      boxShadow: selected === agent.id
                        ? `0 0 24px ${agent.color}60`
                        : `0 0 12px ${agent.color}20`,
                    }}
                  >
                    {agent.label[0]}
                  </div>

                  {/* Status dot */}
                  <div
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#1a1a1a] ${statusDotClass[agent.status]}`}
                    style={{ bottom: "-1px", right: "-1px" }}
                  />

                  {/* Label below */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap text-center pointer-events-none">
                    <div className="text-[10px] font-medium text-[#c4c7c5]">{agent.label}</div>
                    {agent.message_count > 0 && (
                      <div className="text-[9px] text-[#5f6368]">{agent.message_count} msgs</div>
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
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: `${selectedAgent.color}33`, border: `1.5px solid ${selectedAgent.color}66` }}
            >
              {selectedAgent.label[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#e8eaed]">{selectedAgent.label}</div>
              <div className="text-xs text-[#9aa0a6]">{selectedAgent.role}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1.5 justify-end mb-0.5">
                <span className={`w-2 h-2 rounded-full ${statusDotClass[selectedAgent.status]}`} />
                <span className="text-xs text-[#c4c7c5]">{statusLabel[selectedAgent.status]}</span>
              </div>
              <div className="text-[10px] text-[#5f6368]">{selectedAgent.message_count} responses total</div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-[#5f6368] hover:text-[#9aa0a6] transition-colors ml-1 text-sm"
            >✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
