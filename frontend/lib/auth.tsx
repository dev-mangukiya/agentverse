"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { getSessionId } from "./session";

// ── Types ────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error?: string }>;
  googleLogin: (credential: string) => Promise<{ error?: string }>;
  logout: () => void;
}

// ── Constants ────────────────────────────────────────────

const AUTH_TOKEN_KEY = "agentverse_auth_token";
const AUTH_USER_KEY = "agentverse_auth_user";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

// ── Context ──────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoggedIn: false,
  isLoading: true,
  login: async () => ({}),
  register: async () => ({}),
  googleLogin: async () => ({}),
  logout: () => {},
});

// ── Helper: build headers for any API call ───────────────

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
      "X-Session-ID": getSessionId(), // Still send for migration
    };
  }
  return { "X-Session-ID": getSessionId() };
}

// ── Provider ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_USER_KEY);
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {
      // Corrupted data — clear it
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": getSessionId(),
          },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: data.detail || "Login failed" };
        }

        const data = await res.json();
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
        return {};
      } catch {
        return { error: "Network error — please try again" };
      }
    },
    []
  );

  const register = useCallback(
    async (
      name: string,
      email: string,
      password: string
    ): Promise<{ error?: string }> => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": getSessionId(),
          },
          body: JSON.stringify({ name: name || undefined, email, password }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: data.detail || "Registration failed" };
        }

        const data = await res.json();
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
        return {};
      } catch {
        return { error: "Network error — please try again" };
      }
    },
    []
  );

  const googleLogin = useCallback(
    async (credential: string): Promise<{ error?: string }> => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/google`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Session-ID": getSessionId(),
          },
          body: JSON.stringify({ credential }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { error: data.detail || "Google sign-in failed" };
        }

        const data = await res.json();
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
        return {};
      } catch {
        return { error: "Network error — please try again" };
      }
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        isLoading,
        login,
        register,
        googleLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
