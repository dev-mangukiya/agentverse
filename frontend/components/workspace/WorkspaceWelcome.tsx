"use client";

import { useState, type ReactNode } from "react";
import { getAgent } from "@/config/agents";
import { WorkspaceIcon, type WorkspaceIconName } from "./WorkspaceIcon";

export const STARTERS: {
  id: string;
  title: string;
  detail: string;
  prompt: string;
  icon: WorkspaceIconName;
  tone: string;
}[] = [
  {
    id: "research",
    title: "Go down a rabbit hole",
    detail: "Turn a big question into a clear answer.",
    prompt:
      "Research a topic for me. I want a clear overview, reliable sources, and the most useful takeaways. The topic is: ",
    icon: "search",
    tone: "mint",
  },
  {
    id: "writer",
    title: "Find the right words",
    detail: "From a rough idea to a first draft.",
    prompt:
      "Help me write a first draft. Ask about the audience, tone, and goal before you start. Here is my idea: ",
    icon: "pen",
    tone: "peach",
  },
  {
    id: "coding",
    title: "Make something work",
    detail: "Build, debug, or untangle some code.",
    prompt:
      "Help me build or debug something. Explain your approach and give me code I can use. Here is what I am working on: ",
    icon: "code",
    tone: "lavender",
  },
  {
    id: "data",
    title: "Connect the dots",
    detail: "Find the story hiding in your data.",
    prompt:
      "Analyze my data, identify the main patterns, and suggest useful next steps. Here is the context: ",
    icon: "chart",
    tone: "butter",
  },
];

export function CrewArtwork() {
  return (
    <div className="crew-art" aria-hidden="true">
      <svg viewBox="0 0 340 232" fill="none">
        <ellipse
          cx="174"
          cy="126"
          rx="133"
          ry="72"
          stroke="currentColor"
          opacity=".16"
          strokeDasharray="3 7"
          transform="rotate(-16 174 126)"
        />
        <path
          d="m41 74 11 3m-8-9 3 15M284 39l2 12m-8-5 14-2M273 201l7-8m-10 0 12 7"
          stroke="currentColor"
          strokeWidth="2"
          opacity=".5"
          strokeLinecap="round"
        />
        <g className="crew-float-one" transform="rotate(-11 95 100)">
          <rect
            x="43"
            y="50"
            width="97"
            height="108"
            rx="27"
            fill="#bce1cc"
            stroke="#263b36"
            strokeWidth="1.5"
          />
          <path
            d="M66 80h51M64 122c17 15 33 15 51 0"
            stroke="#263b36"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="78" cy="99" r="5" fill="#263b36" />
          <circle cx="104" cy="99" r="5" fill="#263b36" />
          <path
            d="M76 49c0-13 13-19 20-9"
            stroke="#263b36"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
        <g className="crew-float-two" transform="rotate(12 232 105)">
          <rect
            x="181"
            y="47"
            width="100"
            height="112"
            rx="30"
            fill="#d8d0ec"
            stroke="#373147"
            strokeWidth="1.5"
          />
          <path
            d="m207 95 8-5m30 5-8-5M217 122h20"
            stroke="#373147"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="m212 49 9-17 10 16 10-16 8 17"
            stroke="#373147"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
        <g transform="rotate(3 171 160)">
          <rect
            x="120"
            y="111"
            width="104"
            height="99"
            rx="32"
            fill="#f6b79f"
            stroke="#513a32"
            strokeWidth="1.5"
          />
          <circle cx="153" cy="151" r="4" fill="#513a32" />
          <circle cx="189" cy="151" r="4" fill="#513a32" />
          <path
            d="M157 172q14 15 28 0"
            stroke="#513a32"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="m165 109 5-15 8 15" stroke="#513a32" strokeWidth="2" />
        </g>
        <circle cx="37" cy="166" r="5" fill="#f1ce78" />
        <circle cx="302" cy="124" r="4" fill="#f68b6f" />
      </svg>
      <div className="crew-art-caption">
        <span className="status-dot" /> Better together.
      </div>
    </div>
  );
}

export function WorkspaceWelcome({
  composer,
  name,
  onPrompt,
  onExplore,
}: {
  composer: ReactNode;
  name?: string;
  onPrompt: (prompt: string) => void;
  onExplore?: () => void;
}) {
  const [category, setCategory] = useState("all");
  const starters =
    category === "all" ? STARTERS : STARTERS.filter((s) => s.id === category);
  return (
    <div className="workspace-welcome">
      <section className="welcome-hero">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span className="tiny-star">✳</span> A LITTLE HELP. A LOT OF
            POSSIBILITY.
          </div>
          <h1>
            {name ? (
              <>
                Hey {name},<br />
                what&apos;s the big idea?
              </>
            ) : (
              <>
                Big ideas.
                <br />
                <span>Meet your team.</span>
              </>
            )}
          </h1>
          <p>
            A curious researcher. A clever coder. A way with words.
            <br className="desktop-break" /> Your AI crew is here to help you
            make things happen.
          </p>
        </div>
        <CrewArtwork />
      </section>
      <section aria-label="Start a task" className="welcome-composer">
        {composer}
      </section>
      <section className="starter-section" aria-labelledby="starters-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A PLACE TO START</span>
            <h2 id="starters-heading">Less blank page. More possibility.</h2>
          </div>
          <span className="section-note">Pick an idea. Make it yours.</span>
        </div>
        <div className="starter-filters" aria-label="Task categories">
          {[
            ["all", "For you"],
            ["research", "Explore"],
            ["writer", "Write"],
            ["coding", "Build"],
            ["data", "Analyze"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={category === id}
              className={category === id ? "active" : ""}
              onClick={() => setCategory(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="starter-grid">
          {starters.map((s) => (
            <button
              key={s.id}
              className={`starter-card tone-${s.tone}`}
              onClick={() => onPrompt(s.prompt)}
            >
              <div className="starter-card-top">
                <span className="starter-icon">
                  <WorkspaceIcon name={s.icon} size={22} />
                </span>
                <WorkspaceIcon name="arrow" size={18} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.detail}</p>
              <span className="starter-agent">
                {getAgent(s.id).displayName} <span>↗</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="meet-crew">
        <div className="crew-avatar-stack">
          {["research", "coding", "writer", "data"].map((id, i) => (
            <span
              key={id}
              className={`mini-avatar face-${i}`}
              aria-hidden="true"
            >
              <i />
              <i />
            </span>
          ))}
        </div>
        <div>
          <h3>Different talents. One shared goal.</h3>
          <p>The right specialists join in as your task takes shape.</p>
        </div>
        <button className="text-action" onClick={onExplore}>
          Meet the team <WorkspaceIcon name="arrow" size={16} />
        </button>
      </section>
      <div className="workspace-footnote">
        <span>Made for the things you haven&apos;t made yet.</span>
        <span>
          ⌘ K <span className="muted">to find your way</span>
        </span>
      </div>
    </div>
  );
}
