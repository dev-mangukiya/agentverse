"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/lib/theme";
import { agentMeta } from "@/components/agents/AgentCard";

type View = "dashboard" | "agents" | "chat";

interface ActiveAgent {
  name: string;
  status: string;
  toolName?: string;
}

interface HeaderProps {
  currentView: View;
  onMobileMenuToggle?: () => void;
  pipelineActive?: boolean;
  activeAgents?: ActiveAgent[];
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function Header({ currentView, onMobileMenuToggle, pipelineActive, activeAgents = [] }: HeaderProps) {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 h-13 flex-shrink-0"
      style={{ backgroundColor: "var(--bg-base)", borderBottom: "1px solid var(--border-subtle)" }}
    >
      {/* Left: Mobile hamburger + Pipeline status */}
      <div className="flex items-center gap-3">
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 rounded-full transition-all"
            style={{ color: "var(--text-muted)" }}
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}

        {/* Live pipeline status */}
        <AnimatePresence>
          {pipelineActive && activeAgents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "var(--brand-dim)", border: "1px solid color-mix(in srgb, var(--brand) 15%, transparent)" }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: "var(--brand)", animation: "pulse 1.5s ease-in-out infinite" }}
              />
              <div className="flex items-center gap-1.5">
                {activeAgents.slice(0, 3).map((agent) => {
                  const meta = agentMeta[agent.name?.toLowerCase()];
                  return (
                    <motion.div
                      key={agent.name}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-1"
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${meta?.color || "var(--brand)"} 25%, transparent)`,
                          fontSize: "10px",
                        }}
                      >
                        {meta?.icon || "🤖"}
                      </div>
                      <span className="text-[10px] font-medium hidden md:inline" style={{ color: meta?.color || "var(--brand-text)" }}>
                        {agent.toolName ? `${meta?.label || agent.name} → ${agent.toolName}` : meta?.label || agent.name}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
              <span className="text-[10px] font-medium" style={{ color: "var(--brand-text)" }}>
                {activeAgents.length} agent{activeAgents.length !== 1 ? "s" : ""} active
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* System Online badge */}
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border hidden sm:flex"
          style={{ backgroundColor: "var(--green-dim)", borderColor: "color-mix(in srgb, var(--green) 20%, transparent)" }}
        >
          <span className="status-dot status-dot--ok" style={{ width: 6, height: 6 }} />
          <span className="text-xs font-medium" style={{ color: "var(--green)" }}>System Online</span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="theme-toggle"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white text-xs font-bold">
          U
        </div>
      </div>
    </header>
  );
}
