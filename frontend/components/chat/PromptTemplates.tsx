"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: string;
  category: Category;
  agent?: string;
  isCustom?: boolean;
}

type Category = "coding" | "research" | "writing" | "data" | "general";

const categoryMeta: Record<Category, { label: string; color: string; icon: string }> = {
  coding: { label: "Coding", color: "var(--agent-coding)", icon: "</>" },
  research: { label: "Research", color: "var(--agent-research)", icon: "R" },
  writing: { label: "Writing", color: "var(--agent-writer)", icon: "W" },
  data: { label: "Data", color: "var(--agent-data)", icon: "D" },
  general: { label: "General", color: "var(--text-muted)", icon: "G" },
};

const BUILT_IN_TEMPLATES: Template[] = [
  // Coding
  { id: "c1", title: "Python Web Scraper", description: "Build a web scraper with error handling", prompt: "Write a Python web scraper using BeautifulSoup that scrapes the top headlines from a news website. Include proper error handling, rate limiting, and output the results as JSON.", icon: "PY", category: "coding", agent: "coding" },
  { id: "c2", title: "REST API Endpoint", description: "Create a FastAPI endpoint with validation", prompt: "Create a FastAPI REST API endpoint for a todo list application with CRUD operations. Include Pydantic models for validation, proper HTTP status codes, and async database operations.", icon: "API", category: "coding", agent: "coding" },
  { id: "c3", title: "Debug This Code", description: "Analyze and fix code issues", prompt: "Analyze the following code for bugs, performance issues, and security vulnerabilities. Provide fixes and explain each issue:\n\n```\n// paste your code here\n```", icon: "DBG", category: "coding", agent: "coding" },
  { id: "c4", title: "React Component", description: "Build an interactive React component", prompt: "Build a React component for a searchable, sortable data table with pagination. Use TypeScript, include loading states, empty states, and make it accessible. No external UI libraries.", icon: "JSX", category: "coding", agent: "coding" },

  // Research
  { id: "r1", title: "Market Research", description: "Analyze a market or industry", prompt: "Conduct a comprehensive market analysis of the [industry] sector. Cover market size, key players, growth trends, challenges, and future outlook. Cite sources where possible.", icon: "MKT", category: "research", agent: "research" },
  { id: "r2", title: "Compare Technologies", description: "Side-by-side tech comparison", prompt: "Compare [Technology A] vs [Technology B] for a production application. Cover: performance, scalability, developer experience, ecosystem, community, and provide a recommendation with justification.", icon: "VS", category: "research", agent: "research" },
  { id: "r3", title: "Literature Review", description: "Summarize research on a topic", prompt: "Provide a comprehensive literature review on [topic]. Summarize key findings from recent research, identify gaps in current knowledge, and suggest directions for future investigation.", icon: "LIT", category: "research", agent: "research" },
  { id: "r4", title: "Latest News Analysis", description: "Find and analyze recent news", prompt: "Search for the latest news and developments about [topic]. Summarize the key stories, analyze their implications, and provide context for why they matter.", icon: "NEWS", category: "research", agent: "research" },

  // Writing
  { id: "w1", title: "Professional Email", description: "Draft a polished business email", prompt: "Draft a professional email to [recipient] regarding [topic]. The tone should be [formal/friendly/persuasive]. Key points to cover:\n- Point 1\n- Point 2\n- Point 3", icon: "MAIL", category: "writing", agent: "writer" },
  { id: "w2", title: "Blog Post", description: "Write an engaging blog article", prompt: "Write an engaging blog post about [topic]. Target audience: [audience]. Include an attention-grabbing introduction, 3-5 main sections with subheadings, practical examples, and a compelling conclusion with a call to action.", icon: "BLOG", category: "writing", agent: "writer" },
  { id: "w3", title: "Technical Documentation", description: "Create clear technical docs", prompt: "Write technical documentation for [feature/API/library]. Include: overview, installation/setup, quick start guide, API reference with code examples, troubleshooting section, and FAQ.", icon: "DOC", category: "writing", agent: "writer" },
  { id: "w4", title: "Social Media Content", description: "Create platform-specific posts", prompt: "Create a social media content package for [product/announcement]. Include posts optimized for Twitter/X (280 chars), LinkedIn (professional tone), and Instagram (casual, with hashtags).", icon: "SOC", category: "writing", agent: "writer" },

  // Data
  { id: "d1", title: "Data Analysis Plan", description: "Design an analysis approach", prompt: "I have a dataset with [describe data]. Help me design a data analysis plan: what questions to ask, which statistical methods to use, what visualizations would be most insightful, and how to interpret the results.", icon: "ANA", category: "data", agent: "data" },
  { id: "d2", title: "SQL Query Builder", description: "Write complex SQL queries", prompt: "Write an optimized SQL query to [describe what you need]. The database has the following tables:\n- Table1 (columns...)\n- Table2 (columns...)\nInclude proper JOINs, indexing suggestions, and explain the query plan.", icon: "SQL", category: "data", agent: "data" },
  { id: "d3", title: "Dashboard Design", description: "Plan a data dashboard", prompt: "Design a dashboard for monitoring [what]. Specify: KPIs to track, chart types for each metric, data refresh frequency, alert thresholds, and layout recommendations.", icon: "DASH", category: "data", agent: "data" },
  { id: "d4", title: "Data Cleaning Pipeline", description: "Process and clean messy data", prompt: "Write a Python data cleaning pipeline for a dataset with these issues: [describe issues like missing values, duplicates, inconsistent formats]. Use pandas and include validation checks.", icon: "ETL", category: "data", agent: "data" },
];

const STORAGE_KEY = "agentverse_custom_templates";

function loadCustomTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: Template[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

interface PromptTemplatesProps {
  onInsert: (prompt: string) => void;
  onClose: () => void;
}

export function PromptTemplates({ onInsert, onClose }: PromptTemplatesProps) {
  const [activeCategory, setActiveCategory] = useState<Category | "all" | "custom">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [customTemplates, setCustomTemplates] = useState<Template[]>(loadCustomTemplates);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("general");
  const panelRef = useRef<HTMLDivElement>(null);

  const allTemplates = [...BUILT_IN_TEMPLATES, ...customTemplates];

  const filteredTemplates = allTemplates.filter((t) => {
    const matchesCategory =
      activeCategory === "all" ||
      (activeCategory === "custom" ? t.isCustom : t.category === activeCategory);
    const matchesSearch =
      !searchQuery ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCreate = () => {
    if (!newTitle.trim() || !newPrompt.trim()) return;
    const custom: Template = {
      id: `custom-${Date.now()}`,
      title: newTitle.trim(),
      description: "Custom template",
      prompt: newPrompt.trim(),
      icon: "MY",
      category: newCategory,
      isCustom: true,
    };
    const updated = [...customTemplates, custom];
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
    setShowCreateForm(false);
    setNewTitle("");
    setNewPrompt("");
  };

  const handleDeleteCustom = (id: string) => {
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    saveCustomTemplates(updated);
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-full left-0 right-0 mb-2 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50"
      style={{
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border-muted)",
        maxHeight: "420px",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Prompt Templates
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="text-[10px] font-medium px-2.5 py-1 rounded-lg transition-colors"
            style={{
              backgroundColor: showCreateForm ? "var(--brand-dim)" : "var(--bg-hover)",
              color: showCreateForm ? "var(--brand-text)" : "var(--text-muted)",
            }}
          >
            {showCreateForm ? "Cancel" : "+ Custom"}
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "var(--text-faint)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; }}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="px-4 py-3 space-y-2">
              <input
                type="text"
                placeholder="Template name..."
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              />
              <textarea
                placeholder="Prompt text..."
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={3}
                className="w-full px-3 py-1.5 rounded-lg text-xs outline-none resize-none"
                style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
              />
              <div className="flex items-center gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as Category)}
                  className="flex-1 px-2 py-1.5 rounded-lg text-xs outline-none"
                  style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
                >
                  {(Object.keys(categoryMeta) as Category[]).map((cat) => (
                    <option key={cat} value={cat}>{categoryMeta[cat].label}</option>
                  ))}
                </select>
                <button
                  onClick={handleCreate}
                  disabled={!newTitle.trim() || !newPrompt.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: newTitle.trim() && newPrompt.trim() ? "var(--brand)" : "var(--bg-raised)",
                    color: newTitle.trim() && newPrompt.trim() ? "white" : "var(--text-faint)",
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category tabs + search */}
      <div className="flex items-center gap-1.5 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        {[
          { id: "all" as const, label: "All" },
          ...Object.entries(categoryMeta).map(([id, meta]) => ({ id: id as Category, label: meta.icon })),
          ...(customTemplates.length > 0 ? [{ id: "custom" as const, label: "Saved" }] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap"
            style={{
              backgroundColor: activeCategory === tab.id ? "var(--brand-dim)" : "transparent",
              color: activeCategory === tab.id ? "var(--brand-text)" : "var(--text-muted)",
              border: `1px solid ${activeCategory === tab.id ? "color-mix(in srgb, var(--brand) 20%, transparent)" : "transparent"}`,
            }}
          >
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-24 px-2 py-1 rounded-lg text-[11px] outline-none"
          style={{ backgroundColor: "var(--bg-raised)", border: "1px solid var(--border-subtle)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Template list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-8 px-4">
            <div className="text-sm font-medium mb-1" style={{ color: "var(--text-faint)", fontFamily: "monospace" }}>TEMPLATES</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>No templates found</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2">
            {filteredTemplates.map((template) => {
              const catMeta = categoryMeta[template.category];
              return (
                <button
                  key={template.id}
                  onClick={() => {
                    onInsert(template.prompt);
                    onClose();
                  }}
                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group/tmpl relative"
                  style={{
                    backgroundColor: "var(--bg-raised)",
                    border: "1px solid var(--border-subtle)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `color-mix(in srgb, ${catMeta.color} 30%, transparent)`;
                    e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-subtle)";
                    e.currentTarget.style.backgroundColor = "var(--bg-raised)";
                  }}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{template.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {template.title}
                    </div>
                    <div className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-faint)" }}>
                      {template.description}
                    </div>
                  </div>
                  {template.isCustom && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustom(template.id); }}
                      className="absolute top-1.5 right-1.5 w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/tmpl:opacity-100 transition-opacity"
                      style={{ color: "var(--text-faint)" }}
                    >
                      <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
