/**
 * 商业化功能端到端测试（跑在 4001 端口的临时服务上，AI_DAILY_LIMIT=2）：
 * 敏感词 / 私聊+未读 / 图片上传 / 管理后台权限与角色 / 封禁 / 每日配额。
 * 运行前提：临时服务已启动（AI_DAILY_LIMIT=2 PORT=4001 npx tsx src/index.ts，在 server 目录下跑）。
 */
import { io } from "socket.io-client";
import axios from "axios";

const BASE = "http://localhost:4001";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1x1 透明 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function register(name: string) {
  const res = await axios.post(`${BASE}/api/auth/register`, { username: name, password: "test123456" });
  return { token: res.data.token as string, id: res.data.user.id as string, username: res.data.user.username as string };
}

/** 建立 socket 连接并等待连接完成（握手有延迟，必须先连上再发事件） */
function connect(token: string): Promise<ReturnType<typeof io>> {
  const s = io(BASE, { auth: { token } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket 连接超时")), 6000);
    s.once("connect", () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.once("connect_error", (e: Error) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function auth(token: string) {
  return { headers: { Authorization: `Bearer ${token}` } };
}

function waitFor<T>(socket: ReturnType<typeof io>, event: string, timeout = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时：未收到 ${event}`)), timeout);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  // ---------- 准备 ----------
  const u1 = await register(`com1_${Date.now() % 100000}`);
  const u2 = await register(`com2_${Date.now() % 100000}`);
  const u3 = await register(`com3_${Date.now() % 100000}`);
  const adminLogin = await axios.post(`${BASE}/api/auth/login`, { username: "admin", password: "demo1234" });
  const adminToken = adminLogin.data.token as string;
  console.log("✅ 注册/管理员登录 OK");

  const rooms = await axios.get(`${BASE}/api/rooms`, auth(u1.token));
  const roomId = rooms.data[0].id as string;

  // ---------- 1. 敏感词过滤 ----------
  const s1 = await connect(u1.token);
  const filtered = waitFor<{ content: string }>(s1, "message:new");
  s1.emit("room:join", { roomId });
  await sleep(200);
  s1.emit("message:send", { roomId, content: "你就是个傻逼" });
  const filteredMsg = await filtered;
  console.log("✅ 敏感词过滤:", filteredMsg.content.includes("傻逼") ? "❌ 未过滤！" : `已过滤 → "${filteredMsg.content}"`);

  // ---------- 2. 私聊 DM + 未读 ----------
  const s2 = await connect(u2.token);
  const dmArrived = waitFor<{ content: string }>(s2, "dm:new");
  s1.emit("dm:send", { toUserId: u2.id, content: "你好呀", type: "TEXT" });
  const dm = await dmArrived;
  console.log("✅ DM 实时投递:", dm.content);

  const conv1 = await axios.get(`${BASE}/api/dm/conversations`, auth(u2.token));
  const unread1 = conv1.data.find((c: { user: { id: string } }) => c.user.id === u1.id)?.unreadCount;
  console.log("✅ 未读计数（应为 1）:", unread1);

  const readBack = waitFor(s1, "dm:read");
  s2.emit("dm:open", { fromUserId: u1.id });
  await readBack;
  const conv2 = await axios.get(`${BASE}/api/dm/conversations`, auth(u2.token));
  const unread2 = conv2.data.find((c: { user: { id: string } }) => c.user.id === u1.id)?.unreadCount;
  console.log("✅ 打开会话后未读清零（应为 0）:", unread2);

  // ---------- 3. 图片上传 ----------
  const form = new FormData();
  form.append("image", new Blob([TINY_PNG], { type: "image/png" }), "test.png");
  const uploadRes = await axios.post(`${BASE}/api/upload/image`, form, {
    ...auth(u1.token),
    headers: { ...auth(u1.token).headers, "Content-Type": "multipart/form-data" },
  });
  const imgUrl = uploadRes.data.url as string;
  const imgRes = await axios.get(`${BASE}${imgUrl}`, { responseType: "arraybuffer" });
  console.log("✅ 图片上传与访问:", imgUrl, imgRes.status === 200 && imgRes.data.byteLength > 0 ? "OK" : "❌");

  // ---------- 4. 管理后台：权限 + 角色 + 审计 + 封禁 ----------
  const forbidden = await axios.get(`${BASE}/api/admin/stats`, auth(u1.token)).then(
    () => null,
    (e) => e.response?.status,
  );
  console.log("✅ 普通用户访问管理接口（应为 403）:", forbidden);

  const stats = await axios.get(`${BASE}/api/admin/stats`, auth(adminToken));
  console.log("✅ 管理总览:", JSON.stringify(stats.data));

  await axios.patch(`${BASE}/api/admin/users/${u2.id}/role`, { role: "MEMBER" }, auth(adminToken));
  const audits = await axios.get(`${BASE}/api/admin/audit-logs`, auth(adminToken));
  console.log("✅ 改角色后审计留痕:", audits.data.some((a: { action: string }) => a.action === "role_change") ? "OK" : "❌");

  await axios.patch(`${BASE}/api/admin/users/${u1.id}/ban`, { banned: true }, auth(adminToken));
  // 封禁后：登录被拒 + 已有 token 的 socket 重连被拒
  const bannedLogin = await axios
    .post(`${BASE}/api/auth/login`, { username: u1.username, password: "test123456" })
    .then(
      () => "LOGIN_OK ❌",
      (e) => String(e.response?.status),
    );
  console.log("✅ 封禁用户登录被拒（应为 403）:", bannedLogin);

  const bannedSocket = new Promise<string>((resolve) => {
    const s = io(BASE, { auth: { token: u1.token } });
    s.once("connect_error", (e: Error) => resolve(e.message));
    s.once("connect", () => resolve("CONNECTED ❌"));
  });
  console.log("✅ 封禁用户 socket 被拒（应含「封禁」）:", await Promise.race([bannedSocket, sleep(4000).then(() => "TIMEOUT")]));

  // ---------- 5. 每日配额（AI_DAILY_LIMIT=2，u3 是普通用户） ----------
  const s3 = await connect(u3.token);
  const chatOnce = () =>
    new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("TIMEOUT"), 40000);
      s3.once("ai:done", () => {
        clearTimeout(timer);
        resolve("OK");
      });
      s3.once("ai:error", (p: { message: string }) => {
        clearTimeout(timer);
        resolve(p.message);
      });
      s3.emit("ai:chat", { conversationId: null, content: "回复OK两个字", mode: "GENERAL" });
    });

  const q1 = await chatOnce();
  const q2 = await chatOnce();
  const q3 = await chatOnce();
  console.log("✅ 配额测试 第1次:", q1, "| 第2次:", q2, "| 第3次（应含「额度」）:", q3.slice(0, 30));

  s1.disconnect();
  s2.disconnect();
  s3.disconnect();
  console.log("✅ 商业化功能测试全部完成");
}

main()
  .then(() => process.exit(0))
  .catch((e: Error) => {
    console.error("❌ 测试失败:", e.message);
    process.exit(1);
  });
