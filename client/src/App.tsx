import { useState } from "react";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Chat from "./pages/Chat";
import Admin from "./pages/Admin";

/**
 * 最顶层路由（项目规模小，用 state 切换即可，不需要 react-router）：
 * 未登录 → 登录/注册页；已登录 → 聊天室 / 管理后台（仅管理员）。
 */
export default function App() {
  const { user, loading } = useAuth();
  const [authPage, setAuthPage] = useState<"login" | "register">("login");
  const [showAdmin, setShowAdmin] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        加载中…
      </div>
    );
  }

  if (!user) {
    return authPage === "login" ? (
      <Login onGoRegister={() => setAuthPage("register")} />
    ) : (
      <Register onGoLogin={() => setAuthPage("login")} />
    );
  }

  if (showAdmin) {
    return <Admin onBack={() => setShowAdmin(false)} />;
  }

  return <Chat onOpenAdmin={() => setShowAdmin(true)} />;
}
