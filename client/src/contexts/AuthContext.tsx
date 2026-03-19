/**
 * 途正英语 - 认证上下文
 * 基于客户后端API的登录状态管理
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import {
  type UserInfo,
  getToken,
  getSavedUserInfo,
  getMe,
  logout as apiLogout,
  clearTokens,
} from "@/lib/api";

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: UserInfo) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: getSavedUserInfo(),
    loading: !!getToken(),
    isAuthenticated: !!getToken() && !!getSavedUserInfo(),
  });

  // 初始化时验证token
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setState({ user: null, loading: false, isAuthenticated: false });
      return;
    }

    getMe()
      .then((data) => {
        setState({
          user: data.user_info,
          loading: false,
          isAuthenticated: true,
        });
      })
      .catch(() => {
        clearTokens();
        setState({ user: null, loading: false, isAuthenticated: false });
      });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setState({ user: null, loading: false, isAuthenticated: false });
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await getMe();
      setState({
        user: data.user_info,
        loading: false,
        isAuthenticated: true,
      });
    } catch {
      clearTokens();
      setState({ user: null, loading: false, isAuthenticated: false });
    }
  }, []);

  const setUser = useCallback((user: UserInfo) => {
    setState({ user, loading: false, isAuthenticated: true });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
