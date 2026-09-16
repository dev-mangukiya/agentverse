"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

import { getAgent, getAgentIcon } from "@/config/agents";

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const hr = Math.floor(diff / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export interface Agent {
  id: string;
  name: string;
  emoji: string;
  description: string;
  system_prompt?: string;
  tools?: string[];
  model?: string;
  is_builtin: boolean;
  is_active: boolean;
}

export function AgentBuilder() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableTools, setAvailableTools] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  
  // Form state
  const [isCreating, setIsCreating] = useState(false);
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    emoji: "",
    description: "",
    system_prompt: "",
    tools: [] as string[],
    model: "",
  });
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingAgent, setViewingAgent] = useState<Agent | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, { total_messages: number; avg_response_ms: number | null; last_active: string | null }>>({});

  useEffect(() => {
    fetchAgents();
    // Fetch per-agent stats
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/stats/agent-analytics`);
        if (res.ok) {
          const data = await res.json();
          const map: Record<string, any> = {};
          (data.agents || []).forEach((a: any) => {
            map[a.name] = { total_messages: a.total_messages, avg_response_ms: a.avg_response_ms, last_active: a.last_active };
          });
          setAgentStats(map);
        }
      } catch { /* silently fail */ }
    };
    fetchStats();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/agents`);
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents);
        setAvailableTools(data.available_tools);
      }
    } catch (err) {
      console.error("Failed to fetch agents", err);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setFormData({
      name: "",
      emoji: "",
      description: "",
      system_prompt: "You are a helpful AI assistant...",
      tools: [],
      model: "",
    });
    setEditAgent(null);
    setIsCreating(true);
    setError(null);
  };

  const openEdit = (agent: Agent) => {
    if (agent.is_builtin) return;
    setFormData({
      name: agent.name,
      emoji: agent.emoji,
      description: agent.description || "",
      system_prompt: agent.system_prompt || "",
      tools: agent.tools || [],
      model: agent.model || "",
    });
    setEditAgent(agent);
    setIsCreating(true);
    setError(null);
  };

  const toggleTool = (tool: string) => {
    setFormData(prev => ({
      ...prev,
      tools: prev.tools.includes(tool) 
        ? prev.tools.filter(t => t !== tool)
        : [...prev.tools, tool]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Client-side validation
    const cleanName = formData.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "").replace(/_+/g, "_");
    if (!cleanName || cleanName.length < 2) {
      setError("Name must be at least 2 characters and start with a letter (only lowercase letters, numbers, underscores).");
      setSaving(false);
      return;
    }
    if (!formData.system_prompt || formData.system_prompt.trim().length < 10) {
      setError("System prompt must be at least 10 characters.");
      setSaving(false);
      return;
    }

    const payload = { ...formData, name: cleanName };

    try {
      const url = editAgent 
        ? `${API_URL}/api/v1/agents/${editAgent.id}`
        : `${API_URL}/api/v1/agents`;
        
      const res = await fetch(url, {
        method: editAgent ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        // FastAPI returns { detail: string | array | object }
        let msg = `Server error: ${res.status}`;
        if (errData.detail) {
          if (typeof errData.detail === "string") {
            msg = errData.detail;
          } else if (Array.isArray(errData.detail)) {
            msg = errData.detail.map((d: any) => d.msg || JSON.stringify(d)).join("; ");
          } else if (typeof errData.detail === "object") {
            msg = errData.detail.msg || JSON.stringify(errData.detail);
          }
        }
        throw new Error(msg);
      }
      
      await fetchAgents();
      setIsCreating(false);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this agent?")) return;
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAgents(agents.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="p-8 text-center" style={{ color: "var(--text-muted)" }}>Loading agents...</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-start mb-6 gap-3 agent-builder-header">
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate" style={{ color: "var(--text-primary)" }}>Agent Network</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Manage your autonomous AI workforce</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)", boxShadow: "0 4px 12px rgba(99,102,241,0.2)" }}
        >
          + Create Agent
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 overflow-y-auto pb-8">
        {agents.map((agent) => {
          const info = getAgent(agent.name);
          const stats = agentStats[agent.name];
          return (
          <div 
            key={agent.id}
            className="rounded-2xl p-5 group relative flex flex-col clickable"
            style={{ 
              backgroundColor: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="flex flex-col h-full">
            <div className="flex justify-between items-start mb-3">
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ 
                  backgroundColor: `color-mix(in srgb, ${info.color} 12%, var(--bg-elevated))`,
                  color: info.color,
                }}
              >
                <span style={{ fontSize: "16px", display: "flex" }}>{info.icon}</span>
              </div>
              
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1.5">
                <button
                  onClick={() => setViewingAgent(agent)}
                  className="text-[10px] px-2 py-1 rounded-lg transition-colors"
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-muted)" }}
                >
                  View Config
                </button>
                {!agent.is_builtin && (
                  <>
                    <button onClick={() => openEdit(agent)} className="text-[10px] px-2 py-1 rounded-lg transition-colors" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-muted)" }}>Edit</button>
                    <button onClick={() => handleDelete(agent.id)} className="text-[10px] px-2 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20">Del</button>
                  </>
                )}
              </div>
            </div>
            
            <h3 className="font-semibold text-sm mb-0.5" style={{ color: "var(--text-primary)" }}>
              {info.displayName}
            </h3>
            
            <p className="text-xs line-clamp-2 mb-3" style={{ color: "var(--text-muted)" }}>
              {agent.description}
            </p>

            {/* Per-agent stats */}
            {stats && (
              <div className="flex items-center gap-3 mb-3 text-[10px]" style={{ color: "var(--text-faint)" }}>
                <span>{stats.total_messages} msgs</span>
                <span>·</span>
                <span>{stats.avg_response_ms ? `${(stats.avg_response_ms / 1000).toFixed(1)}s avg` : "—"}</span>
                <span>·</span>
                <span>{stats.last_active ? timeAgo(stats.last_active) : "never"}</span>
              </div>
            )}
            
            {agent.tools && agent.tools.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-auto">
                {agent.tools.slice(0, 3).map(t => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    {t}
                  </span>
                ))}
                {agent.tools.length > 3 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
                    +{agent.tools.length - 3}
                  </span>
                )}
              </div>
            )}
            </div>
          </div>
          );
        })}
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsCreating(false)}
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel p-4 md:p-6 rounded-2xl w-full max-w-2xl relative z-10 max-h-[85vh] overflow-y-auto overscroll-contain"
              style={{ border: "1px solid var(--border-light)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)", WebkitOverflowScrolling: "touch" }}
            >
              <h2 className="text-xl font-bold mb-4 gradient-text">{editAgent ? "Edit Agent" : "Create Custom Agent"}</h2>
              
              {error && (
                <div className="mb-4 p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20">
                  {error}
                </div>
              )}
              
              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_64px] sm:grid-cols-4 gap-4 agent-form-name-row">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Agent Name (ID)</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={e => {
                        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_");
                        setFormData({...formData, name: raw});
                      }}
                      disabled={!!editAgent}
                      placeholder="e.g. data_viz_expert"
                      className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    />
                    <span className="text-[10px] mt-0.5 block" style={{ color: "var(--text-faint)" }}>Lowercase letters, numbers, underscores only</span>
                  </div>
                  <div className="agent-form-emoji-col">
                    <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Emoji</label>
                    <input 
                      type="text" 
                      value={formData.emoji}
                      onChange={e => setFormData({...formData, emoji: e.target.value})}
                      className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-red-500"
                      style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>Description (Short)</label>
                  <input 
                    type="text" 
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="e.g. Creates beautiful charts from datasets"
                    className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>System Prompt (Instructions)</label>
                  <textarea 
                    value={formData.system_prompt}
                    onChange={e => setFormData({...formData, system_prompt: e.target.value})}
                    placeholder="You are an expert at..."
                    rows={6}
                    className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-mono"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Agent Tools</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(availableTools).map(([toolId, desc]) => (
                      <label key={toolId} className="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-black/20" style={{ border: "1px solid var(--border-subtle)" }}>
                        <input 
                          type="checkbox" 
                          checked={formData.tools.includes(toolId)}
                          onChange={() => toggleTool(toolId)}
                          className="mt-1 rounded border-gray-600 text-red-500 focus:ring-red-500 bg-black/40"
                        />
                        <div>
                          <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{toolId}</div>
                          <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end gap-3 mt-6 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <button 
                    onClick={() => setIsCreating(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving || !formData.name || !formData.system_prompt}
                    className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)" }}
                  >
                    {saving ? "Saving..." : (editAgent ? "Save Changes" : "Create Agent")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Config Modal */}
      <AnimatePresence>
        {viewingAgent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setViewingAgent(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="rounded-2xl p-5 w-full max-w-lg relative z-10 max-h-[80vh] overflow-y-auto"
              style={{ backgroundColor: "var(--bg-panel)", border: "1px solid var(--border-light)", boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${getAgent(viewingAgent.name).color} 12%, var(--bg-elevated))`,
                    color: getAgent(viewingAgent.name).color,
                  }}
                >
                  {getAgentIcon(viewingAgent.name, 16)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{getAgent(viewingAgent.name).displayName}</h3>
                  <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>{viewingAgent.description}</p>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>System Prompt</div>
                <pre className="text-xs p-3 rounded-xl overflow-x-auto whitespace-pre-wrap" style={{ backgroundColor: "var(--bg-raised)", color: "var(--text-secondary)", border: "1px solid var(--border-subtle)" }}>
                  {viewingAgent.system_prompt || "(no system prompt)"}
                </pre>
              </div>

              {viewingAgent.tools && viewingAgent.tools.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>Tools</div>
                  <div className="flex flex-wrap gap-1">
                    {viewingAgent.tools.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setViewingAgent(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-secondary)" }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
