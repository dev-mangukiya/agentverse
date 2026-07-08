"use client";

type View = "dashboard" | "agents" | "chat";

interface HeaderProps {
  currentView: View;
  onMobileMenuToggle?: () => void;
}

export function Header({ currentView, onMobileMenuToggle }: HeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 md:px-6 h-14 flex-shrink-0 bg-[#0d0d0d]">
      {/* Mobile hamburger */}
      <div className="flex items-center gap-2">
        {onMobileMenuToggle && (
          <button
            onClick={onMobileMenuToggle}
            className="lg:hidden p-2 rounded-full text-[#9aa0a6] hover:text-[#e8eaed] hover:bg-white/[0.06] transition-all"
            aria-label="Toggle menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a1a1a] border border-white/[0.06]">
          <span className="status-dot status-dot--ok" />
          <span className="text-xs text-[#34a853] font-medium hidden sm:inline">Online</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4285f4] to-[#8b5cf6] flex items-center justify-center text-white text-xs font-bold">
          U
        </div>
      </div>
    </header>
  );
}
