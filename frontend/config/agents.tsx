"use client";

/**
 * Central Agent Registry — single source of truth for agent identity.
 *
 * Every surface (Dashboard, Agents page, Comparison, Chat, Pipeline)
 * must import from here. Do NOT define agent icons, colors, or display
 * names anywhere else.
 */

import React from "react";
import {
  BrainIcon,
  MicroscopeIcon,
  CodeIcon,
  PenIcon,
  SearchIcon,
  BarChartIcon,
  FileTextIcon,
  FilePlusIcon,
  BotIcon,
} from "@/components/icons/Icons";

export interface AgentInfo {
  /** Stable machine id, matches backend agent_name (e.g. "coding") */
  id: string;
  /** Human-readable name — no "Agent" suffix */
  displayName: string;
  /** Short role description */
  description: string;
  introduction?: string;
  /** CSS custom-property reference for theming (e.g. "var(--agent-coding)") */
  color: string;
  /** Canonical icon element at size=16 */
  icon: React.ReactNode;
}

/**
 * All 8 built-in agents. Keyed by stable id.
 */
export const AGENT_REGISTRY: Record<string, AgentInfo> = {
  orchestrator: {
    id: "orchestrator",
    displayName: "Orchestrator",
    description: "Planning & Coordination",
    introduction: "Breaks big requests into a plan and brings the right specialists together.",
    color: "var(--agent-orchestrator)",
    icon: <BrainIcon size={16} />,
  },
  research: {
    id: "research",
    displayName: "Research",
    description: "Web Search & Analysis",
    introduction: "Explores questions, finds sources, and turns research into useful answers.",
    color: "var(--agent-research)",
    icon: <MicroscopeIcon size={16} />,
  },
  coding: {
    id: "coding",
    displayName: "Coding",
    description: "Code & Execution",
    introduction: "Builds solutions, explains code, and helps you work through tricky bugs.",
    color: "var(--agent-coding)",
    icon: <CodeIcon size={16} />,
  },
  writer: {
    id: "writer",
    displayName: "Writer",
    description: "Content & Reports",
    introduction: "Turns your rough ideas into clear drafts, stories, and polished writing.",
    color: "var(--agent-writer)",
    icon: <PenIcon size={16} />,
  },
  critic: {
    id: "critic",
    displayName: "Critic",
    description: "Quality & Review",
    introduction: "Offers a second opinion and spots ways to make the result stronger.",
    color: "var(--agent-critic)",
    icon: <SearchIcon size={16} />,
  },
  data: {
    id: "data",
    displayName: "Data Analyst",
    description: "Data & Insights",
    introduction: "Finds patterns in your data and explains what the numbers are saying.",
    color: "var(--agent-data)",
    icon: <BarChartIcon size={16} />,
  },
  doc_reader: {
    id: "doc_reader",
    displayName: "Doc Reader",
    description: "Document Analysis & Q&A",
    introduction: "Reads your documents and helps you find the answers inside.",
    color: "var(--agent-doc-reader)",
    icon: <FileTextIcon size={16} />,
  },
  doc_generator: {
    id: "doc_generator",
    displayName: "Doc Generator",
    description: "Document Generation",
    introduction: "Shapes your ideas into documents you can use and share.",
    color: "var(--agent-doc-generator)",
    icon: <FilePlusIcon size={16} />,
  },
};

/** Ordered list of all registry ids. */
export const AGENT_IDS = Object.keys(AGENT_REGISTRY);

/**
 * Look up an agent by id. Returns a neutral fallback for custom /
 * unknown agents so two unknowns don't collide on the same color.
 */
export function getAgent(id: string): AgentInfo {
  const lower = id.toLowerCase();
  if (AGENT_REGISTRY[lower]) return AGENT_REGISTRY[lower];

  // Neutral fallback for custom agents
  return {
    id: lower,
    displayName: lower.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "Custom Agent",
    color: "var(--text-muted)",
    icon: <BotIcon size={16} />,
  };
}

/**
 * Get just the icon for an agent at an arbitrary size.
 * Falls back to BotIcon for unknowns.
 */
export function getAgentIcon(id: string, size = 16): React.ReactNode {
  const iconMap: Record<string, (s: number) => React.ReactNode> = {
    orchestrator:  (s) => <BrainIcon size={s} />,
    research:      (s) => <MicroscopeIcon size={s} />,
    coding:        (s) => <CodeIcon size={s} />,
    writer:        (s) => <PenIcon size={s} />,
    critic:        (s) => <SearchIcon size={s} />,
    data:          (s) => <BarChartIcon size={s} />,
    doc_reader:    (s) => <FileTextIcon size={s} />,
    doc_generator: (s) => <FilePlusIcon size={s} />,
  };
  const factory = iconMap[id.toLowerCase()];
  return factory ? factory(size) : <BotIcon size={size} />;
}
