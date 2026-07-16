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

  // Pipeline state — managed here, fed by ChatPanel, displayed by AgentPipeline
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [pipelineDelegations, setPipelineDelegations] = useState<DelegationEvent[]>([]);
  const [pipelineToolEvents, setPipelineToolEvents] = useState<ToolEvent[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineDurationMs, setPipelineDurationMs] = useState<number | undefined>(undefined);
  const [pipelineTotalAgents, setPipelineTotalAgents] = useState<number | undefined>(undefined);
  const [backendStatus, setBackendStatus] = useState<"online" | "waking" | "offline">("waking");

  // Global keep-alive ping — prevents Render free tier from sleeping (every 13 min)
  useEffect(() => {
    const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
    let mounted = true;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(15000) });
        if (mounted) setBackendStatus(res.ok ? "online" : "offline");
      } catch {
        if (mounted) setBackendStatus("waking");
      }
    };

    ping(); // Immediate check on mount
    const interval = setInterval(ping, 13 * 60 * 1000); // Every 13 min
    return () => { mounted = false; clearInterval(interval); };
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

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: "var(--bg-base)" }}>
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
          activeAgentCount={pipelineAgents.filter(a => ["activated", "thinking", "tool_call"].includes(a.status)).length}
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
                className="h-full overflow-y-auto p-6 space-y-6"
                style={{ backgroundColor: "var(--bg-base)" }}
              >
                <KPICards />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2"><AgentNetworkGraph /></div>
                  <div className="space-y-6">
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
                className="h-full p-6"
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
    </div>
  );
}
