import { useState, useEffect, useCallback, createContext, useContext } from "react";

const TOKEN_KEY = "auth_token";
const ROLE_KEY = "auth_role";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  role: "admin" | "user" | null;
  login: (password: string) => Promise<{ success: boolean; error?: string }>;
  loginUser: (email: string, password: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  register: (email: string, password: string, name: string) => Promise<{ success: boolean; error?: string; requiresVerification?: boolean }>;
  verifyEmail: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
  resendCode: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "user" | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const savedRole = localStorage.getItem(ROLE_KEY);
    if (token) {
      fetch("/api/status", {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        if (res.ok) {
          setIsAuthenticated(true);
          setRole((savedRole as "admin" | "user") || "admin");
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(ROLE_KEY);
          setIsAuthenticated(false);
        }
        setIsLoading(false);
      }).catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        setIsAuthenticated(false);
        setIsLoading(false);
      });
    } else {
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(ROLE_KEY, "admin");
        setIsAuthenticated(true);
        setRole("admin");
        return { success: true };
      }
      return { success: false, error: "Invalid password" };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const loginUser = useCallback(async (email: string, password: string): Promise<{ success: boolean; error?: string; requiresVerification?: boolean }> => {
    try {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(ROLE_KEY, "user");
        setIsAuthenticated(true);
        setRole("user");
        return { success: true };
      }
      return { success: false, error: data.message, requiresVerification: data.requiresVerification };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<{ success: boolean; error?: string; requiresVerification?: boolean }> => {
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, requiresVerification: data.requiresVerification };
      }
      return { success: false, error: data.message };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(ROLE_KEY, "user");
        setIsAuthenticated(true);
        setRole("user");
        return { success: true };
      }
      return { success: false, error: data.message };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const resendCode = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return res.ok ? { success: true } : { success: false, error: data.message };
    } catch {
      return { success: false, error: "Connection error" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    setIsAuthenticated(false);
    setRole(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, role, login, loginUser, register, verifyEmail, resendCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
