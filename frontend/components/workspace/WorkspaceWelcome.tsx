"use client";

import type { ReactNode } from "react";
import { WorkspaceIcon, type WorkspaceIconName } from "./WorkspaceIcon";

export const STARTERS: {
  id: string;
  title: string;
  prompt: string;
  icon: WorkspaceIconName;
}[] = [
  {
    id: "research",
    title: "Research a topic",
    prompt:
      "Help me research a topic and explain the key findings with sources. My topic is: ",
    icon: "search",
  },
  {
    id: "writer",
    title: "Write a draft",
    prompt:
      "Help me write a draft. Ask me about the audience and tone first. I want to write: ",
    icon: "pen",
  },
  {
    id: "coding",
    title: "Fix some code",
    prompt:
      "Help me understand and fix a coding problem. Here is what I am trying to do: ",
    icon: "code",
  },
  {
    id: "data",
    title: "Explore my data",
    prompt: "Help me find useful patterns in my data. Here is the context: ",
    icon: "chart",
  },
];

export function WorkspaceWelcome({
  composer,
  onPrompt,
}: {
  composer?: ReactNode;
  onPrompt: (prompt: string) => void;
}) {
  return (
    <div className="workspace-welcome">
      <div className="welcome-copy">
        <span className="welcome-mark" aria-hidden="true">
          ✳
        </span>
        <h1>What can we help you with?</h1>
        <p>
          One chat for research, writing, and code.
          <br />
          Describe your task. AgentVerse picks the right AI helpers.
        </p>
      </div>
      {composer && <section aria-label="Start a chat" className="welcome-composer">{composer}</section>}
      <div className="quick-starts" role="group" aria-label="Try an example">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            className="quick-start"
            onClick={() => onPrompt(starter.prompt)}
          >
            <WorkspaceIcon name={starter.icon} size={16} />
            <span>{starter.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
