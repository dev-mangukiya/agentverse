"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrainIcon, MicroscopeIcon, CodeIcon, PenIcon, SearchIcon, BarChartIcon, PuzzleIcon, FileTextIcon, FilePlusIcon } from "../icons/Icons";

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

interface LayoutNode extends AgentNode {
  cx: number; // pixel x center
  cy: number; // pixel y center
}

const statusColors: Record<string, string> = {
  active: "var(--green)",
  working: "var(--yellow)",
  idle: "var(--text-faint)",
};

const agentIcons: Record<string, React.ReactNode> = {
  orchestrator: <BrainIcon size={18} />,
  research: <MicroscopeIcon size={15} />,
  coding: <CodeIcon size={15} />,
  writer: <PenIcon size={15} />,
  critic: <SearchIcon size={15} />,
  data: <BarChartIcon size={15} />,
  data_analyst: <BarChartIcon size={15} />,
  doc_reader: <FileTextIcon size={15} />,
  doc_generator: <FilePlusIcon size={15} />,
  memory: <PuzzleIcon size={15} />,
};

/**
 * Compute pixel-based hub-and-spoke layout.
 * Orchestrator sits dead-center; satellites form an even ring around it.
 */
function computeLayout(agents: AgentNode[], width: number, height: number): LayoutNode[] {
  const orchestrator = agents.find(a => a.id === "orchestrator");
  const satellites = agents.filter(a => a.id !== "orchestrator");

  const cx = width / 2;
  const cy = height / 2;

  // Radius adapts to the smaller dimension, with a generous margin for labels
  const radius = Math.min(width, height) * 0.34;

  const positioned: LayoutNode[] = [];

  if (orchestrator) {
    positioned.push({ ...orchestrator, cx, cy });
  }

  satellites.forEach((agent, i) => {
    // Start from top (-90°), distribute evenly
    const angle = (2 * Math.PI * i) / satellites.length - Math.PI / 2;
    const ax = cx + radius * Math.cos(angle);
    const ay = cy + radius * Math.sin(angle);
    positioned.push({ ...agent, cx: ax, cy: ay });
  });

  return positioned;
}

/**
 * Compute the shortened start and end points of an edge so the line
 * stops cleanly at each node's border instead of overlapping it.
 */
function computeEdgeEndpoints(
  x1: number, y1: number, x2: number, y2: number,
  r1: number, r2: number
): { sx: number; sy: number; ex: number; ey: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist === 0) return { sx: x1, sy: y1, ex: x2, ey: y2 };

  const ux = dx / dist;
  const uy = dy / dist;

  return {
    sx: x1 + ux * r1,
    sy: y1 + uy * r1,
    ex: x2 - ux * r2,
    ey: y2 - uy * r2,
  };
}

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const [rawAgents, setRawAgents] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Resize observer ──────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Data fetching ────────────────────────────────────────────
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

  // ── Layout computation ───────────────────────────────────────
  const agents = useMemo(
    () => computeLayout(rawAgents, dimensions.width, dimensions.height),
    [rawAgents, dimensions.width, dimensions.height]
  );

  const totalMessages = agents.reduce((s, a) => s + a.message_count, 0);
  const selectedAgent = agents.find(a => a.id === selected);

  // Node radii for edge endpoint shortening
  const orchRadius = 34; // half of 68px node
  const satRadius = 26;  // half of 52px node

  // Hub → satellite edges
  const hubEdges = useMemo(() => {
    return agents
      .filter(a => a.id !== "orchestrator")
      .map(a => ({ from: "orchestrator", to: a.id }));
  }, [agents]);

  // Set of connected agent IDs when hovering
  const connectedTo = useMemo(() => {
    if (!hovered) return null;
    const connected = new Set<string>();
    connected.add(hovered);
    edges.forEach(e => {
      if (e.from === hovered) connected.add(e.to);
      if (e.to === hovered) connected.add(e.from);
    });
    if (hovered === "orchestrator") {
      agents.forEach(a => connected.add(a.id));
    } else {
      connected.add("orchestrator");
    }
    return connected;
  }, [hovered, edges, agents]);

  const getNode = useCallback(
    (id: string) => agents.find(a => a.id === id),
    [agents]
  );

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[320px] md:h-[520px]";

  return (
    <div className={`glass-panel-premium ${height} relative overflow-hidden flex flex-col max-w-full`}>
      {/* Subtle radial background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, var(--brand-dim) 0%, transparent 65%)`,
          opacity: 0.25,
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

      {/* Graph area — single coordinate system */}
      <div ref={containerRef} className="flex-1 relative" style={{ zIndex: 2 }}>
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
        ) : dimensions.width > 0 && (
          <>
            {/* ── SVG layer: edges + arrows + flow dots ── */}
            <svg
              className="absolute inset-0"
              width={dimensions.width}
              height={dimensions.height}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              style={{ zIndex: 1 }}
            >
              <defs>
                {/* Arrowhead — default: filled triangle, clearly visible */}
                <marker
                  id="arrow-default"
                  markerWidth="10"
                  markerHeight="8"
                  refX="9"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 0 0.5 L 9 4 L 0 7.5 Z"
                    fill="var(--brand)"
                    fillOpacity="0.35"
                  />
                </marker>

                {/* Arrowhead — highlighted: larger filled triangle */}
                <marker
                  id="arrow-highlight"
                  markerWidth="12"
                  markerHeight="10"
                  refX="11"
                  refY="5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 0 0.5 L 11 5 L 0 9.5 Z"
                    fill="var(--brand)"
                    fillOpacity="0.8"
                  />
                </marker>
              </defs>

              {/* Decorative orbit ring */}
              {agents.find(a => a.id === "orchestrator") && (
                <circle
                  cx={agents.find(a => a.id === "orchestrator")!.cx}
                  cy={agents.find(a => a.id === "orchestrator")!.cy}
                  r={Math.min(dimensions.width, dimensions.height) * 0.34}
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth="1"
                  strokeOpacity="0.1"
                  strokeDasharray="3 6"
                />
              )}

              {/* Edge lines — curved paths from orchestrator to each satellite */}
              {hubEdges.map((edge, i) => {
                const from = getNode(edge.from);
                const to = getNode(edge.to);
                if (!from || !to) return null;

                const isHighlighted =
                  hovered === "orchestrator" ||
                  hovered === edge.to ||
                  (hovered && connectedTo?.has(edge.to) && connectedTo?.has(edge.from));
                const isDimmed = hovered && !isHighlighted;

                const fromR = from.id === "orchestrator" ? orchRadius : satRadius;
                const toR = to.id === "orchestrator" ? orchRadius : satRadius;
                const { sx, sy, ex, ey } = computeEdgeEndpoints(
                  from.cx, from.cy, to.cx, to.cy, fromR + 2, toR + 4
                );

                // Compute a curved path: subtle bezier bulge perpendicular to the line
                const mx = (sx + ex) / 2;
                const my = (sy + ey) / 2;
                const dx = ex - sx;
                const dy = ey - sy;
                const len = Math.sqrt(dx * dx + dy * dy);
                // Perpendicular offset for the curve (subtle 12% bulge)
                const bulge = len * 0.12;
                const nx = -dy / len;
                const ny = dx / len;
                const cpx = mx + nx * bulge;
                const cpy = my + ny * bulge;

                const pathD = `M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`;

                return (
                  <path
                    key={`edge-${i}`}
                    d={pathD}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth={isHighlighted ? "1.8" : "1.2"}
                    strokeOpacity={isDimmed ? 0.06 : isHighlighted ? 0.65 : 0.3}
                    markerEnd={isHighlighted ? "url(#arrow-highlight)" : "url(#arrow-default)"}
                    style={{ transition: "all 0.3s ease" }}
                  />
                );
              })}

              {/* Animated flow dots on highlighted edges */}
              {hovered && hubEdges.map((edge, i) => {
                const from = getNode(edge.from);
                const to = getNode(edge.to);
                if (!from || !to) return null;

                const isHighlighted =
                  hovered === "orchestrator" || hovered === edge.to;
                if (!isHighlighted) return null;

                const fromR = from.id === "orchestrator" ? orchRadius : satRadius;
                const toR = to.id === "orchestrator" ? orchRadius : satRadius;
                const { sx, sy, ex, ey } = computeEdgeEndpoints(
                  from.cx, from.cy, to.cx, to.cy, fromR + 2, toR + 4
                );

                const mx = (sx + ex) / 2;
                const my = (sy + ey) / 2;
                const dx = ex - sx;
                const dy = ey - sy;
                const len = Math.sqrt(dx * dx + dy * dy);
                const bulge = len * 0.12;
                const nx = -dy / len;
                const ny = dx / len;
                const cpx = mx + nx * bulge;
                const cpy = my + ny * bulge;

                const pathD = `M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`;

                return (
                  <circle key={`dot-${i}`} r="3" fill="var(--brand)" opacity="0.6">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path={pathD}
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="linear"
                    />
                  </circle>
                );
              })}
            </svg>

            {/* ── Node layer ── */}
            <AnimatePresence>
              {agents.map((agent, i) => {
                const isOrch = agent.id === "orchestrator";
                const isSelected = selected === agent.id;
                const isHovered = hovered === agent.id;
                const isDimmed = hovered && !connectedTo?.has(agent.id);
                const nodeSize = isOrch ? 68 : 52;

                return (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{
                      opacity: isDimmed ? 0.18 : 1,
                      scale: isHovered ? 1.1 : 1,
                    }}
                    transition={{
                      delay: i * 0.05,
                      type: "spring",
                      stiffness: 260,
                      damping: 22,
                    }}
                    className="absolute cursor-pointer"
                    style={{
                      left: agent.cx,
                      top: agent.cy,
                      transform: "translate(-50%, -50%)",
                      zIndex: isSelected || isHovered ? 20 : 10,
                    }}
                    onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                    onMouseEnter={() => setHovered(agent.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {/* Orchestrator outer halo */}
                    {isOrch && (
                      <>
                        <div
                          className="absolute rounded-[22px] pointer-events-none"
                          style={{
                            inset: "-10px",
                            border: `1.5px solid ${agent.color}12`,
                            background: `radial-gradient(circle, ${agent.color}08, transparent)`,
                            animation: "breathe 3s ease-in-out infinite",
                          }}
                        />
                        <div
                          className="absolute rounded-[26px] pointer-events-none"
                          style={{
                            inset: "-18px",
                            border: `1px solid ${agent.color}08`,
                          }}
                        />
                      </>
                    )}

                    {/* Node body */}
                    <div
                      className="network-node-body flex items-center justify-center relative"
                      style={{
                        width: `${nodeSize}px`,
                        height: `${nodeSize}px`,
                        borderRadius: isOrch ? "20px" : "16px",
                        backgroundColor: `color-mix(in srgb, ${agent.color} 10%, var(--bg-panel))`,
                        border: `1.5px solid ${isSelected || isHovered ? agent.color : `${agent.color}22`}`,
                        boxShadow: isSelected
                          ? `0 0 24px ${agent.color}30, 0 8px 20px rgba(0,0,0,0.2)`
                          : isHovered
                            ? `0 0 18px ${agent.color}20, 0 6px 16px rgba(0,0,0,0.15)`
                            : `0 2px 10px rgba(0,0,0,0.12)`,
                        transition: "all 0.25s ease",
                      }}
                    >
                      {/* Inner gradient shine */}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          borderRadius: "inherit",
                          background: `linear-gradient(135deg, ${agent.color}0D 0%, transparent 60%)`,
                        }}
                      />
                      <span
                        className="relative select-none"
                        style={{
                          color: agent.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {agentIcons[agent.id] || agent.label[0]}
                      </span>
                    </div>

                    {/* Status indicator */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: isOrch ? "11px" : "9px",
                        height: isOrch ? "11px" : "9px",
                        bottom: isOrch ? "0px" : "-1px",
                        right: isOrch ? "0px" : "-1px",
                        backgroundColor: statusColors[agent.status],
                        border: "2px solid var(--bg-panel)",
                        boxShadow: `0 0 6px ${statusColors[agent.status]}`,
                      }}
                    />

                    {/* Label + message count */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none whitespace-nowrap network-node-label"
                      style={{ top: `${nodeSize + 6}px` }}
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

      {/* Detail panel */}
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
            <div
              style={{
                height: "2px",
                background: `linear-gradient(90deg, ${selectedAgent.color}, ${selectedAgent.color}40, transparent)`,
              }}
            />
            <div className="px-4 py-3 flex items-center gap-3">
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
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {selectedAgent.label}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {selectedAgent.role}
                </div>
              </div>
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
              <button
                onClick={() => setSelected(null)}
                className="ml-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
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
