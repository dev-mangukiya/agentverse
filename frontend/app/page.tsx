"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatPanel } from "@/components/chat/ChatPanel";
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
  chat: "Chat",
  agents: "Agents",
  dashboard: "Activity",
};
export default function Home() {
  useAppViewport();
  const { theme, toggle } = useTheme();
  const [currentView, setCurrentView] = useState<View>("chat");
  const [chatResetKey, setChatResetKey] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
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
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (desktop.matches) {
        setMobileSidebarOpen(false);
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
      },
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [newChat],
  );
  useKeyboardShortcuts(shortcutActions);

  return (
    <div className="app-shell studio-shell">
      <div
        className={`studio-drawer-backdrop ${mobileSidebarOpen ? "is-open" : ""}`}
        aria-hidden="true"
        onClick={() => setMobileSidebarOpen(false)}
      />
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
          onOpenShortcuts={() => setShortcutsOpen(true)}
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
            <strong>{TITLES[currentView]}</strong>
          </div>
          <div className="header-actions">
            {aiSetupRequired && (
              <button
                aria-label="Finish provider setup"
                title="Connect AI"
                className={`setup-badge ${showSetup ? "active" : ""}`}
                onClick={() => setShowSetup((v) => !v)}
                aria-expanded={showSetup}
              >
                <span className="status-dot status-pending" />{" "}
                <span className="setup-badge-label">Connect AI</span>
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
          </div>
        </header>
        {showSetup && aiSetupRequired && (
          <div className="setup-notice" role="status">
            <WorkspaceIcon name="spark" size={18} />
            <p>
              <strong>AI is not connected yet.</strong> Add a provider API key
              to the project’s .env file, then restart the backend. You can
              explore the workspace in the meantime.
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
              inputRef={chatInputRef}
            />
          </div>
          {currentView === "dashboard" && (
            <div className="studio-page insights-page">
              <div className="page-heading">
                <h1>Activity</h1>
                <p>Your conversations and agent activity in one place.</p>
              </div>
              <KPICards onStartTask={newChat} />
              <section className="insights-section">
                <ActivityFeed />
              </section>
              <details className="system-details">
                <summary>
                  Agent performance
                  <WorkspaceIcon name="chevron" size={16} />
                </summary>
                <div className="details-content">
                  <AgentAnalytics />
                  <FeedbackLeaderboard />
                </div>
              </details>
              <details className="system-details">
                <summary>
                  System health
                  <WorkspaceIcon name="chevron" size={16} />
                </summary>
                <SystemHealth />
              </details>
            </div>
          )}
          {currentView === "agents" && (
            <div className="studio-page team-page">
              <div className="page-heading">
                <h1>Agents</h1>
                <p>
                  Each AI helper has a specialty. Just start a chat — we’ll
                  choose who can help.
                </p>
              </div>
              <div
                className="studio-tabs"
                role="tablist"
                aria-label="Agent tools"
              >
                {[
                  ["builder", "All agents"],
                  ["compare", "Compare answers"],
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
