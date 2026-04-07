/**
 * 途正英语 - API Service Layer
 * 对接客户后端: https://super.tuzheng.cn
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

/** 后端sms-login / login 返回的data结构 */
export interface LoginResponse {
  user_info: UserInfo;
  biz_token: string;
  refresh_token: string;
  is_new_user?: boolean;
  im_auth?: {
    app_key: string;
    accid: string;
    im_token: string;
  };
}

export interface CaptchaResponse {
  captchaId: string;
  captchaImage: string;
}

export interface SendSmsCodeResponse {
  expires_in: number;
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

// ============ 测评相关类型 ============

/** 后端返回的题目结构（firstQuestion / nextQuestion） */
export interface TestQuestion {
  questionId: string;
  level: number;
  text: string;        // 后端用 text，不是 prompt
  audioUrl?: string | null;
}

/** 后端 test/start 返回的data结构 */
export interface StartTestResponse {
  sessionId: string;
  firstQuestion: TestQuestion;
  totalQuestions: number;
  expiresAt: string;
}

/** 后端 test/evaluate 返回的 evaluation 结构 */
export interface EvaluationDetail {
  score: number;
  comprehension: number;
  grammar: number;
  vocabulary: number;
  fluency: number;
  feedback: string;
}

export interface TestScores {
  overall: number;
  comprehension: number;
  grammar: number;
  vocabulary: number;
  pronunciation?: number;
  fluency: number;
}

export interface TestResultData {
  sessionId: string;
  finalLevel: number;
  levelName: string;
  levelLabel: string;
  questionCount: number;
  totalDuration: number;
  scores: TestScores;
}

/** 后端 test/evaluate 返回的data结构 */
export interface EvaluateResponse {
  evaluation: EvaluationDetail;
  nextQuestion: TestQuestion | null;
  nextAction: string;  // "continue" | "complete" 等
  result?: TestResultData;
}

export interface TestResultDetail extends TestResultData {
  userId: string;
  questionDetails?: Array<{
    questionId: string;
    text?: string;
    transcription?: string;
    score?: number;
    feedback?: string;
  }>;
  recommendation: string;
  courseGroupUrl?: string;
  courseGroupQrCode?: string;
  completedAt: string;
}

export interface UploadAudioResponse {
  audioUrl: string;
  duration: number;
  fileSize: number;
}

export interface TranscribeResponse {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

export interface TTSResponse {
  audioUrl: string | null;
  duration: number;
  format: string;
}

export interface TestHistoryItem {
  sessionId: string;
  finalLevel: number | null;
  levelName: string | null;
  levelLabel: string | null;
  questionCount: number;
  totalDuration: number;
  completedAt: string | null;
  status: string;
}

export interface TestHistoryResponse {
  total: number;
  list: TestHistoryItem[];
}

// ============ 请求封装 ============

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "X-App-Key": APP_KEY,
    ...(options.headers as Record<string, string>),
  };

  // 只有非FormData请求才设置Content-Type
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  // Token过期，尝试刷新（防止并发刷新）
  if (data.code === 401 || data.code === 10001) {
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = tryRefreshToken().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const refreshed = await (refreshPromise || tryRefreshToken());
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
      // 触发全局认证错误事件
      window.dispatchEvent(new CustomEvent("auth-error", { detail: "AUTH_EXPIRED" }));
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

// ============ 认证接口 ============

/** 发送短信验证码 */
export async function sendSmsCode(params: {
  phone: string;
  purpose?: "login" | "register" | "reset_password";
}): Promise<SendSmsCodeResponse> {
  const res = await request<SendSmsCodeResponse>("/api/v1/auth/send-sms-code", {
    method: "POST",
    body: JSON.stringify({
      phone: params.phone,
      purpose: params.purpose || "login",
    }),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 短信验证码登录（未注册自动创建账号） */
export async function smsLogin(params: {
  phone: string;
  code: string;
  deviceInfo?: string;
}): Promise<LoginResponse> {
  const res = await request<LoginResponse>("/api/v1/auth/sms-login", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (res.code !== 200) throw new Error(res.msg);

  // 保存token和用户信息 — 后端返回的是 user_info
  setTokens(res.data.biz_token, res.data.refresh_token);
  if (res.data.user_info) {
    saveUserInfo(res.data.user_info);
  }

  return res.data;
}

/** 获取图形验证码（保留备用） */
export async function getCaptcha(): Promise<CaptchaResponse> {
  const res = await request<CaptchaResponse>("/api/v1/auth/captcha", {
    method: "GET",
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 用户登录（密码登录，保留备用） */
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

  // 保存token和用户信息 — 后端返回的是 user_info
  setTokens(res.data.biz_token, res.data.refresh_token);
  if (res.data.user_info) {
    saveUserInfo(res.data.user_info);
  }

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

// ============ 测评接口 ============

/** 创建测评会话 - POST /api/v1/test/start */
export async function startTest(): Promise<StartTestResponse> {
  const res = await request<StartTestResponse>("/api/v1/test/start", {
    method: "POST",
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 提交回答并获取AI评估 - POST /api/v1/test/evaluate
 *  后端参数: sessionId, questionId, audioUrl?, transcription?, answerDuration?
 */
export async function evaluateAnswer(params: {
  sessionId: string;
  questionId: string;
  transcription?: string;
  audioUrl?: string;
  answerDuration?: number;
}): Promise<EvaluateResponse> {
  const res = await request<EvaluateResponse>("/api/v1/test/evaluate", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 获取测评结果详情 - GET /api/v1/test/result/:sessionId */
export async function getTestResult(sessionId: string): Promise<TestResultDetail> {
  const res = await request<TestResultDetail>(`/api/v1/test/result/${sessionId}`);
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 上传测评录音 - POST /api/v1/test/upload-audio */
export async function uploadAudio(params: {
  file: Blob;
  sessionId: string;
  questionId: string;
}): Promise<UploadAudioResponse> {
  const formData = new FormData();
  formData.append("file", params.file, "recording.webm");
  formData.append("sessionId", params.sessionId);
  formData.append("questionId", params.questionId);

  const res = await request<UploadAudioResponse>("/api/v1/test/upload-audio", {
    method: "POST",
    body: formData,
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 语音转文字（ASR）- POST /api/v1/test/transcribe */
export async function transcribeAudio(params: {
  audioUrl: string;
  language?: string;
}): Promise<TranscribeResponse> {
  const res = await request<TranscribeResponse>("/api/v1/test/transcribe", {
    method: "POST",
    body: JSON.stringify({ audioUrl: params.audioUrl, language: params.language || "en" }),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 终止测评会话 - POST /api/v1/test/terminate */
export async function terminateTest(params: {
  sessionId: string;
  reason?: string;
}): Promise<{ terminated: boolean }> {
  const res = await request<{ terminated: boolean }>("/api/v1/test/terminate", {
    method: "POST",
    body: JSON.stringify(params),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 查询测评历史 - GET /api/v1/test/history */
export async function getTestHistory(params?: {
  page?: number;
  pageSize?: number;
}): Promise<TestHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
  const query = searchParams.toString();
  const endpoint = `/api/v1/test/history${query ? `?${query}` : ""}`;

  const res = await request<TestHistoryResponse>(endpoint);
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}

/** 文本转语音（TTS）- POST /api/v1/test/tts */
export async function textToSpeech(params: {
  text: string;
  voice?: string;
  speed?: number;
}): Promise<TTSResponse> {
  const res = await request<TTSResponse>("/api/v1/test/tts", {
    method: "POST",
    body: JSON.stringify({
      text: params.text,
      voice: params.voice || "en-US-female",
      speed: params.speed || 0.85,
    }),
  });
  if (res.code !== 200) throw new Error(res.msg);
  return res.data;
}
