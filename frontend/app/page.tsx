"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AgentNetworkGraph } from "@/components/agents/AgentNetworkGraph";
import { AgentPipeline } from "@/components/agents/AgentPipeline";
import { ChatPanel } from "@/components/chat/ChatPanel";
import type { PipelineAgent, DelegationEvent, ToolEvent } from "@/components/chat/ChatPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KPICards } from "@/components/dashboard/KPICards";
import { AgentBuilder } from "@/components/agents/AgentBuilder";

type View = "dashboard" | "agents" | "chat";

export default function Home() {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Mobile drawer/sheet state
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [mobilePipelineOpen, setMobilePipelineOpen] = useState(false);

  // Pipeline state — managed here, fed by ChatPanel, displayed by AgentPipeline
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [pipelineDelegations, setPipelineDelegations] = useState<DelegationEvent[]>([]);
  const [pipelineToolEvents, setPipelineToolEvents] = useState<ToolEvent[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineDurationMs, setPipelineDurationMs] = useState<number | undefined>(undefined);
  const [pipelineTotalAgents, setPipelineTotalAgents] = useState<number | undefined>(undefined);
  const [backendStatus, setBackendStatus] = useState<"online" | "waking" | "offline">("waking");

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

  return (
    <div className="flex h-screen w-screen max-w-full overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
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
        />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
        <Header
          currentView={currentView}
          onMobileMenuToggle={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          pipelineActive={pipelineActive}
          activeAgents={pipelineAgents.filter(a => ["activated", "thinking", "tool_call"].includes(a.status))}
          backendStatus={backendStatus}
        />

        <div className="flex-1 overflow-hidden">
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
                className="h-full overflow-y-auto p-3 md:p-6"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                <AgentBuilder />
              </motion.div>
            )}

            {currentView === "chat" && (
              <motion.div
                key="chat"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full flex overflow-hidden"
              >
                {/* Chat history sidebar — only on xl+ screens to give chat area room */}
                <div
                  className="w-52 flex-shrink-0 hidden xl:flex xl:flex-col overflow-hidden"
                  style={{ borderRight: "1px solid var(--border-subtle)" }}
                >
                  <ChatHistory
                    activeId={activeConversationId}
                    onSelect={setActiveConversationId}
                    onNewChat={handleNewChat}
                    refreshTrigger={historyRefresh}
                  />
                </div>

                {/* Chat panel — main area */}
                <div className="flex-1 min-w-0 relative">
                  {/* Mobile-only action bar for history & pipeline access */}
                  <div
                    className="flex xl:hidden items-center gap-2 px-3 py-2 flex-shrink-0"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <button
                      className="mobile-trigger-btn"
                      onClick={() => setMobileHistoryOpen(true)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3C6.477 3 2 6.925 2 11.75c0 2.278.98 4.35 2.59 5.88L3 21l4.5-1.45A10.3 10.3 0 0 0 12 20.5c5.523 0 10-3.925 10-8.75S17.523 3 12 3Z" stroke="currentColor" strokeWidth="1.5"/>
                      </svg>
                      <span className="hidden sm:inline">History</span>
                    </button>

                    <div className="flex-1" />

                    {(pipelineActive || pipelineAgents.length > 0) && (
                      <button
                        className="mobile-trigger-btn"
                        onClick={() => setMobilePipelineOpen(true)}
                        style={pipelineActive ? {
                          backgroundColor: "var(--brand-dim)",
                          borderColor: "color-mix(in srgb, var(--brand) 20%, transparent)",
                          color: "var(--brand-text)",
                        } : {}}
                      >
                        {pipelineActive && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: "var(--brand)",
                              boxShadow: "0 0 6px var(--brand)",
                              animation: "pulse 1.5s ease-in-out infinite",
                            }}
                          />
                        )}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <span className="hidden sm:inline">
                          {pipelineActive ? `${activeAgentCount} Active` : "Pipeline"}
                        </span>
                      </button>
                    )}
                  </div>

                  <ChatPanel
                    conversationId={activeConversationId}
                    onConversationCreated={handleConversationCreated}
                    onMessageSent={handleMessageSent}
                    onPipelineUpdate={handlePipelineUpdate}
                  />
                </div>

                {/* Agent Pipeline panel — only on xl+ screens */}
                <div
                  className="w-72 xl:w-80 flex-shrink-0 hidden xl:flex xl:flex-col overflow-hidden"
                >
                  <AgentPipeline
                    agents={pipelineAgents}
                    delegations={pipelineDelegations}
                    toolEvents={pipelineToolEvents}
                    pipelineActive={pipelineActive}
                    pipelineDurationMs={pipelineDurationMs}
                    totalAgentsUsed={pipelineTotalAgents}
                  />
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

      {/* ─── Mobile Pipeline Bottom Sheet ──────────────────────────── */}
      <AnimatePresence>
        {mobilePipelineOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mobile-sheet-overlay xl:hidden"
              onClick={() => setMobilePipelineOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="mobile-sheet xl:hidden"
            >
              <div className="mobile-sheet-handle" />
              <AgentPipeline
                agents={pipelineAgents}
                delegations={pipelineDelegations}
                toolEvents={pipelineToolEvents}
                pipelineActive={pipelineActive}
                pipelineDurationMs={pipelineDurationMs}
                totalAgentsUsed={pipelineTotalAgents}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
