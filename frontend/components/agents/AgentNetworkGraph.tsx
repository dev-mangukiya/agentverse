"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ReactFlow,
  Handle,
  Position,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
  type NodeProps,
  BaseEdge,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  BrainIcon,
  MicroscopeIcon,
  CodeIcon,
  PenIcon,
  SearchIcon,
  BarChartIcon,
  FileTextIcon,
  FilePlusIcon,
} from "../icons/Icons";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

interface AgentData {
  id: string;
  label: string;
  role: string;
  status: "active" | "idle" | "working";
  color: string;
  message_count: number;
  last_seen: string | null;
}


const statusColors: Record<string, string> = {
  active: "var(--green)",
  working: "var(--yellow)",
  idle: "var(--text-faint)",
};

const agentIcons: Record<string, React.ReactNode> = {
  orchestrator: <BrainIcon size={14} />,
  research: <MicroscopeIcon size={14} />,
  coding: <CodeIcon size={14} />,
  writer: <PenIcon size={14} />,
  critic: <SearchIcon size={14} />,
  data: <BarChartIcon size={14} />,
  data_analyst: <BarChartIcon size={14} />,
  doc_reader: <FileTextIcon size={14} />,
  doc_generator: <FilePlusIcon size={14} />,
};

/* ─── Custom Node: Orchestrator ───────────────────────────── */

type OrchestratorNodeData = AgentData & {
  isHovered: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  [key: string]: unknown;
};

function OrchestratorNode({ data: rawData }: NodeProps) {
  const data = rawData as unknown as OrchestratorNodeData;
  const { isHovered, isSelected, isDimmed, color } = data;
  const size = 60;

  return (
    <div
      style={{
        opacity: isDimmed ? 0.2 : 1,
        transform: isHovered ? "scale(1.08)" : "scale(1)",
        transition: "opacity 0.3s ease, transform 0.25s ease",
        cursor: "pointer",
        position: "relative",
      }}
      onMouseEnter={() => data.onHover(data.id)}
      onMouseLeave={() => data.onHover(null)}
      onClick={() => data.onSelect(data.id)}
    >
      {/* Handles on all sides so edges connect to boundary */}
      <Handle type="source" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="source" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />

      {/* Outer glow ring */}
      <div
        style={{
          position: "absolute",
          inset: "-6px",
          borderRadius: "18px",
          border: `1px solid ${color}18`,
          background: `radial-gradient(circle, ${color}06, transparent)`,
          pointerEvents: "none",
        }}
      />

      {/* Node body */}
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "18px",
          backgroundColor: `color-mix(in srgb, ${color} 10%, var(--bg-panel))`,
          border: `1.5px solid ${isSelected || isHovered ? color : `${color}25`}`,
          boxShadow: isSelected
            ? `0 0 20px ${color}25, 0 4px 12px rgba(0,0,0,0.15)`
            : isHovered
              ? `0 0 14px ${color}18, 0 4px 12px rgba(0,0,0,0.1)`
              : `0 2px 8px rgba(0,0,0,0.1)`,
          transition: "all 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* Subtle inner gradient */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: `linear-gradient(135deg, ${color}0A 0%, transparent 50%)`,
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "relative",
            fontWeight: "bold",
            fontSize: "17px",
            color: color,
            letterSpacing: "-0.3px",
          }}
        >
          {agentIcons[data.id] || data.label[0]}
        </span>
      </div>

      {/* Status dot */}
      <div
        style={{
          position: "absolute",
          width: "9px",
          height: "9px",
          bottom: "-1px",
          right: "-1px",
          borderRadius: "50%",
          backgroundColor: statusColors[data.status],
          border: "2px solid var(--bg-panel)",
          boxShadow: `0 0 4px ${statusColors[data.status]}`,
        }}
      />

      {/* Label */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: `${size + 5}px`,
          textAlign: "center",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            lineHeight: 1.2,
            color: isHovered || isSelected ? "var(--text-primary)" : "var(--text-muted)",
            transition: "color 0.2s ease",
          }}
        >
          Orchestrator
        </div>
        {data.message_count > 0 && (
          <div style={{ fontSize: "9px", marginTop: "2px", fontWeight: 500, color: "var(--text-faint)" }}>
            {data.message_count} msgs
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Custom Node: Agent ──────────────────────────────────── */

type AgentNodeData = AgentData & {
  isHovered: boolean;
  isSelected: boolean;
  isDimmed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  [key: string]: unknown;
};

function AgentNode({ data: rawData }: NodeProps) {
  const data = rawData as unknown as AgentNodeData;
  const { isHovered, isSelected, isDimmed, color } = data;
  const size = 48;

  return (
    <div
      style={{
        opacity: isDimmed ? 0.2 : 1,
        transform: isHovered ? "scale(1.08)" : "scale(1)",
        transition: "opacity 0.3s ease, transform 0.25s ease",
        cursor: "pointer",
        position: "relative",
      }}
      onMouseEnter={() => data.onHover(data.id)}
      onMouseLeave={() => data.onHover(null)}
      onClick={() => data.onSelect(data.id)}
    >
      {/* Handles on all sides */}
      <Handle type="target" position={Position.Top} id="top" style={handleStyle} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />
      <Handle type="target" position={Position.Right} id="right" style={handleStyle} />

      {/* Node body */}
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "14px",
          backgroundColor: `color-mix(in srgb, ${color} 10%, var(--bg-panel))`,
          border: `1.5px solid ${isSelected || isHovered ? color : `${color}25`}`,
          boxShadow: isSelected
            ? `0 0 20px ${color}25, 0 4px 12px rgba(0,0,0,0.15)`
            : isHovered
              ? `0 0 14px ${color}18, 0 4px 12px rgba(0,0,0,0.1)`
              : `0 2px 8px rgba(0,0,0,0.1)`,
          transition: "all 0.25s ease",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            background: `linear-gradient(135deg, ${color}0A 0%, transparent 50%)`,
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "relative",
            fontWeight: "bold",
            fontSize: "14px",
            color: color,
            letterSpacing: "-0.3px",
          }}
        >
          {agentIcons[data.id] || data.label[0]}
        </span>
      </div>

      {/* Status dot */}
      <div
        style={{
          position: "absolute",
          width: "9px",
          height: "9px",
          bottom: "-1px",
          right: "-1px",
          borderRadius: "50%",
          backgroundColor: statusColors[data.status],
          border: "2px solid var(--bg-panel)",
          boxShadow: `0 0 4px ${statusColors[data.status]}`,
        }}
      />

      {/* Label */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          top: `${size + 5}px`,
          textAlign: "center",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 600,
            lineHeight: 1.2,
            color: isHovered || isSelected ? "var(--text-primary)" : "var(--text-muted)",
            transition: "color 0.2s ease",
          }}
        >
          {data.label}
        </div>
        {data.message_count > 0 && (
          <div style={{ fontSize: "9px", marginTop: "2px", fontWeight: 500, color: "var(--text-faint)" }}>
            {data.message_count} msgs
          </div>
        )}
      </div>
    </div>
  );
}

const handleStyle: React.CSSProperties = {
  width: 0,
  height: 0,
  border: "none",
  background: "transparent",
  minWidth: 0,
  minHeight: 0,
};

/* ─── Custom Edge ─────────────────────────────────────────── */

type NetworkEdgeData = {
  isHighlighted: boolean;
  isDimmed: boolean;
  isLive: boolean;
};

/* Inject a global @keyframes rule for the flowing-dash animation once */
if (typeof document !== "undefined") {
  const STYLE_ID = "agent-network-edge-keyframes";
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes agentNetworkDashFlow {
        to { stroke-dashoffset: -24; }
      }
    `;
    document.head.appendChild(style);
  }
}

function NetworkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data: rawData,
}: EdgeProps) {
  const data = rawData as unknown as NetworkEdgeData | undefined;
  const isHighlighted = data?.isHighlighted ?? false;
  const isDimmed = data?.isDimmed ?? false;
  const isLive = data?.isLive ?? false;

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 20,
  });

  // Determine visual state
  const strokeWidth = isLive ? 2.2 : isHighlighted ? 1.5 : 1;
  const strokeOpacity = isDimmed
    ? 0.06
    : isLive
      ? 0.85
      : isHighlighted
        ? 0.55
        : 0.22;

  return (
    <>
      {/* Glow layer for live edges */}
      {isLive && (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="6"
          strokeOpacity="0.15"
          strokeLinecap="round"
          style={{ pointerEvents: "none", filter: "blur(3px)" }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "var(--brand)",
          strokeWidth,
          strokeOpacity,
          strokeDasharray: isLive ? "8 16" : isHighlighted ? "none" : "5 6",
          transition: isLive ? "none" : "all 0.3s ease",
          pointerEvents: "none" as const,
          ...(isLive
            ? {
                animation: "agentNetworkDashFlow 0.6s linear infinite",
              }
            : {}),
        }}
      />
      {/* Traveling dot along edge — orchestrator → agent direction */}
      {isLive && (
        <circle r="3" fill="var(--brand)" opacity="0.8">
          <animateMotion
            dur="1.4s"
            repeatCount="indefinite"
            path={edgePath}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      )}
    </>
  );
}

const nodeTypes: NodeTypes = {
  orchestrator: OrchestratorNode,
  agent: AgentNode,
};

const edgeTypes: EdgeTypes = {
  network: NetworkEdge,
};

/* ─── Pick best handle side based on angle ────────────────── */

function getBestHandle(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { sourceHandle: string; targetHandle: string } {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const angle = Math.atan2(dy, dx); // radians, -PI to PI

  // Determine the exit side from source (orchestrator)
  let sourceHandle: string;
  let targetHandle: string;

  if (angle >= -Math.PI / 4 && angle < Math.PI / 4) {
    // Target is to the right
    sourceHandle = "right";
    targetHandle = "left";
  } else if (angle >= Math.PI / 4 && angle < (3 * Math.PI) / 4) {
    // Target is below
    sourceHandle = "bottom";
    targetHandle = "top";
  } else if (angle >= -(3 * Math.PI) / 4 && angle < -Math.PI / 4) {
    // Target is above
    sourceHandle = "top";
    targetHandle = "bottom";
  } else {
    // Target is to the left
    sourceHandle = "left";
    targetHandle = "right";
  }

  return { sourceHandle, targetHandle };
}

/* ─── Layout: hub-spoke pixel positions ───────────────────── */

function computeFlowLayout(agents: AgentData[]): { nodes: Node[]; edges: Edge[] } {
  const orchestrator = agents.find((a) => a.id === "orchestrator");
  const satellites = agents.filter((a) => a.id !== "orchestrator");

  const cx = 350;
  const cy = 220;
  const radius = 180;

  const nodes: Node[] = [];

  if (orchestrator) {
    nodes.push({
      id: orchestrator.id,
      type: "orchestrator",
      position: { x: cx - 30, y: cy - 30 }, // offset by half node size (60/2)
      data: { ...orchestrator },
      draggable: false,
    });
  }

  satellites.forEach((agent, i) => {
    const angle = (2 * Math.PI * i) / satellites.length - Math.PI / 2;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    nodes.push({
      id: agent.id,
      type: "agent",
      position: { x: x - 24, y: y - 24 }, // offset by half node size (48/2)
      data: { ...agent },
      draggable: false,
    });
  });

  // Edges from orchestrator to every satellite
  const edges: Edge[] = satellites.map((agent) => {
    // Compute center positions for handle selection
    const orchCx = cx;
    const orchCy = cy;
    const idx = satellites.indexOf(agent);
    const angle = (2 * Math.PI * idx) / satellites.length - Math.PI / 2;
    const agentCx = cx + radius * Math.cos(angle);
    const agentCy = cy + radius * Math.sin(angle);
    const { sourceHandle, targetHandle } = getBestHandle(orchCx, orchCy, agentCx, agentCy);

    return {
      id: `e-orchestrator-${agent.id}`,
      source: "orchestrator",
      target: agent.id,
      sourceHandle,
      targetHandle,
      type: "network",
      data: { isHighlighted: false, isDimmed: false },
    };
  });

  return { nodes, edges };
}

/* ─── Inner component (needs ReactFlowProvider) ───────────── */

function AgentNetworkGraphInner({ fullscreen }: { fullscreen?: boolean }) {
  const [rawAgents, setRawAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agents`);
        if (res.ok) {
          const data = await res.json();
          const fixed = (data.agents || []).map((a: AgentData) => ({
            ...a,
            label: a.label.replace(/_/g, " "),
          }));
          setRawAgents(fixed);
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

  const onHover = useCallback((id: string | null) => setHovered(id), []);
  const onSelect = useCallback(
    (id: string) => setSelected((prev) => (prev === id ? null : id)),
    []
  );

  /* ── ReactFlow-level event handlers (guaranteed to fire) ── */
  const handleNodeMouseEnter = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setHovered(node.id);
    },
    []
  );

  const handleNodeMouseLeave = useCallback(
    (_event: React.MouseEvent, _node: Node) => {
      setHovered(null);
    },
    []
  );

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelected((prev) => (prev === node.id ? null : node.id));
    },
    []
  );

  const handlePaneClick = useCallback(() => {
    setSelected(null);
    setHovered(null);
  }, []);

  // Compute which node IDs are connected to hovered
  const connectedTo = useMemo(() => {
    if (!hovered) return null;
    const connected = new Set<string>();
    connected.add(hovered);
    if (hovered === "orchestrator") {
      rawAgents.forEach((a) => connected.add(a.id));
    } else {
      connected.add("orchestrator");
      connected.add(hovered);
    }
    return connected;
  }, [hovered, rawAgents]);

  const { nodes: baseNodes, edges: baseEdges } = useMemo(
    () => computeFlowLayout(rawAgents),
    [rawAgents]
  );

  // Inject hover/select state into node and edge data
  const nodes: Node[] = useMemo(() => {
    return baseNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isHovered: hovered === node.id,
        isSelected: selected === node.id,
        isDimmed: hovered !== null && !connectedTo?.has(node.id),
        onHover,
        onSelect,
      },
    }));
  }, [baseNodes, hovered, selected, connectedTo, onHover, onSelect]);

  const edges: Edge[] = useMemo(() => {
    return baseEdges.map((edge) => {
      const isHighlighted =
        hovered === "orchestrator" ||
        hovered === edge.target ||
        (hovered !== null &&
          connectedTo?.has(edge.target) &&
          connectedTo?.has(edge.source));
      const isDimmed = hovered !== null && !isHighlighted;
      // Live: only the single edge to the specific hovered agent
      const isLive =
        hovered !== null &&
        hovered !== "orchestrator" &&
        edge.target === hovered;
      return {
        ...edge,
        data: { isHighlighted, isDimmed, isLive },
      };
    });
  }, [baseEdges, hovered, connectedTo]);

  const selectedAgent = rawAgents.find((a) => a.id === selected);
  const totalMessages = rawAgents.reduce((s, a) => s + a.message_count, 0);

  const height = fullscreen
    ? "h-full min-h-[600px]"
    : "h-[320px] md:h-[520px]";

  return (
    <div
      className={`glass-panel-premium ${height} relative overflow-hidden flex flex-col max-w-full`}
    >
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
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Agent Network
          </h3>
          <p
            className="text-xs mt-0.5"
            style={{ color: "var(--text-muted)" }}
          >
            {loading
              ? "Loading…"
              : `${rawAgents.length} agents · ${rawAgents.filter((a) => a.status !== "idle").length} active · ${totalMessages} messages`}
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
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}`,
                }}
              />
              <span
                className="text-[10px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1 relative" style={{ zIndex: 2, minHeight: 0 }}>
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
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={handleNodeClick}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onPaneClick={handlePaneClick}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={true}
            elementsSelectable={true}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
          >
            {/* cursor:pointer on nodes as interactive affordance */}
            <style>{`
              .react-flow__node { cursor: pointer !important; }
              .react-flow__node:hover { z-index: 20 !important; }
            `}</style>
          </ReactFlow>
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
                <span
                  className="font-bold"
                  style={{ color: selectedAgent.color, fontSize: "14px" }}
                >
                  {agentIcons[selectedAgent.id] || selectedAgent.label[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {selectedAgent.label}
                </div>
                <div
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
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
                  <span
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {selectedAgent.status === "active"
                      ? "Online"
                      : selectedAgent.status === "working"
                        ? "Active"
                        : "Idle"}
                  </span>
                </div>
                <div
                  className="text-[10px] mt-0.5 font-mono"
                  style={{ color: "var(--text-faint)" }}
                >
                  {selectedAgent.message_count} responses
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="ml-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                style={{
                  color: "var(--text-faint)",
                  backgroundColor: "var(--bg-hover)",
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M1 1l8 8M9 1l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Exported wrapper with ReactFlowProvider ─────────────── */

export function AgentNetworkGraph({ fullscreen }: { fullscreen?: boolean }) {
  return (
    <ReactFlowProvider>
      <AgentNetworkGraphInner fullscreen={fullscreen} />
    </ReactFlowProvider>
  );
}
