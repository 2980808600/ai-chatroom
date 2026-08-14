import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/http";

interface Props {
  onGoRegister: () => void;
}

export default function Login({ onGoRegister }: Props) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      // 登录成功后 AuthContext 会更新 user，App 自动切换到聊天室
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-950 via-indigo-950 to-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-bold">✨ AI 聊天室</h1>
        <p className="mt-1 text-sm text-zinc-400">实时聊天 + AI 助手，欢迎回来</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">用户名</label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alice"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">密码</label>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="mt-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          还没有账号？{" "}
          <button className="text-indigo-400 hover:underline" onClick={onGoRegister}>
            去注册
          </button>
        </p>
        <p className="mt-3 text-center text-xs text-zinc-600">演示账号：alice / bob，密码 demo1234</p>
      </div>
    </div>
  );
}
