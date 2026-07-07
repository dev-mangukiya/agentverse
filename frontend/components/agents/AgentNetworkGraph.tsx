"use client";

import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";

interface AgentNode {
  id: string;
  label: string;
  role: string;
  status: "active" | "idle" | "working";
  color: string;
  x: number;
  y: number;
}

interface AgentEdge {
  from: string;
  to: string;
}

const agents: AgentNode[] = [
  { id: "orchestrator", label: "Chief Orchestrator", role: "Planning & Delegation", status: "active", color: "#4c6ef5", x: 50, y: 50 },
  { id: "research", label: "Research Agent", role: "Web Search & Analysis", status: "working", color: "#22c55e", x: 20, y: 25 },
  { id: "data", label: "Data Analyst", role: "Data Processing & Viz", status: "idle", color: "#a855f7", x: 80, y: 25 },
  { id: "coding", label: "Coding Agent", role: "Code Generation & Debug", status: "working", color: "#ec4899", x: 15, y: 75 },
  { id: "writer", label: "Writer Agent", role: "Content & Reports", status: "idle", color: "#f59e0b", x: 85, y: 75 },
  { id: "critic", label: "Critic Agent", role: "Quality & Evaluation", status: "active", color: "#06b6d4", x: 50, y: 90 },
  { id: "memory", label: "Memory Agent", role: "RAG & Vector Storage", status: "active", color: "#8b5cf6", x: 50, y: 15 },
];

const edges: AgentEdge[] = [
  { from: "orchestrator", to: "research" },
  { from: "orchestrator", to: "data" },
  { from: "orchestrator", to: "coding" },
  { from: "orchestrator", to: "writer" },
  { from: "orchestrator", to: "critic" },
  { from: "orchestrator", to: "memory" },
  { from: "research", to: "memory" },
  { from: "coding", to: "critic" },
  { from: "writer", to: "critic" },
];

const statusLabel: Record<string, string> = {
  active: "Online",
  working: "Working",
  idle: "Idle",
};

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const height = fullscreen ? "h-full min-h-[600px]" : "h-[420px]";

  return (
    <div className={`glass-panel p-5 ${height} relative overflow-hidden`}>
      <h3 className="text-sm font-semibold text-white mb-2">Agent Network</h3>
      <p className="text-xs text-zinc-500 mb-4">
        Real-time visualization of agent status and communication
      </p>

      <div className="relative w-full h-[calc(100%-60px)]">
        {/* SVG Edges */}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
          {edges.map((edge, i) => {
            const from = agents.find((a) => a.id === edge.from)!;
            const to = agents.find((a) => a.id === edge.to)!;
            return (
              <line
                key={i}
                x1={`${from.x}%`}
                y1={`${from.y}%`}
                x2={`${to.x}%`}
                y2={`${to.y}%`}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            );
          })}
        </svg>

        {/* Agent Nodes */}
        {agents.map((agent, i) => (
          <motion.div
            key={agent.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08, type: "spring", stiffness: 200 }}
            className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group cursor-pointer"
            style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
          >
            {/* Glow ring for working agents */}
            {agent.status === "working" && (
              <div
                className="absolute inset-0 rounded-full animate-ping"
                style={{
                  backgroundColor: agent.color,
                  opacity: 0.15,
                  margin: "-6px",
                }}
              />
            )}

            {/* Node circle */}
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 transition-transform duration-200 group-hover:scale-110"
              style={{
                backgroundColor: `${agent.color}20`,
                borderColor: `${agent.color}60`,
                boxShadow: `0 0 20px ${agent.color}30`,
              }}
            >
              {agent.label[0]}
            </div>

            {/* Tooltip */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-20">
              <div className="glass-panel-subtle px-3 py-2 text-center">
                <div className="text-xs font-semibold text-white">{agent.label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{agent.role}</div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: agent.color }}
                  />
                  <span className="text-[10px]" style={{ color: agent.color }}>
                    {statusLabel[agent.status]}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
