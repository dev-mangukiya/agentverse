"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AGENT_REGISTRY, getAgentIcon } from "@/config/agents";
import { DatabaseIcon, ZapIcon, SparklesIcon, BrainIcon } from "../icons/Icons";
import type { PipelineAgent } from "@/components/chat/ChatPanel";

/** Traveling packet: animated dot along a connection line */
interface TravelingPacket {
  id: string;
  agentId: string;
  startTime: number;
  duration: number; // ms
}

/** Ease-out cubic — matches var(--ease-out) */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Interactive architecture diagram — "How AgentVerse Works"
 *
 * - Static at rest — zero animation when no pipeline is active
 * - Pulses agent nodes on real pipeline events (agent_activated/thinking/tool_call)
 * - Click any agent node for a detail popover showing real stats
 * - Respects prefers-reduced-motion
 */

const ALL_AGENT_IDS = ["orchestrator", "research", "coding", "writer", "critic", "data", "doc_reader", "doc_generator"];
const SPECIALIST_IDS = ["research", "coding", "writer", "critic", "data", "doc_reader", "doc_generator"];

const INFRA_ITEMS = [
  { label: "PostgreSQL", icon: <DatabaseIcon size={14} />, color: "var(--text-muted)" },
  { label: "Redis", icon: <ZapIcon size={14} />, color: "var(--text-muted)" },
  { label: "Qdrant", icon: <SparklesIcon size={14} />, color: "var(--text-muted)" },
  { label: "LLM Provider", icon: <BrainIcon size={14} />, color: "var(--text-muted)" },
];

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

interface AgentStat {
  name: string;
  total_messages: number;
  avg_response_ms: number | null;
  p50_response_ms: number | null;
  p95_response_ms: number | null;
  response_sample_count: number;
  last_active: string | null;
}

function formatMs(ms: number | null): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const hr = Math.floor(diff / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

interface Props {
  pipelineAgents: PipelineAgent[];
}

export function ArchitectureOverview({ pipelineAgents }: Props) {
  const orch = AGENT_REGISTRY.orchestrator;
  const [stats, setStats] = useState<AgentStat[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Traveling Packet Animation ─────────────────────────
  const [packets, setPackets] = useState<TravelingPacket[]>([]);
  const prevActiveRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>();
  const [, forceRender] = useState(0);

  // Detect new activations and spawn packets
  useEffect(() => {
    const currentActive = new Set(
      pipelineAgents
        .filter(a => ["activated", "thinking", "tool_call"].includes(a.status))
        .map(a => a.name.toLowerCase())
    );
    const prev = prevActiveRef.current;
    const newActivations = Array.from(currentActive).filter(id => !prev.has(id) && id !== "orchestrator");

    if (newActivations.length > 0) {
      const now = performance.now();
      const newPackets = newActivations.map(agentId => ({
        id: `${agentId}-${now}`,
        agentId,
        startTime: now,
        duration: 400,
      }));
      setPackets(p => [...p, ...newPackets]);
    }
    prevActiveRef.current = currentActive;
  }, [pipelineAgents]);

  // Animate packets via rAF — clean up completed ones
  useEffect(() => {
    if (packets.length === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const now = performance.now();
      const alive = packets.filter(p => now - p.startTime < p.duration);
      if (alive.length !== packets.length) {
        setPackets(alive);
      }
      forceRender(n => n + 1); // force re-render for smooth animation
      if (alive.length > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [packets]);

  /** Compute the SVG position of a packet along orchestrator→agent line */
  function getPacketPosition(packet: TravelingPacket): { x: number; y: number; opacity: number } | null {
    const idx = SPECIALIST_IDS.indexOf(packet.agentId);
    if (idx < 0) return null;
    const angle = (idx / SPECIALIST_IDS.length) * Math.PI * 2 - Math.PI / 2;
    const cx = 300, cy = 100;
    const rx = 220, ry = 75;
    const x2 = cx + Math.cos(angle) * rx;
    const y2 = cy + Math.sin(angle) * ry;
    const elapsed = performance.now() - packet.startTime;
    const t = Math.min(elapsed / packet.duration, 1);
    const eased = easeOutCubic(t);
    return {
      x: cx + (x2 - cx) * eased,
      y: cy + (y2 - cy) * eased,
      opacity: t < 0.9 ? 1 : 1 - (t - 0.9) / 0.1, // fade out in last 10%
    };
  }

  // Fetch agent stats (same endpoint as Agent Performance table)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agent-analytics`);
        if (res.ok) {
          const data = await res.json();
          setStats(data.agents || []);
        }
      } catch { /* silent */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Build a set of currently active agents from pipeline events
  const activeAgentIds = new Set(
    pipelineAgents
      .filter((a) => ["activated", "thinking", "tool_call"].includes(a.status))
      .map((a) => a.name.toLowerCase())
  );

  const handleNodeClick = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedAgent === agentId) {
      setSelectedAgent(null);
      return;
    }
    // Position popover relative to container
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPopoverPos({ x, y });
    }
    setSelectedAgent(agentId);
  }, [selectedAgent]);

  // Close popover on click outside
  const handleContainerClick = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  const selectedStat = stats.find((s) => s.name === selectedAgent);
  const selectedInfo = selectedAgent ? AGENT_REGISTRY[selectedAgent] || null : null;

  /** Render a single agent node (used by both desktop and mobile) */
  const AgentNode = ({ agentId, size = 32, iconSize = 14, className = "", style = {} }: {
    agentId: string; size?: number; iconSize?: number; className?: string; style?: React.CSSProperties;
  }) => {
    const agent = AGENT_REGISTRY[agentId] || AGENT_REGISTRY.orchestrator;
    const isActive = activeAgentIds.has(agentId);
    return (
      <button
        onClick={(e) => handleNodeClick(agentId, e)}
        className={`relative flex flex-col items-center gap-0.5 cursor-pointer group ${className}`}
        style={style}
        aria-label={`View ${agent.displayName} details`}
      >
        <div
          className={`rounded-xl flex items-center justify-center transition-transform ${isActive ? "arch-node-pulse" : ""}`}
          style={{
            width: size,
            height: size,
            backgroundColor: `color-mix(in srgb, ${agent.color} ${isActive ? "25%" : "12%"}, var(--bg-elevated))`,
            border: `${isActive ? "2px" : "1px"} solid color-mix(in srgb, ${agent.color} ${isActive ? "50%" : "20%"}, transparent)`,
            color: agent.color,
            boxShadow: isActive ? `0 0 12px 2px color-mix(in srgb, ${agent.color} 30%, transparent)` : "none",
            transition: "background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out), transform var(--duration-fast) var(--ease-out)",
          }}
        >
          {getAgentIcon(agentId, iconSize)}
        </div>
        <span
          className="text-[9px] font-medium whitespace-nowrap transition-colors"
          style={{
            color: isActive ? "var(--text-primary)" : "var(--text-muted)",
            transition: "color var(--duration-fast) var(--ease-out)",
          }}
        >
          {agent.displayName}
        </span>
      </button>
    );
  };

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
      }}
      onClick={handleContainerClick}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          How AgentVerse Works
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
          Orchestrator routes requests to specialist agents — click any node for live stats
        </p>
      </div>

      {/* ── Desktop: SVG diagram (hidden below md:) ──────────────── */}
      <div className="hidden md:block px-4 pb-4">
        <div className="relative" style={{ height: "260px" }}>
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 600 260"
            preserveAspectRatio="xMidYMid meet"
            fill="none"
          >
            {/* Connection lines: Orchestrator → specialists */}
            {SPECIALIST_IDS.map((id, i) => {
              const angle = (i / SPECIALIST_IDS.length) * Math.PI * 2 - Math.PI / 2;
              const cx = 300, cy = 100;
              const rx = 220, ry = 75;
              const x2 = cx + Math.cos(angle) * rx;
              const y2 = cy + Math.sin(angle) * ry;
              const isLineActive = activeAgentIds.has(id) || activeAgentIds.has("orchestrator");
              return (
                <line
                  key={id}
                  x1={cx} y1={cy} x2={x2} y2={y2}
                  stroke={isLineActive ? "var(--brand)" : "var(--border-subtle)"}
                  strokeWidth={isLineActive ? "1.5" : "1"}
                  strokeDasharray={isLineActive ? "none" : "4 3"}
                  opacity={isLineActive ? "0.6" : "0.5"}
                  style={{ transition: "stroke 0.3s, opacity 0.3s, stroke-width 0.3s" }}
                />
              );
            })}
            {/* Connection line: system → infra row */}
            <line x1="300" y1="100" x2="300" y2="230" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />

            {/* Traveling packets — only present during active requests */}
            {packets.map(packet => {
              const pos = getPacketPosition(packet);
              if (!pos) return null;
              return (
                <React.Fragment key={packet.id}>
                  {/* Glow */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={8}
                    fill="var(--brand-glow)"
                    opacity={pos.opacity * 0.4}
                  />
                  {/* Dot */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={3.5}
                    fill="var(--brand)"
                    opacity={pos.opacity}
                  />
                </React.Fragment>
              );
            })}
          </svg>

          {/* Orchestrator — center */}
          <div
            className="absolute"
            style={{ left: "50%", top: "100px", transform: "translate(-50%, -50%)" }}
          >
            <AgentNode agentId="orchestrator" size={44} iconSize={20} />
          </div>

          {/* Specialist agents — ellipse positions */}
          {SPECIALIST_IDS.map((id, i) => {
            const angle = (i / SPECIALIST_IDS.length) * Math.PI * 2 - Math.PI / 2;
            const cx = 50, cy = 38.5;
            const rx = 36.7, ry = 29;
            const xPct = cx + Math.cos(angle) * rx;
            const yPct = cy + Math.sin(angle) * ry;
            return (
              <div
                key={id}
                className="absolute"
                style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%, -50%)" }}
              >
                <AgentNode agentId={id} />
              </div>
            );
          })}

          {/* Infrastructure row */}
          <div
            className="absolute flex items-center justify-center gap-6"
            style={{ left: "50%", bottom: "0", transform: "translateX(-50%)" }}
          >
            {INFRA_ITEMS.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center"
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}
                >
                  {item.icon}
                </div>
                <span className="text-[9px] font-medium" style={{ color: "var(--text-faint)" }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Mobile: card grid (hidden at md: and above) ───────── */}
      <div className="md:hidden px-3 pb-3 space-y-2">
        {/* Orchestrator card */}
        <div
          className={`rounded-xl p-3 flex items-center gap-3 cursor-pointer ${activeAgentIds.has("orchestrator") ? "arch-node-pulse" : ""}`}
          style={{
            backgroundColor: `color-mix(in srgb, ${orch.color} ${activeAgentIds.has("orchestrator") ? "12%" : "6%"}, var(--bg-elevated))`,
            border: `1px solid color-mix(in srgb, ${orch.color} ${activeAgentIds.has("orchestrator") ? "30%" : "15%"}, transparent)`,
            boxShadow: activeAgentIds.has("orchestrator") ? `0 0 12px 2px color-mix(in srgb, ${orch.color} 20%, transparent)` : "none",
            transition: "background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
          }}
          onClick={(e) => handleNodeClick("orchestrator", e)}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: `color-mix(in srgb, ${orch.color} 15%, var(--bg-elevated))`,
              color: orch.color,
            }}
          >
            {getAgentIcon("orchestrator", 18)}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {orch.displayName}
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {orch.description} — routes to specialists
            </div>
          </div>
        </div>

        {/* Specialist grid — 2 columns */}
        <div className="grid grid-cols-2 gap-2">
          {SPECIALIST_IDS.map((id) => {
            const agent = AGENT_REGISTRY[id];
            const isActive = activeAgentIds.has(id);
            return (
              <div
                key={id}
                className={`rounded-xl p-2.5 flex items-center gap-2 cursor-pointer ${isActive ? "arch-node-pulse" : ""}`}
                style={{
                  backgroundColor: isActive ? `color-mix(in srgb, ${agent.color} 10%, var(--bg-elevated))` : "var(--bg-elevated)",
                  border: `1px solid ${isActive ? `color-mix(in srgb, ${agent.color} 25%, transparent)` : "var(--border-subtle)"}`,
                  boxShadow: isActive ? `0 0 8px 1px color-mix(in srgb, ${agent.color} 20%, transparent)` : "none",
                  transition: "background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
                }}
                onClick={(e) => handleNodeClick(id, e)}
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${agent.color} 12%, var(--bg-elevated))`,
                    color: agent.color,
                  }}
                >
                  {getAgentIcon(id, 13)}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium leading-tight" style={{ color: "var(--text-primary)" }}>
                    {agent.displayName}
                  </div>
                  <div className="text-[9px] leading-tight" style={{ color: "var(--text-faint)" }}>
                    {agent.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Infrastructure row */}
        <div
          className="rounded-xl p-2.5 flex items-center justify-around"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
        >
          {INFRA_ITEMS.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}
              >
                {item.icon}
              </div>
              <span className="text-[8px] font-medium" style={{ color: "var(--text-faint)" }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agent Detail Popover ──────────────────────────────── */}
      <AnimatePresence>
        {selectedAgent && selectedInfo && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-20 rounded-xl p-3 shadow-lg"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-subtle)",
              width: "220px",
              left: `${Math.min(popoverPos.x, (containerRef.current?.clientWidth || 400) - 230)}px`,
              top: `${Math.min(popoverPos.y + 10, (containerRef.current?.clientHeight || 300) - 160)}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Agent header */}
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: `color-mix(in srgb, ${selectedInfo.color} 15%, var(--bg-elevated))`,
                  color: selectedInfo.color,
                }}
              >
                {getAgentIcon(selectedAgent, 14)}
              </div>
              <div>
                <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selectedInfo.displayName}
                </div>
                <div className="text-[9px]" style={{ color: "var(--text-faint)" }}>
                  {selectedInfo.description}
                </div>
              </div>
            </div>

            {/* Stats */}
            {selectedStat ? (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Messages</span>
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {selectedStat.total_messages}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {selectedStat.p50_response_ms != null ? "p50 / p95" : "Avg Response"}
                  </span>
                  <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {selectedStat.p50_response_ms != null
                      ? `${formatMs(selectedStat.p50_response_ms)} / ${formatMs(selectedStat.p95_response_ms)}`
                      : formatMs(selectedStat.avg_response_ms)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>Last Active</span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {timeAgo(selectedStat.last_active)}
                  </span>
                </div>
                {selectedStat.response_sample_count > 0 && selectedStat.p50_response_ms == null && (
                  <div className="text-[9px] mt-1 pt-1" style={{ color: "var(--text-faint)", borderTop: "1px solid var(--border-subtle)" }}>
                    {selectedStat.response_sample_count} samples — need ≥20 for percentiles
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                No stats available yet
              </div>
            )}

            {/* Live status indicator */}
            {activeAgentIds.has(selectedAgent) && (
              <div className="flex items-center gap-1.5 mt-2 pt-1.5" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--yellow)" }} />
                <span className="text-[9px] font-medium" style={{ color: "var(--yellow)" }}>
                  Currently working
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
