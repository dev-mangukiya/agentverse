"use client";

import { motion } from "framer-motion";

const kpis = [
  {
    label: "Active Agents",
    value: "6",
    subtext: "of 7 online",
    color: "from-brand-500 to-brand-700",
    icon: "⬡",
  },
  {
    label: "Tasks Completed",
    value: "42",
    subtext: "+8 today",
    color: "from-emerald-500 to-emerald-700",
    icon: "✓",
  },
  {
    label: "Avg Response",
    value: "1.2s",
    subtext: "↓ 15% from yesterday",
    color: "from-purple-500 to-purple-700",
    icon: "◎",
  },
  {
    label: "Success Rate",
    value: "96%",
    subtext: "last 24 hours",
    color: "from-pink-500 to-pink-700",
    icon: "◆",
  },
];

export function KPICards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi, i) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.4 }}
          className="glass-panel p-5 group hover:border-white/[0.1] transition-all duration-300"
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {kpi.label}
            </span>
            <div
              className={`w-8 h-8 rounded-lg bg-gradient-to-br ${kpi.color} flex items-center justify-center text-white text-xs opacity-80 group-hover:opacity-100 transition-opacity`}
            >
              {kpi.icon}
            </div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">{kpi.value}</div>
          <div className="text-xs text-zinc-500">{kpi.subtext}</div>
        </motion.div>
      ))}
    </div>
  );
}
