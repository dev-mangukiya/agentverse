"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LightbulbIcon,
  MicroscopeIcon,
  CodeIcon,
  PenIcon,
  SearchIcon,
  BarChartIcon,
  PuzzleIcon,
  FileTextIcon,
  FilePlusIcon,
} from "../icons/Icons";

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
  cx: number;
  cy: number;
  angle: number;
}

const statusColors: Record<string, string> = {
  active: "#10b981",
  working: "#f59e0b",
  idle: "#6b7280",
};

// Canonical agent colors matching the reference design
const AGENT_COLORS: Record<string, string> = {
  orchestrator: "#3b82f6",
  doc_reader: "#f97316",
  doc_generator: "#10b981",
  coding: "#ef4444",
  critic: "#06b6d4",
  data: "#a855f7",
  data_analyst: "#a855f7",
  writer: "#eab308",
  research: "#22c55e",
  memory: "#8b5cf6",
};

// Canonical clean labels matching reference design
const AGENT_LABELS: Record<string, string> = {
  orchestrator: "Orchestrator",
  doc_reader: "Doc Reader Agent",
  doc_generator: "Doc Generator Agent",
  coding: "Coding Agent",
  critic: "Critic Agent",
  data: "Data Agent",
  data_analyst: "Data Agent",
  writer: "Writer Agent",
  research: "Research Agent",
  memory: "Memory Agent",
};

// Icons matching reference design
const AGENT_ICONS: Record<string, (color: string) => React.ReactNode> = {
  orchestrator: (c) => <LightbulbIcon size={26} color={c} />,
  doc_reader: (c) => <FileTextIcon size={20} color={c} />,
  doc_generator: (c) => <FilePlusIcon size={20} color={c} />,
  coding: (c) => <CodeIcon size={20} color={c} />,
  critic: (c) => <SearchIcon size={20} color={c} />,
  data: (c) => <BarChartIcon size={20} color={c} />,
  data_analyst: (c) => <BarChartIcon size={20} color={c} />,
  writer: (c) => <PenIcon size={20} color={c} />,
  research: (c) => <MicroscopeIcon size={20} color={c} />,
  memory: (c) => <PuzzleIcon size={20} color={c} />,
};

// Exact clockwise clock positions:
// Top (12:00), Top-Right (1:30), Right (3:00), Bottom-Right (4:30),
// Bottom (6:00), Bottom-Left (7:30), Left (9:00), Top-Left (10:30)
const CLOCK_LAYOUT = [
  { id: "doc_reader",    angle: -Math.PI / 2 },        // Top (12:00, -90°)
  { id: "doc_generator", angle: -Math.PI / 4 },        // Top-Right (1:30, -45°)
  { id: "coding",        angle: 0 },                   // Right (3:00, 0°)
  { id: "critic",        angle: Math.PI / 4 },         // Bottom-Right (4:30, 45°)
  { id: "data",          angle: Math.PI / 2 },         // Bottom (6:00, 90°)
  { id: "writer",        angle: (3 * Math.PI) / 4 },   // Bottom-Left (7:30, 135°)
  { id: "research",      angle: Math.PI },             // Left (9:00, 180°)
  { id: "memory",        angle: -(3 * Math.PI) / 4 },  // Top-Left (10:30, -135°)
];

function normalizeId(id: string): string {
  if (id === "data_analyst") return "data";
  return id;
}

/**
 * Compute the radial layout with Orchestrator at exact center (cx, cy)
 * and the 8 satellites arranged symmetrically around it.
 */
function computeRadialLayout(
  agents: AgentNode[],
  width: number,
  height: number
): { orchestrator: LayoutNode; satellites: LayoutNode[]; radius: number; cx: number; cy: number } {
  // True geometric center of the canvas
  const cx = width / 2;
  const cy = height / 2;

  // Safe radius calculation:
  // - Center to top edge needs: radius + (node_height / 2) + top_margin (~75px)
  // - Center to bottom edge needs: radius + (node_height / 2) + label_height + bottom_margin (~85px)
  // - Center to sides needs: radius + (node_width / 2) + side_margin (~75px)
  const maxRadiusY = (height / 2) - 85;
  const maxRadiusX = (width / 2) - 75;
  const radius = Math.max(110, Math.min(maxRadiusY, maxRadiusX, 185));

  // Find live orchestrator or default
  const orchRaw = agents.find((a) => a.id === "orchestrator");
  const orchestrator: LayoutNode = {
    id: "orchestrator",
    label: AGENT_LABELS.orchestrator,
    role: orchRaw?.role || "System Coordinator",
    status: orchRaw?.status || "active",
    color: AGENT_COLORS.orchestrator,
    x: 0,
    y: 0,
    message_count: orchRaw?.message_count ?? 174,
    last_seen: orchRaw?.last_seen || null,
    cx,
    cy,
    angle: 0,
  };

  // Build the 8 satellites mapped directly to their clock slots
  const satellites: LayoutNode[] = CLOCK_LAYOUT.map((slot) => {
    const raw = agents.find((a) => normalizeId(a.id) === slot.id);
    const ax = cx + radius * Math.cos(slot.angle);
    const ay = cy + radius * Math.sin(slot.angle);

    return {
      id: slot.id,
      label: AGENT_LABELS[slot.id] || raw?.label || slot.id,
      role: raw?.role || "Specialized Agent",
      status: raw?.status || "active",
      color: AGENT_COLORS[slot.id] || raw?.color || "#6366f1",
      x: 0,
      y: 0,
      message_count: raw?.message_count ?? 0,
      last_seen: raw?.last_seen || null,
      cx: ax,
      cy: ay,
      angle: slot.angle,
    };
  });

  return { orchestrator, satellites, radius, cx, cy };
}

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  const [rawAgents, setRawAgents] = useState<AgentNode[]>([]);
  const [edges, setEdges] = useState<AgentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // ResizeObserver to track exact container dimensions
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch live agent stats
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agents`);
        if (res.ok) {
          const data = await res.json();
          setRawAgents(data.agents || []);
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

  const { orchestrator, satellites, radius: orbitRadius, cx, cy } = useMemo(
    () => computeRadialLayout(rawAgents, dimensions.width, dimensions.height),
    [rawAgents, dimensions.width, dimensions.height]
  );

  const allAgents = useMemo(() => [orchestrator, ...satellites], [orchestrator, satellites]);
  const totalMessages = allAgents.reduce((s, a) => s + a.message_count, 0);
  const selectedAgent = allAgents.find((a) => a.id === selected);

  const connectedTo = useMemo(() => {
    if (!hovered) return null;
    const connected = new Set<string>();
    connected.add(hovered);
    edges.forEach((e) => {
      if (e.from === hovered) connected.add(e.to);
      if (e.to === hovered) connected.add(e.from);
    });
    if (hovered === "orchestrator") {
      allAgents.forEach((a) => connected.add(a.id));
    } else {
      connected.add("orchestrator");
    }
    return connected;
  }, [hovered, edges, allAgents]);

  const height = fullscreen ? "h-full min-h-[600px]" : "h-[500px] md:h-[560px]";

  // Exact radial boundary distances:
  // - Orchestrator outer frame boundary: 54px from center
  // - Satellite outer card boundary: 34px from center
  const orchBoundary = 54;
  const satBoundary = 34;

  return (
    <div className={`glass-panel-premium ${height} relative overflow-hidden flex flex-col max-w-full`}>
      {/* Subtle ambient radial background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(99,102,241,0.06) 0%, transparent 70%)`,
          zIndex: 0,
        }}
      />

      {/* Card Header */}
      <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-1 flex-shrink-0 relative z-10">
        <div>
          <h3 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Agent Network
          </h3>
          <p className="text-xs mt-0.5 font-medium" style={{ color: "var(--text-muted)" }}>
            {loading
              ? "Loading…"
              : `${allAgents.length} agents · ${allAgents.filter((a) => a.status !== "idle").length} active · ${totalMessages} messages`}
          </p>
        </div>
        <div className="flex items-center gap-3 md:gap-4">
          {[
            { color: "#10b981", label: "Online" },
            { color: "#f59e0b", label: "Active" },
            { color: "#6b7280", label: "Idle" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}80` }}
              />
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Radial Graph Canvas */}
      <div ref={containerRef} className="flex-1 relative w-full h-full min-h-0" style={{ zIndex: 2 }}>
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
        ) : dimensions.width > 0 && dimensions.height > 0 && (
          <>
            {/* ── SVG Layer: Centered Orbit Ring + Clean Radial Connecting Arrows ── */}
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              width={dimensions.width}
              height={dimensions.height}
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              style={{ zIndex: 1 }}
            >
              <defs>
                {/* Arrowhead pointing outward (to satellite) */}
                <marker
                  id="arrow-outward"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 1.5 1.5 L 6 4 L 1.5 6.5"
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>

                {/* Arrowhead pointing inward (to orchestrator) */}
                <marker
                  id="arrow-inward"
                  markerWidth="8"
                  markerHeight="8"
                  refX="2"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 6.5 1.5 L 2 4 L 6.5 6.5"
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>

                {/* Highlighted Arrowhead (outward) */}
                <marker
                  id="arrow-outward-active"
                  markerWidth="9"
                  markerHeight="9"
                  refX="7"
                  refY="4.5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 1.5 1.5 L 7 4.5 L 1.5 7.5"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>

                {/* Highlighted Arrowhead (inward) */}
                <marker
                  id="arrow-inward-active"
                  markerWidth="9"
                  markerHeight="9"
                  refX="2"
                  refY="4.5"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path
                    d="M 7.5 1.5 L 2 4.5 L 7.5 7.5"
                    fill="none"
                    stroke="#818cf8"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </marker>
              </defs>

              {/* Dotted Circular Guide centered exactly on the Orchestrator */}
              <circle
                cx={cx}
                cy={cy}
                r={orbitRadius}
                fill="none"
                stroke="var(--brand)"
                strokeWidth="1.2"
                strokeOpacity="0.15"
                strokeDasharray="4 6"
              />

              {/* Connecting Radial Arrows: from Orchestrator edge to Satellite edge */}
              {satellites.map((sat, i) => {
                const isHighlighted =
                  hovered === "orchestrator" ||
                  hovered === sat.id ||
                  (hovered && connectedTo?.has(sat.id) && connectedTo?.has("orchestrator"));
                const isDimmed = hovered && !isHighlighted;

                // Endpoints calculated on the exact radial ray
                const cosA = Math.cos(sat.angle);
                const sinA = Math.sin(sat.angle);

                const sx = cx + orchBoundary * cosA;
                const sy = cy + orchBoundary * sinA;
                const ex = sat.cx - satBoundary * cosA;
                const ey = sat.cy - satBoundary * sinA;

                return (
                  <line
                    key={`edge-${i}`}
                    x1={sx}
                    y1={sy}
                    x2={ex}
                    y2={ey}
                    stroke={isHighlighted ? "#818cf8" : "#6366f1"}
                    strokeWidth={isHighlighted ? "1.8" : "1.4"}
                    strokeOpacity={isDimmed ? 0.08 : isHighlighted ? 1 : 0.75}
                    markerStart={isHighlighted ? "url(#arrow-inward-active)" : "url(#arrow-inward)"}
                    markerEnd={isHighlighted ? "url(#arrow-outward-active)" : "url(#arrow-outward)"}
                    style={{ transition: "all 0.2s ease" }}
                  />
                );
              })}

              {/* Animated pulse dots along highlighted connection paths */}
              {hovered && satellites.map((sat, i) => {
                const isHighlighted = hovered === "orchestrator" || hovered === sat.id;
                if (!isHighlighted) return null;

                const cosA = Math.cos(sat.angle);
                const sinA = Math.sin(sat.angle);
                const sx = cx + orchBoundary * cosA;
                const sy = cy + orchBoundary * sinA;
                const ex = sat.cx - satBoundary * cosA;
                const ey = sat.cy - satBoundary * sinA;

                return (
                  <circle key={`flow-${i}`} r="3" fill="#818cf8" opacity="0.95">
                    <animateMotion
                      dur="1.4s"
                      repeatCount="indefinite"
                      path={`M ${sx} ${sy} L ${ex} ${ey}`}
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="linear"
                    />
                  </circle>
                );
              })}
            </svg>

            {/* ── Node Layer ── */}

            {/* 1. Orchestrator Card (Dead Center) */}
            <motion.div
              key="orchestrator"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: hovered === "orchestrator" ? 1.04 : 1,
              }}
              transition={{ duration: 0.3 }}
              className="absolute cursor-pointer flex flex-col items-center"
              style={{
                left: orchestrator.cx,
                top: orchestrator.cy,
                transform: "translate(-50%, -50%)",
                zIndex: 30,
              }}
              onClick={() => setSelected(selected === "orchestrator" ? null : "orchestrator")}
              onMouseEnter={() => setHovered("orchestrator")}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Concentric Frame 2 (Outermost soft glowing ring) */}
              <div
                className="absolute rounded-[28px] pointer-events-none"
                style={{
                  width: "122px",
                  height: "116px",
                  border: "1px solid rgba(99,102,241,0.12)",
                  background: "rgba(99,102,241,0.03)",
                  boxShadow: "0 0 30px rgba(99,102,241,0.08)",
                }}
              />

              {/* Concentric Frame 1 (Middle frame) */}
              <div
                className="absolute rounded-[24px] pointer-events-none"
                style={{
                  width: "108px",
                  height: "102px",
                  border: "1px solid rgba(99,102,241,0.22)",
                  background: "rgba(99,102,241,0.04)",
                }}
              />

              {/* Main Orchestrator Card */}
              <div
                className="relative rounded-[20px] flex flex-col items-center justify-center select-none"
                style={{
                  width: "94px",
                  height: "88px",
                  backgroundColor: "color-mix(in srgb, #3b82f6 12%, var(--bg-panel, #ffffff))",
                  border: `1.8px solid ${
                    selected === "orchestrator" || hovered === "orchestrator"
                      ? "#3b82f6"
                      : "rgba(59,130,246,0.55)"
                  }`,
                  boxShadow:
                    selected === "orchestrator" || hovered === "orchestrator"
                      ? "0 8px 24px rgba(59,130,246,0.25), 0 2px 8px rgba(0,0,0,0.08)"
                      : "0 4px 16px rgba(59,130,246,0.12), 0 2px 6px rgba(0,0,0,0.04)",
                  transition: "all 0.25s ease",
                }}
              >
                {/* Lightbulb Icon */}
                <div className="flex items-center justify-center mb-1">
                  {AGENT_ICONS.orchestrator("#3b82f6")}
                </div>

                {/* Orchestrator Label inside card */}
                <span
                  className="text-[12px] font-bold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  Orchestrator
                </span>

                {/* Green Status Dot */}
                <div
                  className="absolute rounded-full"
                  style={{
                    width: "11px",
                    height: "11px",
                    bottom: "3px",
                    right: "3px",
                    backgroundColor: "#10b981",
                    border: "2px solid var(--bg-panel, #ffffff)",
                    boxShadow: "0 0 6px rgba(16,185,129,0.6)",
                  }}
                />
              </div>

              {/* Message Count under Orchestrator Card */}
              <div
                className="text-[11px] font-medium mt-1.5 whitespace-nowrap pointer-events-none"
                style={{ color: "var(--text-muted)" }}
              >
                {orchestrator.message_count > 0 ? `${orchestrator.message_count} msgs` : "Active"}
              </div>
            </motion.div>

            {/* 2. Symmetrical Radial Satellites */}
            {satellites.map((agent, i) => {
              const isSelected = selected === agent.id;
              const isHovered = hovered === agent.id;
              const isDimmed = hovered && !connectedTo?.has(agent.id);

              return (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{
                    opacity: isDimmed ? 0.2 : 1,
                    scale: isHovered ? 1.08 : 1,
                  }}
                  transition={{
                    delay: i * 0.04,
                    type: "spring",
                    stiffness: 280,
                    damping: 24,
                  }}
                  className="absolute cursor-pointer flex flex-col items-center"
                  style={{
                    left: agent.cx,
                    top: agent.cy,
                    transform: "translate(-50%, -50%)",
                    zIndex: isSelected || isHovered ? 25 : 15,
                  }}
                  onClick={() => setSelected(isSelected ? null : agent.id)}
                  onMouseEnter={() => setHovered(agent.id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {/* Satellite Card */}
                  <div
                    className="relative rounded-[18px] flex items-center justify-center select-none"
                    style={{
                      width: "60px",
                      height: "60px",
                      backgroundColor: `color-mix(in srgb, ${agent.color} 14%, var(--bg-panel, #ffffff))`,
                      border: `1.5px solid ${
                        isSelected || isHovered
                          ? agent.color
                          : `color-mix(in srgb, ${agent.color} 30%, transparent)`
                      }`,
                      boxShadow:
                        isSelected || isHovered
                          ? `0 6px 20px ${agent.color}33, 0 2px 6px rgba(0,0,0,0.06)`
                          : `0 3px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)`,
                      transition: "all 0.25s ease",
                    }}
                  >
                    {/* Icon */}
                    <div className="flex items-center justify-center">
                      {(AGENT_ICONS[agent.id] || AGENT_ICONS[normalizeId(agent.id)])?.(agent.color) || (
                        <span className="font-bold text-sm" style={{ color: agent.color }}>
                          {agent.label[0]}
                        </span>
                      )}
                    </div>

                    {/* Status Dot */}
                    <div
                      className="absolute rounded-full"
                      style={{
                        width: "9px",
                        height: "9px",
                        bottom: "-1px",
                        right: "-1px",
                        backgroundColor: statusColors[agent.status] || "#10b981",
                        border: "2px solid var(--bg-panel, #ffffff)",
                        boxShadow: `0 0 5px ${(statusColors[agent.status] || "#10b981")}80`,
                      }}
                    />
                  </div>

                  {/* Satellite Label & Message Count below Card */}
                  <div className="text-center pointer-events-none whitespace-nowrap mt-1.5">
                    <div
                      className="text-[11px] font-semibold leading-tight"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {agent.label}
                    </div>
                    <div
                      className="text-[10px] mt-0.5 font-normal"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {agent.message_count > 0 ? `${agent.message_count} msgs` : "0 msgs"}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </>
        )}
      </div>

      {/* Selected Agent Bottom Drawer */}
      <AnimatePresence>
        {selectedAgent && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="absolute bottom-3 left-3 right-3 z-40"
            style={{
              background: "var(--glass-bg)",
              backdropFilter: "blur(20px) saturate(1.3)",
              WebkitBackdropFilter: "blur(20px) saturate(1.3)",
              border: "1px solid var(--glass-border)",
              borderRadius: "16px",
              boxShadow: "0 12px 36px rgba(0,0,0,0.25)",
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
                  backgroundColor: `color-mix(in srgb, ${selectedAgent.color} 14%, var(--bg-panel))`,
                  border: `1px solid ${selectedAgent.color}40`,
                }}
              >
                {(AGENT_ICONS[selectedAgent.id] || AGENT_ICONS[normalizeId(selectedAgent.id)])?.(
                  selectedAgent.color
                ) || (
                  <span className="font-bold text-sm" style={{ color: selectedAgent.color }}>
                    {selectedAgent.label[0]}
                  </span>
                )}
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
                      backgroundColor: statusColors[selectedAgent.status] || "#10b981",
                      boxShadow: `0 0 4px ${statusColors[selectedAgent.status] || "#10b981"}`,
                    }}
                  />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    {selectedAgent.status === "active"
                      ? "Online"
                      : selectedAgent.status === "working"
                      ? "Active"
                      : "Idle"}
                  </span>
                </div>
                <div className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--text-faint)" }}>
                  {selectedAgent.message_count} messages
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
