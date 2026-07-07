"use client";

type View = "dashboard" | "agents" | "chat";

const viewTitles: Record<View, { title: string; subtitle: string }> = {
  dashboard: {
    title: "Command Center",
    subtitle: "Monitor your autonomous AI workforce in real-time",
  },
  agents: {
    title: "Agent Network",
    subtitle: "Visualize agent communication and task flow",
  },
  chat: {
    title: "Mission Control",
    subtitle: "Issue commands and watch agents execute",
  },
};

interface HeaderProps {
  currentView: View;
}

export function Header({ currentView }: HeaderProps) {
  const { title, subtitle } = viewTitles[currentView];

  return (
    <header className="flex items-center justify-between px-6 h-16 border-b border-white/[0.06] bg-surface-1/30 backdrop-blur-xl">
      <div>
        <h1 className="text-base font-semibold text-white">{title}</h1>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <span className="status-dot status-dot--ok" />
          <span className="text-xs font-medium text-emerald-400">System Online</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
          U
        </div>
      </div>
    </header>
  );
}
