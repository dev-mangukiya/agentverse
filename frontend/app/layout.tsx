import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/lib/auth";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <meta name="theme-color" content="#08080d" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f5f5fa':'#08080d')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`,
          }}
        />
      </head>
      <body className="safe-area-body">
        <ThemeProvider>
          <AuthProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

