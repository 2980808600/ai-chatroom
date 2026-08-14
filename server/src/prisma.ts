import { PrismaClient } from "@prisma/client";

/** 全局唯一的 Prisma 客户端实例（每次请求不要 new 一个，会耗尽连接池） */
export const prisma = new PrismaClient();
