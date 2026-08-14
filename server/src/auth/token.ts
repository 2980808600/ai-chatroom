/**
 * JWT 签发与校验。REST 接口和 Socket.io 握手共用这一套逻辑。
 *
 * 原理：登录成功后服务端用密钥签一个 token 发给客户端，里面只放 userId；
 * 之后每次请求带上 token，服务端校验签名即可知道「你是谁」，
 * 不用每次查数据库验证密码。token 被篡改或过期都会校验失败。
 */
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface JwtPayload {
  userId: string;
}

const EXPIRES_IN = "7d";

export function signToken(userId: string): string {
  return jwt.sign({ userId } satisfies JwtPayload, config.jwtSecret, {
    expiresIn: EXPIRES_IN,
  });
}

/** 校验失败（过期/被篡改/格式错误）返回 null，而不是抛异常 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JwtPayload;
  } catch {
    return null;
  }
}
