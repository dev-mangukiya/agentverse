"use client";

import { motion } from "framer-motion";

interface AgentVerseLogoProps {
  /** Overall size of the logomark square */
  size?: number;
  /** Show the "AgentVerse" wordmark next to the mark */
  showWordmark?: boolean;
  /** Show the subtitle tagline */
  showTagline?: boolean;
  /** Enable the ambient glow animation */
  animated?: boolean;
  /** Additional class names */
  className?: string;
}

/**
 * AgentVerse brand logomark + optional wordmark.
 *
 * The mark depicts a stylised neural convergence — three flowing paths
 * converging into a central nexus point, symbolising multiple AI agents
 * collaborating toward a unified outcome.  The design language is
 * inspired by DeepMind / Anthropic: geometric but organic, precise yet
 * alive.
 */
export function AgentVerseLogo({
  size = 36,
  showWordmark = false,
  showTagline = false,
  animated = true,
  className = "",
}: AgentVerseLogoProps) {
  const markSize = size;
  const strokeWidth = size > 40 ? 1.6 : 1.4;

  return (
    <div className={`agentverse-logo ${className}`} style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      {/* ─── Logomark ─────────────────────────────────────────────── */}
      <div
        className="agentverse-logo__mark"
        style={{
          width: markSize,
          height: markSize,
          position: "relative",
          flexShrink: 0,
        }}
      >
        {/* Ambient glow behind the mark */}
        {animated && (
          <div
            className="agentverse-logo__glow"
            style={{
              position: "absolute",
              inset: `-${Math.round(size * 0.25)}px`,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(99,102,241,0.25) 0%, rgba(139,92,246,0.12) 40%, transparent 70%)",
              filter: `blur(${Math.round(size * 0.35)}px)`,
              animation: "logoGlow 4s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}

        <svg
          width={markSize}
          height={markSize}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ position: "relative", zIndex: 1, display: "block" }}
        >
          <defs>
            {/* Primary brand gradient */}
            <linearGradient id="av-grad-primary" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="50%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Secondary gradient for depth */}
            <linearGradient id="av-grad-secondary" x1="48" y1="0" x2="0" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#a78bfa" />
            </linearGradient>

            {/* Accent gradient for the convergence point */}
            <radialGradient id="av-grad-nexus" cx="24" cy="24" r="6" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#c4b5fd" />
              <stop offset="60%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </radialGradient>

            {/* Subtle background shape fill */}
            <linearGradient id="av-grad-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* ─── Background shape: softly rounded square ─── */}
          <rect
            x="1"
            y="1"
            width="46"
            height="46"
            rx="14"
            fill="url(#av-grad-bg)"
            stroke="url(#av-grad-primary)"
            strokeWidth="1"
            strokeOpacity="0.15"
          />

          {/* ─── Three convergence paths ─── */}
          {/* Path 1: Top-left → center — research / discovery arc */}
          <path
            d="M10 10 C14 14, 12 20, 18 22 C20 23, 22 23.5, 24 24"
            stroke="url(#av-grad-primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />

          {/* Path 2: Top-right → center — analysis / compute arc */}
          <path
            d="M38 10 C34 14, 36 20, 30 22 C28 23, 26 23.5, 24 24"
            stroke="url(#av-grad-primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />

          {/* Path 3: Bottom-center → center — synthesis / output arc */}
          <path
            d="M24 40 C24 36, 22 32, 23 28 C23.4 26, 23.8 25, 24 24"
            stroke="url(#av-grad-primary)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />

          {/* ─── Branching sub-paths for depth ─── */}
          {/* Branch from path 1 */}
          <path
            d="M8 20 C12 19, 14 20, 18 22"
            stroke="url(#av-grad-secondary)"
            strokeWidth={strokeWidth * 0.65}
            strokeLinecap="round"
            fill="none"
            opacity="0.45"
          />

          {/* Branch from path 2 */}
          <path
            d="M40 20 C36 19, 34 20, 30 22"
            stroke="url(#av-grad-secondary)"
            strokeWidth={strokeWidth * 0.65}
            strokeLinecap="round"
            fill="none"
            opacity="0.45"
          />

          {/* Branch from path 3 */}
          <path
            d="M14 38 C16 35, 20 33, 23 28"
            stroke="url(#av-grad-secondary)"
            strokeWidth={strokeWidth * 0.65}
            strokeLinecap="round"
            fill="none"
            opacity="0.45"
          />
          <path
            d="M34 38 C32 35, 28 33, 25 28"
            stroke="url(#av-grad-secondary)"
            strokeWidth={strokeWidth * 0.65}
            strokeLinecap="round"
            fill="none"
            opacity="0.45"
          />

          {/* ─── Origin nodes ─── */}
          <circle cx="10" cy="10" r="2.2" fill="url(#av-grad-primary)" opacity="0.7" />
          <circle cx="38" cy="10" r="2.2" fill="url(#av-grad-primary)" opacity="0.7" />
          <circle cx="24" cy="40" r="2.2" fill="url(#av-grad-primary)" opacity="0.7" />

          {/* Sub-origin nodes */}
          <circle cx="8" cy="20" r="1.4" fill="url(#av-grad-secondary)" opacity="0.4" />
          <circle cx="40" cy="20" r="1.4" fill="url(#av-grad-secondary)" opacity="0.4" />
          <circle cx="14" cy="38" r="1.4" fill="url(#av-grad-secondary)" opacity="0.4" />
          <circle cx="34" cy="38" r="1.4" fill="url(#av-grad-secondary)" opacity="0.4" />

          {/* ─── Central nexus — the convergence point ─── */}
          {/* Outer halo */}
          <circle cx="24" cy="24" r="5" fill="url(#av-grad-nexus)" opacity="0.15" />
          {/* Core */}
          <circle cx="24" cy="24" r="3" fill="url(#av-grad-nexus)" />
          {/* Bright center highlight */}
          <circle cx="23.2" cy="23.2" r="1.1" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* ─── Wordmark ─────────────────────────────────────────────── */}
      {showWordmark && (
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
          style={{ minWidth: 0 }}
        >
          <div
            className="agentverse-logo__wordmark"
            style={{
              fontSize: Math.max(14, size * 0.42),
              fontWeight: 650,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>Agent</span>
            <span className="gradient-text">Verse</span>
          </div>
          {showTagline && (
            <div
              className="agentverse-logo__tagline"
              style={{
                fontSize: Math.max(9, size * 0.26),
                fontWeight: 500,
                color: "var(--text-faint)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginTop: 1,
                whiteSpace: "nowrap",
              }}
            >
              Multi-Agent AI Platform
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
