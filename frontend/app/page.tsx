"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  ChatPanel,
  type PipelineAgent,
  type DelegationEvent,
  type ToolEvent,
} from "@/components/chat/ChatPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KPICards } from "@/components/dashboard/KPICards";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { AgentAnalytics } from "@/components/dashboard/AgentAnalytics";
import { AgentComparison } from "@/components/agents/AgentComparison";
import { FeedbackLeaderboard } from "@/components/dashboard/FeedbackLeaderboard";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { ShortcutsOverlay } from "@/components/layout/ShortcutsOverlay";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";
import { useAppViewport } from "@/hooks/useAppViewport";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTheme } from "@/lib/theme";

type View = "dashboard" | "agents" | "chat";
const TITLES: Record<View, string> = {
  chat: "Workspace",
  agents: "Your team",
  dashboard: "Insights",
};
export default function Home() {
  useAppViewport();
  const { theme, toggle } = useTheme();
  const [currentView, setCurrentView] = useState<View>("chat");
  const [chatResetKey, setChatResetKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [backendStatus, setBackendStatus] = useState<
    "online" | "waking" | "offline" | "degraded"
  >("waking");
  const [aiSetupRequired, setAiSetupRequired] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [agentTab, setAgentTab] = useState<"builder" | "compare">("builder");
  const [compareAgentId, setCompareAgentId] = useState<string>();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const sidebarDialogRef = useDialogFocus(mobileSidebarOpen, () =>
    setMobileSidebarOpen(false),
  );
  const historyDialogRef = useDialogFocus(mobileHistoryOpen, () =>
    setMobileHistoryOpen(false),
  );
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (desktop.matches) {
        setMobileSidebarOpen(false);
        setMobileHistoryOpen(false);
      }
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(
          `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "")}/health`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(10000),
            ]),
          },
        );
        if (!response.ok) throw new Error("Unavailable");
        const data = await response.json();
        if (!mounted) return;
        setAiSetupRequired(data.services?.llm === "no_api_key");
        setBackendStatus(data.status === "ok" ? "online" : "degraded");
      } catch {
        if (mounted) setBackendStatus("offline");
      }
      if (mounted) timer = setTimeout(check, 30000);
    };
    check();
    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  const navigate = useCallback((view: View) => {
    setCurrentView(view);
    setMobileSidebarOpen(false);
    setMobileHistoryOpen(false);
  }, []);
  const newChat = useCallback(() => {
    setActiveConversationId(null);
    setChatResetKey((n) => n + 1);
    navigate("chat");
  }, [navigate]);
  const selectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      navigate("chat");
    },
    [navigate],
  );
  const conversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setHistoryRefresh((n) => n + 1);
  }, []);
  const messageSent = useCallback(() => setHistoryRefresh((n) => n + 1), []);
  const pipelineUpdate = useCallback(
    (data: {
      agents: PipelineAgent[];
      delegations: DelegationEvent[];
      toolEvents: ToolEvent[];
      active: boolean;
    }) => {
      setPipelineAgents(data.agents);
      setPipelineActive(data.active);
    },
    [],
  );
  const exploreTeam = useCallback(() => {
    setAgentTab("builder");
    navigate("agents");
  }, [navigate]);
  const compare = useCallback(
    (id?: string) => {
      setCompareAgentId(id);
      setAgentTab("compare");
      navigate("agents");
    },
    [navigate],
  );
  const shortcutActions = useMemo(
    () => ({
      openCommandPalette: () => setCommandPaletteOpen(true),
      newChat,
      toggleSidebar: () => setSidebarCollapsed((c) => !c),
      closeModal: () => {
        setCommandPaletteOpen(false);
        setShortcutsOpen(false);
        setMobileSidebarOpen(false);
        setMobileHistoryOpen(false);
      },
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [newChat],
  );
  useKeyboardShortcuts(shortcutActions);

  return (
    <div className="app-shell studio-shell">
      {mobileSidebarOpen && (
        <div
          className="studio-drawer-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <div
        ref={sidebarDialogRef}
        className={`studio-sidebar-container ${mobileSidebarOpen ? "is-open" : ""}`}
        role={mobileSidebarOpen ? "dialog" : undefined}
        aria-modal={mobileSidebarOpen || undefined}
        aria-label={mobileSidebarOpen ? "Navigation" : undefined}
      >
        <Sidebar
          currentView={currentView}
          onNavigate={navigate}
          collapsed={sidebarCollapsed && !mobileSidebarOpen}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onClose={() => setMobileSidebarOpen(false)}
          onNewChat={newChat}
          onSelectConversation={selectConversation}
          activeConversationId={activeConversationId}
          historyRefreshTrigger={historyRefresh}
          backendStatus={backendStatus}
          onAuthChange={() => {
            newChat();
            messageSent();
          }}
          onSearch={() => setCommandPaletteOpen(true)}
          pipelineActive={pipelineActive}
          activeAgentCount={
            pipelineAgents.filter((a) =>
              ["activated", "thinking", "tool_call"].includes(a.status),
            ).length
          }
        />
      </div>
      <main className="studio-main">
        <header className="workspace-header">
          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open menu"
          >
            <WorkspaceIcon name="menu" />
          </button>
          <div className="workspace-breadcrumb">
            <span>My space</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{TITLES[currentView]}</strong>
          </div>
          <div className="header-actions">
            {aiSetupRequired && (
              <button
                aria-label="Finish provider setup"
                title="Finish setup"
                className={`setup-badge ${showSetup ? "active" : ""}`}
                onClick={() => setShowSetup((v) => !v)}
                aria-expanded={showSetup}
              >
                <span className="status-dot status-pending" />{" "}
                <span className="setup-badge-label">Finish setup</span>
              </button>
            )}
            <button
              className="icon-button"
              onClick={toggle}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              <WorkspaceIcon
                name={theme === "dark" ? "sun" : "moon"}
                size={18}
              />
            </button>
            <NotificationCenter onNotificationClick={selectConversation} />
            <button
              className="icon-button mobile-history-button"
              onClick={() => setMobileHistoryOpen(true)}
              aria-label="Chat history"
            >
              <WorkspaceIcon name="history" size={18} />
            </button>
            <button
              className="keyboard-help"
              onClick={() => setShortcutsOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              ?
            </button>
          </div>
        </header>
        {showSetup && aiSetupRequired && (
          <div className="setup-notice" role="status">
            <WorkspaceIcon name="spark" size={18} />
            <p>
              <strong>Your crew needs an AI provider.</strong> Add a provider
              API key to the project’s .env file, then restart the backend. You
              can explore the workspace in the meantime.
            </p>
            <button
              className="icon-button"
              onClick={() => setShowSetup(false)}
              aria-label="Dismiss setup notice"
            >
              <WorkspaceIcon name="close" size={16} />
            </button>
          </div>
        )}
        <div className="studio-content">
          <div
            className="chat-view"
            style={{ display: currentView === "chat" ? "flex" : "none" }}
          >
            <ChatPanel
              key={chatResetKey}
              conversationId={activeConversationId}
              onConversationCreated={conversationCreated}
              onMessageSent={messageSent}
              onPipelineUpdate={pipelineUpdate}
              inputRef={chatInputRef}
              onExploreAgents={exploreTeam}
            />
          </div>
          {currentView === "dashboard" && (
            <div className="studio-page insights-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">THE BIG PICTURE</span>
                  <h1>Good work adds up.</h1>
                  <p>
                    A little perspective on what you and your team have been
                    making.
                  </p>
                </div>
                <span className="page-stamp">
                  <WorkspaceIcon name="chart" size={18} /> Workspace activity
                </span>
              </div>
              <KPICards onStartTask={newChat} />
              <section className="insights-section">
                <div className="section-heading">
                  <h2>Your team in action</h2>
                  <span className="section-note">
                    Real activity. Useful perspective.
                  </span>
                </div>
                <AgentAnalytics />
              </section>
              <div className="insights-two-col">
                <FeedbackLeaderboard />
                <ActivityFeed />
              </div>
              <details className="system-details">
                <summary>
                  <WorkspaceIcon name="grid" size={17} /> Behind the scenes{" "}
                  <span>System health</span>
                </summary>
                <SystemHealth />
              </details>
            </div>
          )}
          {currentView === "agents" && (
            <div className="studio-page team-page">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">GOOD COMPANY FOR BIG IDEAS</span>
                  <h1>Meet your unfair advantage.</h1>
                  <p>
                    Specialists with different strengths. A team that grows with
                    your ideas.
                  </p>
                </div>
                <span className="team-heading-art" aria-hidden="true">
                  ✳
                </span>
              </div>
              <div
                className="studio-tabs"
                role="tablist"
                aria-label="Team tools"
              >
                {[
                  ["builder", "Your specialists"],
                  ["compare", "Compare perspectives"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    id={`tab-${id}`}
                    role="tab"
                    aria-selected={agentTab === id}
                    tabIndex={agentTab === id ? 0 : -1}
                    onKeyDown={(event) => {
                      if (
                        !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      )
                        return;
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? "builder"
                          : event.key === "End"
                            ? "compare"
                            : agentTab === "builder"
                              ? "compare"
                              : "builder";
                      setAgentTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }}
                    aria-controls={`panel-${id}`}
                    onClick={() => setAgentTab(id as "builder" | "compare")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <section
                role="tabpanel"
                id={`panel-${agentTab}`}
                aria-labelledby={`tab-${agentTab}`}
              >
                {agentTab === "builder" ? (
                  <AgentBuilder />
                ) : (
                  <AgentComparison initialAgentId={compareAgentId} />
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      {mobileHistoryOpen && (
        <div
          className="history-overlay"
          onClick={() => setMobileHistoryOpen(false)}
        >
          <div
            ref={historyDialogRef}
            className="history-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Chat history"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="history-drawer-heading">
              <strong>Your conversations</strong>
              <button
                className="icon-button"
                onClick={() => setMobileHistoryOpen(false)}
                aria-label="Close chat history"
              >
                <WorkspaceIcon name="close" />
              </button>
            </div>
            <ChatHistory
              activeId={activeConversationId}
              onSelect={selectConversation}
              onNewChat={newChat}
              refreshTrigger={historyRefresh}
            />
          </div>
        </div>
      )}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={navigate}
        onNewChat={newChat}
        onFocusInput={() => {
          navigate("chat");
          setTimeout(() => chatInputRef.current?.focus(), 50);
        }}
        onSelectConversation={selectConversation}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onOpenAgentCompare={compare}
      />
      <ShortcutsOverlay
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}
