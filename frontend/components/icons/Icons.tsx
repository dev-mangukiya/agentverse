"use client";

import React from "react";

interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

const svgBase = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  style: { flexShrink: 0 } as React.CSSProperties,
});

// ── Agent Icons ──────────────────────────────────────────

export const BrainIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
    <path d="M9 22h6" />
    <path d="M10 17v5" />
    <path d="M14 17v5" />
    <path d="M8 9h2l1 3 2-6 1 3h2" />
  </svg>
);

export const MicroscopeIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M6 18h8" />
    <path d="M3 22h18" />
    <path d="M14 22a7 7 0 1 0-1-13" />
    <path d="M9 14h1" />
    <path d="M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z" />
    <path d="M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3" />
  </svg>
);

export const CodeIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
    <line x1="14" y1="4" x2="10" y2="20" />
  </svg>
);

export const PenIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    <path d="m15 5 4 4" />
  </svg>
);

export const SearchIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

export const BarChartIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

export const PuzzleIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.342.888-.287.47.084.795.5.959.957A2.5 2.5 0 1 0 9.292 6.22c-.457-.164-.873-.49-.957-.96a1.063 1.063 0 0 1 .287-.887l1.526-1.526A2.404 2.404 0 0 1 11.852 2.14c.617 0 1.233.235 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
  </svg>
);

export const BotIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2" />
    <path d="M20 14h2" />
    <path d="M15 13v2" />
    <path d="M9 13v2" />
  </svg>
);

// ── Tool Icons ───────────────────────────────────────────

export const GlobeIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const ZapIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

export const ClockIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const FileTextIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

// ── UI Icons ────────────────────────────────────────────

export const CheckCircleIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export const XCircleIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

export const AlertTriangleIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const InfoIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const MessageSquareIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const ImageIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

export const FileIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

export const WrenchIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
);

export const ScaleIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10" />
    <path d="M12 3v18" />
    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </svg>
);

export const SettingsIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const ServerIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
    <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
);

export const DatabaseIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 21 19V5" />
    <path d="M3 12A9 3 0 0 0 21 12" />
  </svg>
);

export const CpuIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M15 2v2" /><path d="M15 20v2" />
    <path d="M2 15h2" /><path d="M2 9h2" />
    <path d="M20 15h2" /><path d="M20 9h2" />
    <path d="M9 2v2" /><path d="M9 20v2" />
  </svg>
);

export const DownloadIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const BookIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
);

export const UserIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const ShieldIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const SparklesIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    <path d="M5 3v4" /><path d="M19 17v4" />
    <path d="M3 5h4" /><path d="M17 19h4" />
  </svg>
);

export const TargetIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const LinkIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

export const LayersIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

export const MailIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export const LockIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const FilePlusIcon = ({ size = 18, color, className }: IconProps) => (
  <svg {...svgBase(size, className)} style={{ ...svgBase(size).style, color }}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);
