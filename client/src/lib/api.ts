/**
 * 途正英语 - API Service Layer
 * 对接客户后端: https://tzapp-admin.figo.cn
 * 认证方式: Bearer Token + X-App-Key
 */

// 通过服务端代理转发到客户后端，避免CORS问题
const API_BASE = "/api/tz";
const APP_KEY = "tzk_ce457c0a5a5daf5a5ba0af8c6952f345";

// ============ Token 管理 ============

const TOKEN_KEY = "tz_biz_token";
const REFRESH_TOKEN_KEY = "tz_refresh_token";
const USER_KEY = "tz_user_info";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(bizToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, bizToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function saveUserInfo(user: UserInfo) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getSavedUserInfo(): UserInfo | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ============ 类型定义 ============

export interface UserInfo {
  user_id: string;
  nickname: string;
  avatar: string;
  phone?: string;
  role?: string;
  status?: string;
}

export interface LoginResponse {
  user_info: UserInfo;
  biz_token: string;
  refresh_token: string;
  im_auth?: {
    app_key: string;
    accid: string;
    im_token: string;
  };
}

export interface CaptchaResponse {
  captchaId: string;
  captchaImage: string; // data:image/svg+xml;base64,... 格式
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

// ============ 请求封装 ============

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-App-Key": APP_KEY,
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  // Token过期，尝试刷新
  if (data.code === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // 重试原请求
      headers["Authorization"] = `Bearer ${getToken()}`;
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
      });
      return retryResponse.json();
    } else {
      clearTokens();
      throw new Error("AUTH_EXPIRED");
    }
  }

  return data;
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-App-Key": APP_KEY,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const data: ApiResponse<{ biz_token: string; refresh_token: string }> =
      await response.json();

    if (data.code === 200) {
      setTokens(data.data.biz_token, data.data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ============ 认证接口（对接客户真实API）============

/** 获取图形验证码 */
export async function getCaptcha(): Promise<CaptchaResponse> {
  const res = await request<CaptchaResponse>("/api/v1/auth/captcha", {
    method: "GET",
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 用户登录 */
export async function login(params: {
  phone: string;
  password: string;
  captchaId?: string;
  captchaCode?: string;
}): Promise<LoginResponse> {
  const res = await request<LoginResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (res.code !== 200) throw new Error(res.msg);

  // 保存token和用户信息
  setTokens(res.data.biz_token, res.data.refresh_token);
  saveUserInfo(res.data.user_info);

  return res.data;
}

/** 用户注册 */
export async function register(params: {
  phone: string;
  password: string;
  nickname?: string;
  role?: string;
}): Promise<{ user_id: string }> {
  const res = await request<{ user_id: string }>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ ...params, role: params.role || "student" }),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 获取当前用户信息 */
export async function getMe(): Promise<{ user_info: UserInfo }> {
  const res = await request<{ user_info: UserInfo }>("/api/v1/auth/me");
  if (res.code !== 200) throw new Error(res.msg);
  saveUserInfo(res.data.user_info);
  return res.data;
}

/** 退出登录 */
export async function logout(): Promise<void> {
  try {
    await request("/api/v1/auth/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

// ============ 测评接口（Mock，后续对接后端）============

export interface TestQuestion {
  id: string;
  level: number;
  text: string;
  audioUrl?: string;
}

export interface TestEvaluation {
  score: number;
  nextLevel: number;
  feedback: string;
  shouldTerminate: boolean;
  finalLevel?: number;
}

export interface TestResult {
  level: number;
  levelName: string;
  levelLabel: string;
  questionCount: number;
  scores: number[];
  recommendation: string;
}

/**
 * 开始测评（Mock）
 * 后续对接: POST /api/v1/test/start
 */
export async function startTest(): Promise<{ sessionId: string; firstQuestion: TestQuestion }> {
  // Mock: 返回模拟数据
  return {
    sessionId: `session_${Date.now()}`,
    firstQuestion: {
      id: "q1",
      level: 1,
      text: "Hello! What is your name? Can you tell me a little about yourself?",
    },
  };
}

/**
 * 提交回答并获取评估（Mock）
 * 后续对接: POST /api/v1/test/evaluate
 */
export async function submitAnswer(_params: {
  sessionId: string;
  questionId: string;
  audioUrl?: string;
  transcription?: string;
}): Promise<TestEvaluation> {
  // Mock: 随机评估
  await new Promise((r) => setTimeout(r, 800));
  return {
    score: Math.floor(Math.random() * 4),
    nextLevel: Math.floor(Math.random() * 4),
    feedback: "Good. Let me ask you another question.",
    shouldTerminate: false,
  };
}

/**
 * 获取测评结果（Mock）
 * 后续对接: GET /api/v1/test/result/:sessionId
 */
export async function getTestResult(_sessionId: string): Promise<TestResult> {
  // Mock
  return {
    level: 1,
    levelName: "一级",
    levelLabel: "初中水平",
    questionCount: 6,
    scores: [1, 1, 2, 1, 1, 1],
    recommendation: "推荐加入初级口语营",
  };
}
