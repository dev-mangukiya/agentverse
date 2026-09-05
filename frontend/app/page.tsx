"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { AgentNetworkGraph } from "@/components/agents/AgentNetworkGraph";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { PipelineAgent, DelegationEvent, ToolEvent } from "@/components/chat/ChatPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KPICards } from "@/components/dashboard/KPICards";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { AgentAnalytics } from "@/components/dashboard/AgentAnalytics";
import { AgentComparison } from "@/components/agents/AgentComparison";
import { WelcomeModal } from "@/components/auth/WelcomeModal";
import { useKeepAlive } from "@/hooks/useKeepAlive";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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

  const handleNewChat = useCallback(() => { setActiveConversationId(null); }, []);
  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setHistoryRefresh((n) => n + 1);
  }, []);
  const handleMessageSent = useCallback(() => { setHistoryRefresh((n) => n + 1); }, []);
  const handleNavigate = useCallback((view: View) => {
    setCurrentView(view);
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

  // Keyboard shortcuts
  const shortcutActions = useMemo(() => ({
    focusInput: () => {
      if (currentView !== "chat") setCurrentView("chat");
      setTimeout(() => chatInputRef.current?.focus(), 50);
    },
    newChat: () => {
      setCurrentView("chat");
      setActiveConversationId(null);
    },
    toggleSidebar: () => setSidebarCollapsed(c => !c),
    closeModal: () => {
      setMobileHistoryOpen(false);
    },
  }), [currentView]);
  useKeyboardShortcuts(shortcutActions);

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
          onSelectConversation={setActiveConversationId}
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
        <div className="flex-1 overflow-hidden relative">
          {/* Chat view — ALWAYS MOUNTED to keep WebSocket alive */}
          <div
            className="absolute inset-0 flex overflow-hidden"
            style={{ display: currentView === "chat" ? "flex" : "none" }}
          >
            {/* Chat panel — main area (no separate history column, it's in sidebar now) */}
            <div className="flex-1 min-w-0 relative">
              {/* Mobile-only action bar for sidebar + history + pipeline access */}
              <div
                className="flex lg:hidden items-center gap-2 px-3 py-2 flex-shrink-0"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                {/* Hamburger to open sidebar */}
                <button
                  className="mobile-trigger-btn"
                  onClick={() => setMobileSidebarOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className="mobile-trigger-btn"
                  onClick={() => setMobileHistoryOpen(true)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="hidden sm:inline">History</span>
                </button>
              </div>

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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="h-full overflow-y-auto p-3 md:p-6 pb-8 md:pb-10 space-y-4 md:space-y-6"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                <KPICards />
                <AgentAnalytics />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                  <div className="lg:col-span-2"><AgentNetworkGraph /></div>
                  <div className="space-y-4 md:space-y-6">
                    <SystemHealth />
                    <ActivityFeed />
                  </div>
                </div>
              </motion.div>
            )}

            {currentView === "agents" && (
              <motion.div
                key="agents"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
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
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200"
                      style={{
                        backgroundColor: agentTab === tab.id ? "var(--brand-dim)" : "transparent",
                        color: agentTab === tab.id ? "var(--brand-text)" : "var(--text-muted)",
                        border: `1px solid ${agentTab === tab.id ? "color-mix(in srgb, var(--brand) 20%, transparent)" : "transparent"}`,
                      }}
                    >
                      <span>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {agentTab === "builder" && (
                    <div className="p-3 md:p-6">
                      <AgentBuilder />
                    </div>
                  )}
                  {agentTab === "compare" && (
                    <AgentComparison />
                  )}
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
    </div>
  );
}
