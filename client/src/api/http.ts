import axios from "axios";

/** 统一的 HTTP 客户端：自动带上 JWT，401 时广播「登录过期」事件 */
export const http = axios.create({ baseURL: "/api" });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      // token 失效：清掉本地状态并通知 AuthContext 回到登录页
      localStorage.removeItem("token");
      window.dispatchEvent(new Event("auth-expired"));
    }
    return Promise.reject(error);
  },
);

/** 从 axios 错误里提取后端返回的 message */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message ?? "请求失败，请稍后再试";
  }
  return "请求失败，请稍后再试";
}
