import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentVerse — Autonomous Multi-Agent AI Workforce",
  description:
    "A production-style multi-agent AI command center with real-time orchestration, planning, and observable agent communication.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
