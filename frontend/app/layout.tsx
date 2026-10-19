import type { Metadata } from "next";
import "./globals.css";
import "./studio.css";
import { transition } from "@/config/motion";
import { MotionConfig } from "framer-motion";
import { ThemeProvider } from "@/lib/theme";
import { NotificationProvider } from "@/components/notifications/NotificationProvider";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AgentVerse — Your ideas, in good company",
  description:
    "A friendly workspace for researching, writing, coding, and exploring ideas with a team of AI specialists.",
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
        <meta name="theme-color" content="#202a30" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('agentverse_theme');var t=s==='light'||s==='dark'?s:window.matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f8f7f4':'#202a30')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`,
          }}
        />
      </head>
      <body className="safe-area-body">
        <MotionConfig reducedMotion="user" transition={transition.base}>
          <ThemeProvider>
            <AuthProvider>
              <NotificationProvider>{children}</NotificationProvider>
            </AuthProvider>
          </ThemeProvider>
        </MotionConfig>
      </body>
    </html>
  );
}

