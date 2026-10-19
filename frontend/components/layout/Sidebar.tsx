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
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewChat?: () => void;
  historyRefreshTrigger?: number;
  backendStatus?: "online" | "waking" | "offline" | "degraded";
  onAuthChange?: () => void;
  onSearch?: () => void;
  onOpenShortcuts?: () => void;
}
const navigation: { id: View; label: string; icon: WorkspaceIconName }[] = [
  { id: "chat", label: "Chat", icon: "grid" },
  { id: "agents", label: "Agents", icon: "team" },
  { id: "dashboard", label: "Activity", icon: "chart" },
];
export function Sidebar({
  currentView,
  onNavigate,
  collapsed,
  onToggle,
  onClose,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  historyRefreshTrigger = 0,
  backendStatus = "waking",
  onAuthChange,
  onSearch,
  onOpenShortcuts,
}: SidebarProps) {
  const { user, isLoggedIn, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <aside className={`studio-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-brand">
          <AgentVerseLogo size={30} showWordmark={!collapsed} />
          <button
            onClick={onClose}
            className="sidebar-mobile-close icon-button"
            aria-label="Close menu"
          >
            <WorkspaceIcon name="close" size={18} />
          </button>
        </div>
        <button
          className="sidebar-new-task"
          onClick={onNewChat}
          aria-label="New chat"
          title="New chat"
        >
          <WorkspaceIcon name="plus" size={18} />
          {!collapsed && <span>New chat</span>}
        </button>
        <button
          className="sidebar-search"
          onClick={onSearch}
          aria-label="Search chats and commands"
          title={collapsed ? "Search" : undefined}
        >
          <WorkspaceIcon name="search" size={17} />
          {!collapsed && <span>Search</span>}
        </button>
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
              <WorkspaceIcon name={item.icon} size={18} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
        {!collapsed && (
          <div className="sidebar-history">
            <div className="sidebar-section-label">Recent chats</div>
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
        <div className="sidebar-bottom">
          {backendStatus === "offline" && !collapsed && (
            <div className="sidebar-system">
              <span className="status-dot status-pending" /> Server unavailable
            </div>
          )}
          <button
            className="sidebar-account"
            onClick={() =>
              isLoggedIn ? setAccountOpen((v) => !v) : setAuthOpen(true)
            }
            aria-label={isLoggedIn ? "Account options" : "Sign in"}
            aria-expanded={isLoggedIn ? accountOpen : undefined}
          >
            <span className="account-avatar">
              {user?.name?.[0]?.toUpperCase() || "G"}
            </span>
            {!collapsed && (
              <span>
                <strong>{user?.name || "Sign in"}</strong>
                {isLoggedIn && <small>{user?.email}</small>}
              </span>
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
          <div className="sidebar-utilities">
            <button
              className="sidebar-shortcuts"
              onClick={onOpenShortcuts}
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              {collapsed ? "?" : "Keyboard shortcuts"}
            </button>
            <button
              className="sidebar-collapse-toggle icon-button"
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
