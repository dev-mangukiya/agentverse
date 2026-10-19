"use client";

interface AgentVerseLogoProps {
  size?: number;
  showWordmark?: boolean;
  showTagline?: boolean;
  animated?: boolean;
  className?: string;
}
export function AgentVerseLogo({
  size = 34,
  showWordmark = false,
  showTagline = false,
  className = "",
}: AgentVerseLogoProps) {
  return (
    <div className={`av-brand ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="12" fill="#f68b6f" />
        <path
          d="M20 7v26M7 20h26M11 11l18 18M11 29l18-18"
          stroke="#222b35"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="20" cy="20" r="5" fill="#fff1d9" />
      </svg>
      {showWordmark && (
        <div>
          <span className="av-wordmark">
            agentverse<span className="av-brand-period">.</span>
          </span>
          {showTagline && <small>Your ideas. In good company.</small>}
        </div>
      )}
    </div>
  );
}
