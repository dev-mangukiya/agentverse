import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Cortex AI — Autonomous Multi-Agent AI Workforce",
  description:
    "A production-style multi-agent AI command center with real-time orchestration, planning, and observable agent communication.",
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
