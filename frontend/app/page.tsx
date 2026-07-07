"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { AgentNetworkGraph } from "@/components/agents/AgentNetworkGraph";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ChatHistory } from "@/components/chat/ChatHistory";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { KPICards } from "@/components/dashboard/KPICards";

type View = "dashboard" | "agents" | "chat";

export default function Home() {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    setHistoryRefresh((n) => n + 1);
  }, []);

  const handleMessageSent = useCallback(() => {
    setHistoryRefresh((n) => n + 1);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-0">
      {/* Ambient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-brand-600/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-600/[0.03] blur-[120px]" />
        <div className="absolute top-[40%] left-[50%] w-[400px] h-[400px] rounded-full bg-pink-600/[0.02] blur-[100px]" />
      </div>

      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative">
        <Header currentView={currentView} />

        <div className="flex-1 overflow-auto p-6">
          <AnimatePresence mode="wait">
            {currentView === "dashboard" && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                <KPICards />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2">
                    <AgentNetworkGraph />
                  </div>
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
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                <AgentNetworkGraph fullscreen />
              </motion.div>
            )}

            {currentView === "chat" && (
              <motion.div
                key="chat"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="h-full flex gap-4"
              >
                {/* Chat History Sidebar */}
                <div className="w-64 flex-shrink-0 glass-panel hidden lg:block">
                  <ChatHistory
                    activeId={activeConversationId}
                    onSelect={setActiveConversationId}
                    onNewChat={handleNewChat}
                    refreshTrigger={historyRefresh}
                  />
                </div>

                {/* Chat Panel */}
                <div className="flex-1 min-w-0">
                  <ChatPanel
                    conversationId={activeConversationId}
                    onConversationCreated={handleConversationCreated}
                    onMessageSent={handleMessageSent}
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
