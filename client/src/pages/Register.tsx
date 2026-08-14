import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { apiErrorMessage } from "../api/http";

interface Props {
  onGoLogin: () => void;
}

export default function Register({ onGoLogin }: Props) {
  const { register } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setSubmitting(true);
    try {
      await register(username.trim(), password);
      // 注册成功即自动登录，App 切换到聊天室
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
        <p className="mt-1 text-sm text-zinc-400">创建一个账号，开始聊天</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-400">用户名（3-20 个字符）</label>
            <input
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">密码（至少 6 位）</label>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-zinc-400">确认密码</label>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none transition focus:border-indigo-500"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !username || !password || !confirm}
            className="mt-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "注册中…" : "注册并进入"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          已有账号？{" "}
          <button className="text-indigo-400 hover:underline" onClick={onGoLogin}>
            去登录
          </button>
        </p>
      </div>
    </div>
  );
}
