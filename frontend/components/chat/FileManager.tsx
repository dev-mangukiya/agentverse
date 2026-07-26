"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  mimeType: string;
  timestamp: number;
  preview?: string; // base64 data URL for images
}

interface FileManagerProps {
  onReattach: (file: { name: string; size: number; content: string; mimeType: string; preview?: string }) => void;
  onClose: () => void;
}

const DB_NAME = "agentverse_files";
const STORE_NAME = "files";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllFiles(): Promise<StoredFile[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const files = (req.result as StoredFile[]).sort((a, b) => b.timestamp - a.timestamp);
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function storeFile(file: StoredFile & { content: string }): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(file);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFileContent(id: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result?.content || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string): string {
  if (type.startsWith("image")) return "🖼️";
  if (type.includes("pdf")) return "📕";
  if (type.includes("json")) return "📦";
  if (type.includes("text") || type.includes("plain")) return "📄";
  if (type.includes("javascript") || type.includes("typescript")) return "💛";
  if (type.includes("python")) return "🐍";
  if (type.includes("html")) return "🌐";
  if (type.includes("css")) return "🎨";
  if (type.includes("zip") || type.includes("tar")) return "📦";
  return "📎";
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 60000);
  if (diff < 1) return "Just now";
  if (diff < 60) return `${diff}m ago`;
  const hr = Math.floor(diff / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function FileManager({ onReattach, onClose }: FileManagerProps) {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const loadFiles = useCallback(async () => {
    const allFiles = await getAllFiles();
    setFiles(allFiles);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);

    for (const file of droppedFiles) {
      const reader = new FileReader();
      reader.onload = async () => {
        const content = reader.result as string;
        const isImage = file.type.startsWith("image");
        const stored: StoredFile & { content: string } = {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          mimeType: file.type,
          timestamp: Date.now(),
          preview: isImage ? content : undefined,
          content,
        };
        await storeFile(stored);
        loadFiles();
      };
      reader.readAsDataURL(file);
    }
  }, [loadFiles]);

  const handleDelete = async (id: string) => {
    await deleteFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleReattach = async (file: StoredFile) => {
    const content = await getFileContent(file.id);
    if (content) {
      onReattach({
        name: file.name,
        size: file.size,
        content,
        mimeType: file.mimeType,
        preview: file.preview,
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
      style={{
        backgroundColor: "var(--bg-panel)",
        borderLeft: "1px solid var(--border-subtle)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📁</span>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            File Manager
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-hover)", color: "var(--text-faint)" }}>
            {files.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "var(--text-faint)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-faint)"; e.currentTarget.style.backgroundColor = "transparent"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Drop zone */}
      <div
        className="mx-3 mt-3 mb-2 py-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-200 cursor-pointer"
        style={{
          borderColor: dragOver ? "var(--brand)" : "var(--border-muted)",
          backgroundColor: dragOver ? "var(--brand-dim)" : "var(--bg-raised)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="text-xl mb-1">{dragOver ? "📥" : "📎"}</div>
        <div className="text-xs font-medium" style={{ color: dragOver ? "var(--brand-text)" : "var(--text-muted)" }}>
          {dragOver ? "Drop to upload" : "Drag & drop files here"}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>
          Files are stored locally in your browser
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <span className="w-4 h-4 border-[1.5px] rounded-full animate-spin" style={{ borderColor: "var(--border-muted)", borderTopColor: "var(--brand)" }} />
          </div>
        )}

        {!loading && files.length === 0 && (
          <div className="text-center py-8">
            <div className="text-lg mb-1">📂</div>
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
              No files stored yet
            </div>
          </div>
        )}

        <AnimatePresence>
          {files.map((file) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 group/file transition-colors duration-150"
              style={{ backgroundColor: "transparent" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
            >
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.name}
                  className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-base" style={{ backgroundColor: "var(--bg-raised)" }}>
                  {fileIcon(file.mimeType)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                  {file.name}
                </div>
                <div className="text-[10px] flex items-center gap-2" style={{ color: "var(--text-faint)" }}>
                  <span>{formatSize(file.size)}</span>
                  <span>•</span>
                  <span>{timeAgo(file.timestamp)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover/file:opacity-100 transition-opacity">
                <button
                  onClick={() => handleReattach(file)}
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--brand)"; e.currentTarget.style.backgroundColor = "var(--brand-dim)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  title="Re-attach to chat"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(file.id)}
                  className="w-6 h-6 rounded-md flex items-center justify-center transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.backgroundColor = "var(--red-dim)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                  title="Delete"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
