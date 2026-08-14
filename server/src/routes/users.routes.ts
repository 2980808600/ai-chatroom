import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired, getUserId } from "../auth/middleware.js";
import { toUserPublic } from "../utils.js";

export const usersRoutes = Router();
usersRoutes.use(authRequired);

// GET /api/users?q= —— 按用户名搜索用户（私聊找人用）
usersRoutes.get("/", async (req, res) => {
  const me = getUserId(req);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json([]);
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      username: { contains: q },
      id: { not: me },
      banned: false,
    },
    take: 20,
  });
  res.json(users.map(toUserPublic));
});
