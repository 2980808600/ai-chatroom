/**
 * 数据库种子脚本：创建演示账号、房间和一些初始消息。
 * 运行方式：npm run db:seed（由根目录 npm run db:seed 触发）
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 先清空旧数据（注意按外键依赖顺序删除）
  await prisma.aiMessage.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.aiRequestLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.directMessage.deleteMany();
  await prisma.message.deleteMany();
  await prisma.room.deleteMany();
  await prisma.user.deleteMany();

  // 演示账号（密码都是 demo1234）
  const passwordHash = bcrypt.hashSync("demo1234", 10);
  const alice = await prisma.user.create({
    data: { username: "alice", passwordHash, avatarColor: "#6366f1", role: "USER" },
  });
  const bob = await prisma.user.create({
    data: { username: "bob", passwordHash, avatarColor: "#10b981", role: "MEMBER" }, // 会员，AI 不限量
  });
  await prisma.user.create({
    data: { username: "admin", passwordHash, avatarColor: "#f59e0b", role: "ADMIN" },
  });

  // 演示房间
  const lounge = await prisma.room.create({
    data: { name: "闲聊大厅", description: "随便聊聊", createdById: alice.id },
  });
  const tech = await prisma.room.create({
    data: { name: "技术讨论", description: "编程、架构、踩坑分享", createdById: bob.id },
  });
  const aiLab = await prisma.room.create({
    data: { name: "AI 实验室", description: "试试 @AI 提问、AI 总结", createdById: alice.id },
  });

  // 初始消息，让房间不是空的
  await prisma.message.createMany({
    data: [
      { roomId: lounge.id, userId: alice.id, type: "TEXT", content: "大家好，欢迎来到闲聊大厅 👋" },
      { roomId: lounge.id, userId: bob.id, type: "TEXT", content: "嗨！这个聊天室还带 AI，发消息 @AI 试试" },
      { roomId: tech.id, userId: bob.id, type: "TEXT", content: "今天聊聊 Socket.io 是怎么做到实时通信的" },
      { roomId: tech.id, userId: alice.id, type: "TEXT", content: "本质就是 WebSocket 长连接，服务端可以随时向客户端推送消息" },
      { roomId: aiLab.id, userId: alice.id, type: "TEXT", content: "在这里 @AI 提问，或点输入框下面的「总结最近消息」" },
    ],
  });

  console.log("✅ 种子数据完成：");
  console.log("   账号：alice（普通）/ bob（会员）/ admin（管理员），密码都是 demo1234");
  console.log(`   房间：${lounge.name}、${tech.name}、${aiLab.name}`);
}

main()
  .catch((e) => {
    console.error("❌ 种子数据失败：", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
