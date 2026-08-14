import { useCallback, useEffect, useState } from "react";
import { http, apiErrorMessage } from "../api/http";

/**
 * 管理后台（仅 ADMIN 可见）：总览 / 用户管理 / AI 成本 / 审计日志。
 * 商业化运营的三大件：控制用户（封禁/角色）、看清成本（token × 单价）、追溯操作（审计）。
 */

interface Stats {
  userCount: number;
  roomCount: number;
  bannedCount: number;
  messageToday: number;
  aiRequestsToday: number;
  costToday: number;
}

interface AdminUser {
  id: string;
  username: string;
  avatarColor: string;
  role: string;
  banned: boolean;
  createdAt: string;
  totalAiRequests: number;
  aiToday: number;
}

interface AuditEntry {
  id: string;
  action: string;
  detail: string;
  ip: string;
  createdAt: string;
}

interface AiRequest {
  id: string;
  username: string;
  provider: string;
  scope: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: number;
  createdAt: string;
}

type Tab = "overview" | "users" | "cost" | "audit";

const ACTION_LABELS: Record<string, string> = {
  login_success: "登录成功",
  login_failed: "登录失败",
  register: "注册",
  room_create: "创建房间",
  role_change: "角色变更",
  user_ban: "封禁/解封",
  room_delete: "删除房间",
};

const STATUS_LABELS: Record<string, string> = {
  OK: "成功",
  ERROR: "失败",
  REFUSED: "被拒绝",
};

export default function Admin({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<AiRequest[]>([]);
  const [audits, setAudits] = useState<AuditEntry[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    http.get<Stats>("/admin/stats").then((res) => setStats(res.data)).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  const loadUsers = useCallback(() => {
    http.get<AdminUser[]>("/admin/users", { params: query ? { q: query } : {} })
      .then((res) => setUsers(res.data))
      .catch((e) => setError(apiErrorMessage(e)));
  }, [query]);

  const loadRequests = useCallback(() => {
    http.get<AiRequest[]>("/admin/ai-requests").then((res) => setRequests(res.data)).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  const loadAudits = useCallback(() => {
    http.get<AuditEntry[]>("/admin/audit-logs").then((res) => setAudits(res.data)).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    if (tab === "users") loadUsers();
    if (tab === "cost") loadRequests();
    if (tab === "audit") loadAudits();
  }, [tab, loadUsers, loadRequests, loadAudits]);

  const changeRole = async (id: string, role: string) => {
    await http.patch(`/admin/users/${id}/role`, { role });
    loadUsers();
  };
  const toggleBan = async (id: string, banned: boolean) => {
    await http.patch(`/admin/users/${id}/ban`, { banned });
    loadUsers();
    loadStats();
  };

  const tabBtn = (key: Tab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`rounded-lg px-4 py-2 text-sm transition ${
        tab === key ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-200">
            ← 返回聊天室
          </button>
          <h1 className="font-bold">🛠 管理后台</h1>
        </div>
        <div className="flex gap-2">{tabBtn("overview", "总览")}{tabBtn("users", "用户管理")}{tabBtn("cost", "AI 成本")}{tabBtn("audit", "审计日志")}</div>
      </header>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <main className="p-6">
        {tab === "overview" && stats && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "注册用户", value: stats.userCount },
              { label: "被封禁", value: stats.bannedCount },
              { label: "房间数", value: stats.roomCount },
              { label: "今日消息", value: stats.messageToday },
              { label: "今日 AI 请求", value: stats.aiRequestsToday },
              { label: "今日 AI 成本（$）", value: stats.costToday.toFixed(4), highlight: true },
            ].map((s) => (
              <div
                key={s.label}
                className={`rounded-2xl border p-5 ${s.highlight ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/60"}`}
              >
                <div className="text-xs text-zinc-500">{s.label}</div>
                <div className={`mt-2 text-3xl font-bold ${s.highlight ? "text-amber-300" : ""}`}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "users" && (
          <div>
            <div className="mb-4 flex gap-2">
              <input
                className="w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                placeholder="搜索用户名…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button onClick={loadUsers} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500">
                搜索
              </button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">用户</th>
                    <th className="px-4 py-3">角色</th>
                    <th className="px-4 py-3">今日 AI / 累计</th>
                    <th className="px-4 py-3">状态</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-t border-zinc-800">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                            style={{ backgroundColor: u.avatarColor }}
                          >
                            {u.username.charAt(0).toUpperCase()}
                          </span>
                          {u.username}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => void changeRole(u.id, e.target.value)}
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none"
                        >
                          <option value="USER">普通用户</option>
                          <option value="MEMBER">会员</option>
                          <option value="ADMIN">管理员</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {u.aiToday} / {u.totalAiRequests}
                      </td>
                      <td className="px-4 py-3">
                        {u.banned ? <span className="text-red-400">已封禁</span> : <span className="text-emerald-400">正常</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => void toggleBan(u.id, !u.banned)}
                          className={`rounded border px-2.5 py-1 text-xs transition ${
                            u.banned
                              ? "border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
                              : "border-red-500/50 text-red-300 hover:bg-red-500/10"
                          }`}
                        >
                          {u.banned ? "解封" : "封禁"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "cost" && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">用户</th>
                  <th className="px-4 py-3">供应商</th>
                  <th className="px-4 py-3">用途</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">输入/输出 token</th>
                  <th className="px-4 py-3">成本（$）</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-xs text-zinc-400">{new Date(r.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-3">{r.username}</td>
                    <td className="px-4 py-3">{r.provider}</td>
                    <td className="px-4 py-3">{r.scope === "chat" ? "私聊助手" : r.scope === "room" ? "群聊机器人" : "消息总结"}</td>
                    <td className="px-4 py-3">
                      <span className={r.status === "OK" ? "text-emerald-400" : "text-red-400"}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.inputTokens ?? "-"} / {r.outputTokens ?? "-"}
                    </td>
                    <td className="px-4 py-3 text-amber-300">{r.cost.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "audit" && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3">时间</th>
                  <th className="px-4 py-3">动作</th>
                  <th className="px-4 py-3">详情</th>
                  <th className="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-xs text-zinc-400">{new Date(a.createdAt).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-3">{ACTION_LABELS[a.action] ?? a.action}</td>
                    <td className="px-4 py-3 text-zinc-300">{a.detail}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
