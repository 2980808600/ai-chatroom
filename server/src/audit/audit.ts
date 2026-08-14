/**
 * 审计日志：把「谁在什么时候做了什么」记录到 AuditLog 表。
 *
 * 为什么商业项目必须有审计：
 * 1. 安全事故追溯（谁改了权限、谁删了数据）
 * 2. 合规要求（等保/网安法对日志留存有明确要求）
 * 3. 运营纠纷（用户投诉"我的账号被封了"，一查日志就知道为什么）
 *
 * 注意：audit 表故意不建外键（actorId/targetId 存 ID 字符串），
 * 这样即使关联的用户被删了，审计记录依然完整保留。
 */
import { prisma } from "../prisma.js";

export interface AuditEntry {
  action: string;
  detail?: string;
  ip?: string;
  actorId?: string;
  targetId?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        detail: entry.detail ?? "",
        ip: entry.ip ?? "",
        actorId: entry.actorId ?? null,
        targetId: entry.targetId ?? null,
      },
    });
  } catch (err) {
    // 审计写入失败不能拖垮业务，只记错误日志
    console.error("[audit] 审计日志写入失败：", err);
  }
}
