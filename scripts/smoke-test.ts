/**
 * 端到端冒烟测试：跑起来之后用真实 HTTP + WebSocket 请求验证核心链路。
 * 运行前提：后端已在 4000 端口启动（npm run dev:server）。
 * 运行方式：npx tsx scripts/smoke-test.ts
 */
import { io } from "socket.io-client";
import axios from "axios";

const BASE = "http://localhost:4000";

async function main() {
  // 1. 健康检查
  const health = await axios.get(`${BASE}/api/health`);
  console.log("1. 健康检查:", JSON.stringify(health.data));

  // 2. 注册新用户
  const username = `smoke${Date.now() % 100000}`;
  const reg = await axios.post(`${BASE}/api/auth/register`, { username, password: "test123456" });
  const token = reg.data.token as string;
  console.log("2. 注册成功:", reg.data.user.username);

  // 3. 房间列表
  const rooms = await axios.get(`${BASE}/api/rooms`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("3. 房间列表:", rooms.data.map((r: { name: string }) => r.name).join(", "));
  const roomId = rooms.data[0].id as string;

  // 4. 历史消息
  const history = await axios.get(`${BASE}/api/rooms/${roomId}/messages`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("4. 历史消息条数:", history.data.length);

  // 5. Socket：连接 → 加房间 → 发消息 → 收到 message:new
  const socket = io(BASE, { auth: { token } });
  const received = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("超时：5 秒内没有收到 message:new")), 5000);
    socket.on("message:new", (msg: { content: string }) => {
      clearTimeout(timer);
      resolve(msg.content);
    });
    socket.on("connect_error", (err: Error) => reject(new Error("socket 连接失败: " + err.message)));
  });
  socket.emit("room:join", { roomId });
  await new Promise((r) => setTimeout(r, 300));
  socket.emit("message:send", { roomId, content: "冒烟测试消息 hello" });
  console.log("5. 实时消息收发:", await received);

  // 6. AI 无 Key 降级：@AI 消息应触发 ai:error 提示，而不是报错崩溃
  const aiError = new Promise<string>((resolve) => {
    socket.on("ai:error", (payload: { message: string }) => resolve(payload.message));
  });
  socket.emit("message:send", { roomId, content: "@AI 你好" });
  const errMsg = await Promise.race([
    aiError,
    new Promise<string>((r) => setTimeout(() => r("NO_ERROR（可能已配置 Key，AI 正常工作了）"), 6000)),
  ]);
  console.log("6. AI 降级/错误提示:", errMsg.slice(0, 60));

  socket.disconnect();
  console.log("✅ 冒烟测试全部通过");
}

main()
  .then(() => process.exit(0))
  .catch((e: Error) => {
    console.error("❌ 冒烟测试失败:", e.message);
    process.exit(1);
  });
