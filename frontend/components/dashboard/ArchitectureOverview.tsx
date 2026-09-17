"use client";

import React from "react";
import { motion } from "framer-motion";
import { AGENT_REGISTRY, getAgentIcon } from "@/config/agents";
import { DatabaseIcon, ZapIcon, SparklesIcon, BrainIcon } from "../icons/Icons";

/**
 * Static architecture diagram — "How AgentVerse Works"
 *
 * Shows Orchestrator at center, 7 specialist agents around it,
 * and the infrastructure layer (Postgres, Redis, Qdrant, LLM) below.
 * Uses the same agent registry icons/colors, same panel styling.
 */

const SPECIALIST_IDS = ["research", "coding", "writer", "critic", "data", "doc_reader", "doc_generator"];

const INFRA_ITEMS = [
  { label: "PostgreSQL", icon: <DatabaseIcon size={14} />, color: "var(--text-muted)" },
  { label: "Redis", icon: <ZapIcon size={14} />, color: "var(--text-muted)" },
  { label: "Qdrant", icon: <SparklesIcon size={14} />, color: "var(--text-muted)" },
  { label: "LLM Provider", icon: <BrainIcon size={14} />, color: "var(--text-muted)" },
];

export function ArchitectureOverview() {
  const orch = AGENT_REGISTRY.orchestrator;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          How AgentVerse Works
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
          Orchestrator routes requests to specialist agents, backed by persistent storage and vector memory
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
              return (
                <line
                  key={id}
                  x1={cx} y1={cy} x2={x2} y2={y2}
                  stroke="var(--border-subtle)"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  opacity="0.5"
                />
              );
            })}
            {/* Connection line: system → infra row */}
            <line x1="300" y1="100" x2="300" y2="230" stroke="var(--border-subtle)" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
          </svg>

          {/* Orchestrator — center */}
          <div
            className="absolute flex flex-col items-center gap-1"
            style={{ left: "50%", top: "100px", transform: "translate(-50%, -50%)" }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: `color-mix(in srgb, ${orch.color} 15%, var(--bg-elevated))`,
                border: `1.5px solid color-mix(in srgb, ${orch.color} 30%, transparent)`,
                color: orch.color,
              }}
            >
              {getAgentIcon("orchestrator", 20)}
            </div>
            <span className="text-[10px] font-semibold" style={{ color: "var(--text-primary)" }}>
              {orch.displayName}
            </span>
          </div>

          {/* Specialist agents — ellipse positions */}
          {SPECIALIST_IDS.map((id, i) => {
            const agent = AGENT_REGISTRY[id];
            const angle = (i / SPECIALIST_IDS.length) * Math.PI * 2 - Math.PI / 2;
            const cx = 50, cy = 38.5; // percentage
            const rx = 36.7, ry = 29;
            const xPct = cx + Math.cos(angle) * rx;
            const yPct = cy + Math.sin(angle) * ry;
            return (
              <div
                key={id}
                className="absolute flex flex-col items-center gap-0.5"
                style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%, -50%)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${agent.color} 12%, var(--bg-elevated))`,
                    border: `1px solid color-mix(in srgb, ${agent.color} 20%, transparent)`,
                    color: agent.color,
                  }}
                >
                  {getAgentIcon(id, 14)}
                </div>
                <span className="text-[9px] font-medium whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {agent.displayName}
                </span>
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
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-faint)",
                  }}
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
      {/* Reuses the same stacked card pattern from AgentAnalytics mobile view */}
      <div className="md:hidden px-3 pb-3 space-y-2">
        {/* Orchestrator card */}
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{
            backgroundColor: `color-mix(in srgb, ${orch.color} 6%, var(--bg-elevated))`,
            border: `1px solid color-mix(in srgb, ${orch.color} 15%, transparent)`,
          }}
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
              {orch.description} — routes to specialists below
            </div>
          </div>
        </div>

        {/* Specialist grid — 2 columns */}
        <div className="grid grid-cols-2 gap-2">
          {SPECIALIST_IDS.map((id) => {
            const agent = AGENT_REGISTRY[id];
            return (
              <div
                key={id}
                className="rounded-xl p-2.5 flex items-center gap-2"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                }}
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
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
          }}
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
    </motion.div>
  );
}
