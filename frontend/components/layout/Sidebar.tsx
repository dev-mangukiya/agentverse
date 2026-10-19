"use client";

import { useState } from "react";
import { AgentVerseLogo } from "@/components/brand/AgentVerseLogo";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { useAuth } from "@/lib/auth";
import { AuthModal } from "@/components/auth/AuthModal";
import {
  WorkspaceIcon,
  type WorkspaceIconName,
} from "@/components/workspace/WorkspaceIcon";

type View = "dashboard" | "agents" | "chat";
interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
  collapsed: boolean;
  onToggle: () => void;
  onClose?: () => void;
  pipelineActive?: boolean;
  activeAgentCount?: number;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  historyRefreshTrigger?: number;
  backendStatus?: "online" | "waking" | "offline" | "degraded";
  onAuthChange?: () => void;
  onNotificationClick?: (id: string) => void;
  onSearch?: () => void;
}
const navigation: { id: View; label: string; icon: WorkspaceIconName }[] = [
  { id: "chat", label: "Workspace", icon: "grid" },
  { id: "agents", label: "Your team", icon: "team" },
  { id: "dashboard", label: "Insights", icon: "chart" },
];
export function Sidebar({
  currentView,
  onNavigate,
  collapsed,
  onToggle,
  onClose,
  pipelineActive,
  activeAgentCount = 0,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  historyRefreshTrigger = 0,
  backendStatus = "waking",
  onAuthChange,
  onSearch,
}: SidebarProps) {
  const { user, isLoggedIn, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <aside className={`studio-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-brand">
          <AgentVerseLogo size={34} showWordmark={!collapsed} />
          <button
            onClick={onClose}
            className="sidebar-mobile-close"
            aria-label="Close menu"
          >
            <WorkspaceIcon name="close" size={18} />
          </button>
        </div>
        <button
          className="sidebar-new-task"
          onClick={onNewChat}
          title="New task"
        >
          <WorkspaceIcon name="plus" size={18} />
          {!collapsed && (
            <>
              <span>New task</span>
              <kbd>⌘ N</kbd>
            </>
          )}
        </button>
        <button
          className="sidebar-search"
          onClick={onSearch}
          aria-label="Search tasks and commands"
        >
          <WorkspaceIcon name="search" size={17} />
          {!collapsed && (
            <>
              <span>Find anything</span>
              <kbd>⌘ K</kbd>
            </>
          )}
        </button>
        {!collapsed && <div className="sidebar-section-label">YOUR SPACE</div>}
        <nav className="studio-navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={currentView === item.id ? "active" : ""}
              aria-current={currentView === item.id ? "page" : undefined}
              aria-label={item.label}
              title={collapsed ? item.label : undefined}
            >
              <WorkspaceIcon name={item.icon} size={19} />
              {!collapsed && <span>{item.label}</span>}
              {currentView === item.id && !collapsed && (
                <span className="nav-active-dot" />
              )}
            </button>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-history">
            <div className="sidebar-section-label">
              RECENT CONVERSATIONS <WorkspaceIcon name="history" size={13} />
            </div>
            {onSelectConversation && onNewChat && (
              <ChatHistory
                activeId={activeConversationId ?? null}
                onSelect={onSelectConversation}
                onNewChat={onNewChat}
                refreshTrigger={historyRefreshTrigger}
                compact
              />
            )}
          </div>
        )}
        {collapsed && <div className="flex-1" />}
        {!collapsed && (
          <div className="sidebar-team-note">
            <div className="team-note-symbol">✳</div>
            <div>
              <strong>
                {pipelineActive
                  ? `${activeAgentCount || "Your"} specialists at work`
                  : "A little teamwork goes a long way."}
              </strong>
              <p>
                {pipelineActive
                  ? "Follow their progress in your task."
                  : "Big questions welcome."}
              </p>
            </div>
          </div>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-system">
            <span
              className={`status-dot ${backendStatus === "online" ? "" : "status-pending"}`}
            />
            {!collapsed && (
              <span>
                {backendStatus === "online"
                  ? "Ready when you are"
                  : backendStatus === "degraded"
                    ? "Limited services available"
                    : backendStatus === "waking"
                      ? "Connecting to workspace"
                      : "Workspace offline"}
              </span>
            )}
            <button
              className="sidebar-collapse-toggle"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggle}
            >
              <WorkspaceIcon
                name="chevron"
                size={15}
                style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
              />
            </button>
          </div>
          <button
            className="sidebar-account"
            onClick={() =>
              isLoggedIn ? setAccountOpen((v) => !v) : setAuthOpen(true)
            }
            aria-label={isLoggedIn ? "Account options" : "Sign in"}
          >
            <span className="account-avatar">
              {user?.name?.[0]?.toUpperCase() || "G"}
            </span>
            {!collapsed && (
              <>
                <span>
                  <strong>{user?.name || "Your personal workspace"}</strong>
                  <small>
                    {isLoggedIn
                      ? user?.email
                      : "Guest · Sign in to save your place"}
                  </small>
                </span>
                <span className="account-more">···</span>
              </>
            )}
          </button>
          {accountOpen && isLoggedIn && (
            <button
              className="sidebar-signout"
              onClick={() => {
                logout();
                setAccountOpen(false);
                onAuthChange?.();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </aside>
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={onAuthChange}
      />
    </>
  );
}
