import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthResponse, UserPublic } from "shared";
import { http } from "../api/http";
import { connectSocket, disconnectSocket } from "../api/socket";

/**
 * 登录态管理：
 * - user：当前用户；token 存在 localStorage，刷新页面后通过 GET /auth/me 恢复
 * - 登录/注册成功后立刻建立 socket 连接
 * - 401 拦截器触发 auth-expired 事件时自动登出
 */
interface AuthContextValue {
  user: UserPublic | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 刷新页面：拿本地 token 换用户信息，恢复登录态
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    http
      .get<UserPublic>("/auth/me")
      .then((res) => {
        setUser(res.data);
        connectSocket(token);
      })
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));

    const onExpired = () => {
      setUser(null);
      disconnectSocket();
    };
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await http.post<AuthResponse>("/auth/login", { username, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    connectSocket(res.data.token);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const res = await http.post<AuthResponse>("/auth/register", { username, password });
    localStorage.setItem("token", res.data.token);
    setUser(res.data.user);
    connectSocket(res.data.token);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
    disconnectSocket();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
