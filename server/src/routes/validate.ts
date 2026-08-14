import type { Request, Response } from "express";
import { z } from "zod";

/**
 * 用 zod 校验请求体。校验失败自动返回 400 并给出具体字段错误。
 * 返回值：通过校验的数据（z.infer 推导出准确的输出类型）；失败返回 null（调用方直接 return 即可）。
 */
export function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      message: "参数错误",
      details: result.error.flatten().fieldErrors,
    });
    return null;
  }
  return result.data;
}
