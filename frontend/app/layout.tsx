import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "AgentVerse — Superhero Multi-Agent AI Platform",
  description:
    "Your superhero-powered multi-agent AI command center with real-time orchestration, planning, and observable agent collaboration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#08080d" />
      </head>
      <body className="safe-area-body">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
