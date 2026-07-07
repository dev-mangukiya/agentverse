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
  onMobileMenuToggle?: () => void;
}

export function Header({ currentView, onMobileMenuToggle }: HeaderProps) {
  const { title, subtitle } = viewTitles[currentView];

  return (
    <header className="flex items-center justify-between px-4 md:px-6 h-14 md:h-16 border-b border-white/[0.06] bg-surface-1/30 backdrop-blur-xl flex-shrink-0">
      <div className="flex items-center gap-3">
        {/* Mobile hamburger menu */}
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-all"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-sm md:text-base font-semibold text-white">{title}</h1>
          <p className="text-[10px] md:text-xs text-zinc-500 hidden sm:block">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <span className="status-dot status-dot--ok" />
          <span className="text-xs font-medium text-emerald-400 hidden sm:inline">System Online</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
          U
        </div>
      </div>
    </header>
  );
}
