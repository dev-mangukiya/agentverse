"use client";

import { getAuthHeaders } from "@/lib/auth";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDialogFocus } from "@/hooks/useDialogFocus";
import { WorkspaceIcon } from "@/components/workspace/WorkspaceIcon";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

import { getAgent, getAgentIcon } from "@/config/agents";

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
  const [availableTools, setAvailableTools] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingAgent, setViewingAgent] = useState<Agent | null>(null);
  const editorRef = useDialogFocus(isCreating, () => {
    if (!saving) setIsCreating(false);
  });
  const detailsRef = useDialogFocus(!!viewingAgent, () =>
    setViewingAgent(null),
  );
  const visibleAgents = agents.filter((agent) => {
    const info = getAgent(agent.name);
    const matchesQuery =
      `${info.displayName} ${agent.description} ${info.description}`
        .toLowerCase()
        .includes(query.toLowerCase().trim());
    return matchesQuery;
  });

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoadError(false);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Could not load agents");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents);
        setAvailableTools(data.available_tools);
      }
    } catch (err) {
      setLoadError(true);
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
    setFormData((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool)
        ? prev.tools.filter((t) => t !== tool)
        : [...prev.tools, tool],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    // Client-side validation
    const cleanName = formData.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^[^a-z]+/, "")
      .replace(/_+/g, "_");
    if (!cleanName || cleanName.length < 2) {
      setError(
        "Name must be at least 2 characters and start with a letter (only lowercase letters, numbers, underscores).",
      );
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
            msg = errData.detail
              .map((d: any) => d.msg || JSON.stringify(d))
              .join("; ");
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
    if (
      deletingId ||
      !confirm("Delete this custom specialist? This cannot be undone.")
    )
      return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/agents/${id}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok)
        throw new Error("Could not delete this specialist. Please try again.");
      setAgents((current) => current.filter((a) => a.id !== id));
      setViewingAgent((current) => (current?.id === id ? null : current));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not delete this specialist. Please try again.",
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="specialist-loading" role="status">
        <WorkspaceIcon name="team" size={26} />
        <p>Loading agents…</p>
      </div>
    );
  }

  return (
    <div className="specialist-directory">
      <div className="specialist-toolbar">
        <label className="specialist-search">
          <WorkspaceIcon name="search" size={17} />
          <input
            aria-label="Find an agent"
            placeholder="Find an agent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="studio-primary" onClick={openCreate}>
          <WorkspaceIcon name="plus" size={17} /> Create agent
        </button>
      </div>
      {loadError && (
        <p role="alert" className="directory-error">
          Could not load the team.{" "}
          <button
            className="underline"
            onClick={() => {
              setLoading(true);
              fetchAgents();
            }}
          >
            Try again
          </button>
        </p>
      )}
      {error && !isCreating && (
        <p role="alert" className="directory-error">
          {error}
        </p>
      )}
      {!loadError && visibleAgents.length === 0 && (
        <div className="specialist-empty">
          <WorkspaceIcon name="team" size={30} />
          <h3>{query ? "No specialists found" : "No agents yet"}</h3>
          <p>
            {query
              ? "Try a different name or specialty."
              : "Give a specialist a role, instructions, and the tools to help you."}
          </p>
          <button
            className="text-action"
            onClick={() => (query ? setQuery("") : openCreate())}
          >
            {query ? "Clear search" : "Create an agent"}
            <WorkspaceIcon name="arrow" size={16} />
          </button>
        </div>
      )}
      <div className="specialist-grid">
        {visibleAgents.map((agent) => {
          const info = getAgent(agent.name);
          return (
            <article
              key={agent.id}
              className="specialist-card"
              style={
                { "--specialist-color": info.color } as React.CSSProperties
              }
            >
              <span className="specialist-icon">
                {!agent.is_builtin && agent.emoji
                  ? agent.emoji
                  : getAgentIcon(agent.name, 20)}
              </span>
              <div className="specialist-body">
                <h3>
                  {info.displayName}
                  {!agent.is_builtin && (
                    <span className="specialist-kind">Custom</span>
                  )}
                  {!agent.is_active && (
                    <span className="specialist-kind">Paused</span>
                  )}
                </h3>
                <p className="specialist-description">
                  {agent.is_builtin
                    ? info.introduction || agent.description
                    : agent.description ||
                      "An AI helper with your own instructions."}
                </p>
              </div>
              <button
                className="specialist-details"
                onClick={() => {
                  setError(null);
                  setViewingAgent(agent);
                }}
                aria-label={`About ${info.displayName}`}
              >
                Details
              </button>
            </article>
          );
        })}
      </div>

      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                if (!saving) setIsCreating(false);
              }}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              ref={editorRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="specialist-editor-title"
              tabIndex={-1}
              className="glass-panel specialist-editor p-4 md:p-6 rounded-2xl w-full max-w-2xl relative z-10 max-h-[85vh] overflow-y-auto overscroll-contain"
              style={{
                border: "1px solid var(--border-light)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <h2
                id="specialist-editor-title"
                className="text-xl font-bold mb-2"
              >
                {editAgent ? "Edit agent" : "Create an agent"}
              </h2>
              <p
                className="text-sm mb-5"
                style={{ color: "var(--text-muted)" }}
              >
                Give them a clear role and tell them what great work looks like.
              </p>

              {error && (
                <div
                  role="alert"
                  className="mb-4 p-3 rounded-lg text-sm bg-red-500/10 text-red-400 border border-red-500/20"
                >
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div className="grid grid-cols-[1fr_64px] sm:grid-cols-4 gap-4 agent-form-name-row">
                  <div className="sm:col-span-3">
                    <label
                      htmlFor="specialist-name"
                      className="block text-xs font-semibold mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Agent Name (ID)
                    </label>
                    <input
                      type="text"
                      id="specialist-name"
                      value={formData.name}
                      onChange={(e) => {
                        const raw = e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "_")
                          .replace(/_+/g, "_");
                        setFormData({ ...formData, name: raw });
                      }}
                      disabled={!!editAgent}
                      placeholder="e.g. data_viz_expert"
                      className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <span
                      className="text-[10px] mt-0.5 block"
                      style={{ color: "var(--text-faint)" }}
                    >
                      Lowercase letters, numbers, underscores only
                    </span>
                  </div>
                  <div className="agent-form-emoji-col">
                    <label
                      htmlFor="specialist-emoji"
                      className="block text-xs font-semibold mb-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Emoji
                    </label>
                    <input
                      type="text"
                      id="specialist-emoji"
                      value={formData.emoji}
                      onChange={(e) =>
                        setFormData({ ...formData, emoji: e.target.value })
                      }
                      className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-red-500"
                      style={{
                        borderColor: "var(--border-subtle)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="specialist-description"
                    className="block text-xs font-semibold mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Description (Short)
                  </label>
                  <input
                    type="text"
                    id="specialist-description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="e.g. Creates beautiful charts from datasets"
                    className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="specialist-system_prompt"
                    className="block text-xs font-semibold mb-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    System Prompt (Instructions)
                  </label>
                  <textarea
                    id="specialist-system_prompt"
                    value={formData.system_prompt}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        system_prompt: e.target.value,
                      })
                    }
                    placeholder="You are an expert at..."
                    rows={6}
                    className="w-full bg-black/20 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-500 font-mono"
                    style={{
                      borderColor: "var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block text-xs font-semibold mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Agent Tools
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {Object.entries(availableTools).map(([toolId, desc]) => (
                      <label
                        key={toolId}
                        className="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors hover:bg-black/20"
                        style={{ border: "1px solid var(--border-subtle)" }}
                      >
                        <input
                          type="checkbox"
                          checked={formData.tools.includes(toolId)}
                          onChange={() => toggleTool(toolId)}
                          className="mt-1 rounded border-gray-600 text-red-500 focus:ring-red-500 bg-black/40"
                        />
                        <div>
                          <div
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {toolId}
                          </div>
                          <div
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {desc}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div
                  className="flex justify-end gap-3 mt-6 pt-4"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <button
                    onClick={() => {
                      if (!saving) setIsCreating(false);
                    }}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-white/5"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={
                      saving || !formData.name || !formData.system_prompt
                    }
                    className="px-5 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: "#f0a086", color: "#27343b" }}
                  >
                    {saving
                      ? "Saving..."
                      : editAgent
                        ? "Save Changes"
                        : "Create agent"}
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
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setViewingAgent(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              ref={detailsRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="specialist-details-title"
              tabIndex={-1}
              className="rounded-2xl p-5 w-full max-w-lg relative z-10 max-h-[80vh] overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-panel)",
                border: "1px solid var(--border-light)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
              }}
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
                  <h3
                    id="specialist-details-title"
                    className="text-lg font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {getAgent(viewingAgent.name).displayName}
                  </h3>
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {getAgent(viewingAgent.name).introduction ||
                      viewingAgent.description}
                  </p>
                </div>
              </div>

              {viewingAgent.system_prompt && (
                <details className="system-details mb-3">
                  <summary>
                    Instructions
                    <WorkspaceIcon name="chevron" size={16} />
                  </summary>
                  <pre
                    className="text-xs p-3 rounded-xl overflow-x-auto whitespace-pre-wrap"
                    style={{
                      backgroundColor: "var(--bg-raised)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {viewingAgent.system_prompt}
                  </pre>
                </details>
              )}
              {error && (
                <p role="alert" className="directory-error">
                  {error}
                </p>
              )}
              {viewingAgent.tools && viewingAgent.tools.length > 0 && (
                <div className="mb-3">
                  <div
                    className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                    style={{ color: "var(--text-faint)" }}
                  >
                    Tools
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {viewingAgent.tools.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--bg-hover)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 mt-4">
                {!viewingAgent.is_builtin && (
                  <>
                    <button
                      className="studio-primary"
                      disabled={!!deletingId}
                      onClick={() => {
                        openEdit(viewingAgent);
                        setViewingAgent(null);
                      }}
                    >
                      Edit agent
                    </button>
                    <button
                      className="studio-primary"
                      style={{ color: "var(--red)" }}
                      disabled={!!deletingId}
                      onClick={() => handleDelete(viewingAgent.id)}
                    >
                      {deletingId ? "Deleting…" : "Delete agent"}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setViewingAgent(null)}
                  className="px-4 py-2 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
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
