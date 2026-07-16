"use client";

import { motion, AnimatePresence } from "framer-motion";
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

export function Header({ currentView, onMobileMenuToggle, pipelineActive, activeAgents = [] }: HeaderProps) {

  return (
    <header
      className="relative flex-shrink-0"
      style={{
        backgroundColor: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
        backdropFilter: "blur(16px) saturate(1.2)",
        WebkitBackdropFilter: "blur(16px) saturate(1.2)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        {/* Left: Mobile hamburger + Pipeline status */}
        <div className="flex items-center gap-3">
          {onMobileMenuToggle && (
            <button
              onClick={onMobileMenuToggle}
              className="lg:hidden p-2 rounded-xl transition-all duration-200"
              style={{ color: "var(--text-muted)" }}
              aria-label="Toggle menu"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
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
                initial={{ opacity: 0, x: -16, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl"
                style={{
                  backgroundColor: "var(--brand-dim)",
                  border: "1px solid color-mix(in srgb, var(--brand) 12%, transparent)",
                }}
              >
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: "var(--brand)",
                    boxShadow: "0 0 8px var(--brand)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
                <div className="flex items-center gap-1">
                  {activeAgents.slice(0, 3).map((agent) => {
                    const meta = agentMeta[agent.name?.toLowerCase()];
                    return (
                      <motion.div
                        key={agent.name}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${meta?.color || "var(--brand)"} 20%, var(--bg-panel))`,
                          border: `1px solid color-mix(in srgb, ${meta?.color || "var(--brand)"} 25%, transparent)`,
                          fontSize: "10px",
                        }}
                        title={meta?.label || agent.name}
                      >
                        {meta?.icon || "🤖"}
                      </motion.div>
                    );
                  })}
                </div>
                <span className="text-[10px] font-semibold whitespace-nowrap flex-shrink-0" style={{ color: "var(--brand-text)" }}>
                  {activeAgents.length} active
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5 ml-auto">
          {/* System Online badge */}
          <div
            className="items-center gap-1.5 px-3 py-1.5 rounded-xl border hidden sm:flex transition-all duration-200"
            style={{
              backgroundColor: "var(--green-dim)",
              borderColor: "color-mix(in srgb, var(--green) 15%, transparent)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: "var(--green)",
                boxShadow: "0 0 6px var(--green)",
              }}
            />
            <span className="text-xs font-medium" style={{ color: "var(--green)" }}>System Online</span>
          </div>



          {/* User Avatar */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center relative group/avatar cursor-pointer overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #6366f1, #a855f7)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="relative z-10">
              <circle cx="12" cy="8" r="4" fill="white" opacity="0.9"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" fill="white" opacity="0.9"/>
            </svg>
            {/* Shine */}
            <div
              className="absolute inset-0 opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-300"
              style={{
                background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15) 50%, transparent 60%)",
                backgroundSize: "200% 100%",
                animation: "shine 2s ease-in-out infinite",
              }}
            />
          </div>
        </div>
      </div>

      {/* Animated gradient bar under header when pipeline is active */}
      <AnimatePresence>
        {pipelineActive && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{
              background: "linear-gradient(90deg, var(--brand) 0%, #a855f7 30%, #ec4899 60%, #f59e0b 80%, var(--brand) 100%)",
              backgroundSize: "200% 100%",
              animation: "gradientShift 3s linear infinite",
              transformOrigin: "left",
            }}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
