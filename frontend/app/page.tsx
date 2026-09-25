"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { PipelineAgent, DelegationEvent, ToolEvent } from "@/components/chat/ChatPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KPICards } from "@/components/dashboard/KPICards";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { AgentAnalytics } from "@/components/dashboard/AgentAnalytics";
import { AgentComparison } from "@/components/agents/AgentComparison";
import { ArchitectureOverview } from "@/components/dashboard/ArchitectureOverview";
import { WelcomeModal } from "@/components/auth/WelcomeModal";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { DashboardHighlights } from "@/components/dashboard/DashboardHighlights";
import { FeedbackLeaderboard } from "@/components/dashboard/FeedbackLeaderboard";
import { useKeepAlive } from "@/hooks/useKeepAlive";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const MOBILE_HEADER_HEIGHT = 52; // px — keep in sync with the mobile-top-bar CSS

const VIEW_TITLES: Record<string, string> = {
  chat: "Chat",
  dashboard: "Dashboard",
  agents: "Agents",
};

type View = "dashboard" | "agents" | "chat";

export default function Home() {
  useKeepAlive(); // Silent backend heartbeat — prevents Render cold starts
  const [currentView, setCurrentView] = useState<View>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Mobile drawer state
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  // Pipeline state — managed here, fed by ChatPanel, displayed by AgentPipeline
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [pipelineDelegations, setPipelineDelegations] = useState<DelegationEvent[]>([]);
  const [pipelineToolEvents, setPipelineToolEvents] = useState<ToolEvent[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineDurationMs, setPipelineDurationMs] = useState<number | undefined>(undefined);
  const [pipelineTotalAgents, setPipelineTotalAgents] = useState<number | undefined>(undefined);
  const [backendStatus, setBackendStatus] = useState<"online" | "waking" | "offline">("waking");
  const [agentTab, setAgentTab] = useState<"builder" | "compare">("builder");

  // Keep active browser sessions warm. A GitHub Actions scheduler also pings
  // the backend while nobody has the app open.
  useEffect(() => {
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(10000) });
        if (mounted) {
          setBackendStatus(res.ok ? "online" : "offline");
          // If not yet online, retry quickly
          if (!res.ok) {
            retryTimer = setTimeout(ping, 3000);
          }
        }
      } catch {
        if (mounted) {
          setBackendStatus("waking");
          // Retry every 3s while waking up
          retryTimer = setTimeout(ping, 3000);
        }
      }
    };

    ping(); // Immediate check on mount
    const keepAlive = setInterval(ping, 10 * 60 * 1000); // Stay below Render's 15 min idle window
    return () => {
      mounted = false;
      clearInterval(keepAlive);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMobileSidebarOpen(false);
  }, []);
  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setHistoryRefresh((n) => n + 1);
  }, []);
  const handleMessageSent = useCallback(() => { setHistoryRefresh((n) => n + 1); }, []);
  const handleNavigate = useCallback((view: View) => {
    setCurrentView(view);
    setMobileSidebarOpen(false);
  }, []);
  const handleSidebarSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setMobileSidebarOpen(false);
  }, []);

  // Close mobile drawers when selecting a conversation
  const handleMobileHistorySelect = useCallback((id: string) => {
    setActiveConversationId(id);
    setMobileHistoryOpen(false);
  }, []);
  const handleMobileNewChat = useCallback(() => {
    setActiveConversationId(null);
    setMobileHistoryOpen(false);
  }, []);

  const handlePipelineUpdate = useCallback((data: {
    agents: PipelineAgent[];
    delegations: DelegationEvent[];
    toolEvents: ToolEvent[];
    active: boolean;
    durationMs?: number;
    totalAgentsUsed?: number;
  }) => {
    setPipelineAgents(data.agents);
    setPipelineDelegations(data.delegations);
    setPipelineToolEvents(data.toolEvents);
    setPipelineActive(data.active);
    if (data.durationMs !== undefined) setPipelineDurationMs(data.durationMs);
    if (data.totalAgentsUsed !== undefined) setPipelineTotalAgents(data.totalAgentsUsed);
  }, []);

  const activeAgentCount = pipelineAgents.filter(a => ["activated", "thinking", "tool_call"].includes(a.status)).length;

  // Global chat input ref for Cmd+K focus
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Command Palette & Shortcuts Overlay state
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Keyboard shortcuts
  const shortcutActions = useMemo(() => ({
    openCommandPalette: () => setCommandPaletteOpen(true),
    newChat: () => {
      setCurrentView("chat");
      setActiveConversationId(null);
    },
    toggleSidebar: () => setSidebarCollapsed(c => !c),
    closeModal: () => {
      if (commandPaletteOpen) { setCommandPaletteOpen(false); return; }
      if (shortcutsOpen) { setShortcutsOpen(false); return; }
      setMobileHistoryOpen(false);
    },
    openShortcuts: () => setShortcutsOpen(true),
  }), [commandPaletteOpen, shortcutsOpen]);
  useKeyboardShortcuts(shortcutActions);

  // Command Palette callbacks
  const handlePaletteOpenCompare = useCallback((agentId?: string) => {
    setCurrentView("agents");
    setAgentTab("compare");
    // Agent pre-selection is handled by the Compare component itself
  }, []);

  return (
    <div className="flex w-screen max-w-full overflow-hidden" style={{ backgroundColor: "var(--bg-base)", height: "100dvh" }}>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:z-10
        transform transition-transform duration-300 ease-in-out
        ${mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
      `}>
        <Sidebar
          currentView={currentView}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          pipelineActive={pipelineActive}
          activeAgentCount={activeAgentCount}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSidebarSelectConversation}
          onNewChat={handleNewChat}
          historyRefreshTrigger={historyRefresh}
          backendStatus={backendStatus}
          onAuthChange={() => {
            setActiveConversationId(null);
            setHistoryRefresh((n) => n + 1);
          }}
          onNotificationClick={(convId) => {
            setCurrentView("chat");
            setActiveConversationId(convId);
          }}
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
        {/* ─── Fixed mobile top bar — visible on ALL views ─── */}
        <div
          className="mobile-top-bar flex items-center gap-3 lg:hidden"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 60,
            height: `${MOBILE_HEADER_HEIGHT}px`,
            paddingLeft: "12px",
            paddingRight: "16px",
            backgroundColor: "var(--bg-sidebar)",
            borderBottom: "1px solid var(--border-subtle)",
            backdropFilter: "blur(20px) saturate(1.4)",
            WebkitBackdropFilter: "blur(20px) saturate(1.4)",
          }}
        >
          <button
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span
            className="text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.01em" }}
          >
            {VIEW_TITLES[currentView] || "AgentVerse"}
          </span>
          {/* Right side: quick actions for chat view */}
          {currentView === "chat" && (
            <button
              className="ml-auto w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
              onClick={() => setMobileHistoryOpen(true)}
              aria-label="Chat history"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {/* Spacer so content starts below the fixed mobile header */}
        <div className="lg:hidden flex-shrink-0" style={{ height: `${MOBILE_HEADER_HEIGHT}px` }} />

        <div className="flex-1 overflow-hidden relative">
          {/* Chat view — ALWAYS MOUNTED to keep WebSocket alive */}
          <div
            className="absolute inset-0 flex overflow-hidden"
            style={{ display: currentView === "chat" ? "flex" : "none" }}
          >
            {/* Chat panel — main area (no separate history column, it's in sidebar now) */}
            <div className="flex-1 min-w-0 relative">
              <ChatPanel
                conversationId={activeConversationId}
                onConversationCreated={handleConversationCreated}
                onMessageSent={handleMessageSent}
                onPipelineUpdate={handlePipelineUpdate}
                inputRef={chatInputRef}
              />
            </div>
          </div>

          {/* Dashboard & Agents views — can unmount freely */}
          <AnimatePresence mode="wait">

            {currentView === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="h-full overflow-y-auto p-3 md:p-6 pb-8 md:pb-10"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                {/* ── Overview Section ── */}
                <div className="dashboard-section">
                  <KPICards />
                  <DashboardHighlights />
                </div>

                {/* ── Analytics Section ── */}
                <div className="dashboard-section">
                  <div className="dashboard-section-label">Analytics</div>
                  <AgentAnalytics />
                  <FeedbackLeaderboard />
                </div>

                {/* ── System Section ── */}
                <div className="dashboard-section">
                  <div className="dashboard-section-label">System</div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                    <SystemHealth />
                    <ActivityFeed />
                  </div>
                </div>

                {/* ── Architecture Section ── */}
                <div className="dashboard-section">
                  <div className="dashboard-section-label">Architecture</div>
                  <ArchitectureOverview pipelineAgents={pipelineAgents} />
                </div>
              </motion.div>
            )}

            {currentView === "agents" && (
              <motion.div
                key="agents"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                className="h-full flex flex-col overflow-hidden"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                {/* Tab bar */}
                <div className="flex items-center gap-1 px-4 md:px-6 pt-4 flex-shrink-0">
                  {[
                    { id: "builder" as const, label: "Agent Builder", icon: "+" },
                    { id: "compare" as const, label: "Compare", icon: "vs" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setAgentTab(tab.id)}
                      className="flex-1 md:flex-none flex items-center justify-center md:justify-start gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{
                        backgroundColor: agentTab === tab.id ? "var(--brand-dim)" : "transparent",
                        color: agentTab === tab.id ? "var(--brand-text)" : "var(--text-muted)",
                        border: `1px solid ${agentTab === tab.id ? "color-mix(in srgb, var(--brand) 20%, transparent)" : "transparent"}`,
                        transition: "background-color var(--duration-instant) var(--ease-out), color var(--duration-instant) var(--ease-out), border-color var(--duration-instant) var(--ease-out)",
                      }}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Tab content with crossfade */}
                <div className="flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    {agentTab === "builder" && (
                      <motion.div
                        key="builder"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                        className="p-3 md:p-6"
                      >
                        <AgentBuilder />
                      </motion.div>
                    )}
                    {agentTab === "compare" && (
                      <motion.div
                        key="compare"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <AgentComparison />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      {/* ─── Mobile Chat History Drawer ─────────────────────────────── */}
      <AnimatePresence>
        {mobileHistoryOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mobile-drawer-overlay xl:hidden"
              onClick={() => setMobileHistoryOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="mobile-drawer xl:hidden"
            >
              <ChatHistory
                activeId={activeConversationId}
                onSelect={handleMobileHistorySelect}
                onNewChat={handleMobileNewChat}
                refreshTrigger={historyRefresh}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Welcome popup for first-time anonymous users */}
      <WelcomeModal />

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={(view) => { setCurrentView(view); }}
        onNewChat={() => { setCurrentView("chat"); setActiveConversationId(null); }}
        onFocusInput={() => {
          if (currentView !== "chat") setCurrentView("chat");
          setTimeout(() => chatInputRef.current?.focus(), 50);
        }}
        onSelectConversation={setActiveConversationId}
        onToggleSidebar={() => setSidebarCollapsed(c => !c)}
        onOpenAgentCompare={handlePaletteOpenCompare}
      />

      {/* Keyboard Shortcuts Overlay */}
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
