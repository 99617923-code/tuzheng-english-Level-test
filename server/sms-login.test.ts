/**
 * SMS Login API Tests
 * 测试短信验证码登录相关的API层函数
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// Mock window.dispatchEvent
const mockDispatchEvent = vi.fn();
vi.stubGlobal("dispatchEvent", mockDispatchEvent);

describe("SMS Login API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("sendSmsCode", () => {
    it("should send SMS code with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          msg: "验证码已发送",
          data: { expires_in: 300 },
        }),
      });

      // Dynamic import to get fresh module
      const { sendSmsCode } = await import("../client/src/lib/api");
      const result = await sendSmsCode({ phone: "13800138000", purpose: "login" });

      expect(result.expires_in).toBe(300);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/v1/auth/send-sms-code");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.phone).toBe("13800138000");
      expect(body.purpose).toBe("login");
    });

    it("should throw error when API returns non-200", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 400,
          msg: "手机号格式不正确",
          data: null,
        }),
      });

      const { sendSmsCode } = await import("../client/src/lib/api");
      await expect(sendSmsCode({ phone: "123" })).rejects.toThrow("手机号格式不正确");
    });
  });

  describe("smsLogin", () => {
    it("should login with SMS code and save tokens", async () => {
      const mockLoginResponse = {
        code: 200,
        msg: "登录成功",
        data: {
          is_new_user: false,
          user: {
            user_id: "10001",
            nickname: "用户8000",
            avatar: "",
            phone: "138****8000",
            role: "student",
          },
          biz_token: "test_biz_token_123",
          refresh_token: "test_refresh_token_456",
        },
      };

      mockFetch.mockResolvedValueOnce({
        json: async () => mockLoginResponse,
      });

      const { smsLogin } = await import("../client/src/lib/api");
      const result = await smsLogin({ phone: "13800138000", code: "123456" });

      expect(result.user.user_id).toBe("10001");
      expect(result.biz_token).toBe("test_biz_token_123");
      expect(result.is_new_user).toBe(false);

      // Verify tokens are saved
      expect(localStorageMock.setItem).toHaveBeenCalledWith("tz_biz_token", "test_biz_token_123");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("tz_refresh_token", "test_refresh_token_456");
    });

    it("should handle new user registration via SMS login", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          msg: "登录成功",
          data: {
            is_new_user: true,
            user: {
              user_id: "10002",
              nickname: "新用户",
              avatar: "",
              phone: "139****9000",
              role: "student",
            },
            biz_token: "new_user_token",
            refresh_token: "new_refresh_token",
          },
        }),
      });

      const { smsLogin } = await import("../client/src/lib/api");
      const result = await smsLogin({ phone: "13900139000", code: "654321" });

      expect(result.is_new_user).toBe(true);
      expect(result.user.user_id).toBe("10002");
    });

    it("should throw error for invalid SMS code", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 400,
          msg: "验证码错误或已过期",
          data: null,
        }),
      });

      const { smsLogin } = await import("../client/src/lib/api");
      await expect(smsLogin({ phone: "13800138000", code: "000000" })).rejects.toThrow(
        "验证码错误或已过期"
      );
    });
  });

  describe("Token Management", () => {
    it("should store and retrieve tokens correctly", async () => {
      const { setTokens, getToken, getRefreshToken } = await import("../client/src/lib/api");

      setTokens("biz_123", "refresh_456");

      expect(localStorageMock.setItem).toHaveBeenCalledWith("tz_biz_token", "biz_123");
      expect(localStorageMock.setItem).toHaveBeenCalledWith("tz_refresh_token", "refresh_456");
    });

    it("should clear all auth data on clearTokens", async () => {
      const { clearTokens } = await import("../client/src/lib/api");

      clearTokens();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("tz_biz_token");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("tz_refresh_token");
      expect(localStorageMock.removeItem).toHaveBeenCalledWith("tz_user_info");
    });
  });

  describe("Request Headers", () => {
    it("should include X-App-Key in all requests", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          msg: "success",
          data: { expires_in: 300 },
        }),
      });

      const { sendSmsCode } = await import("../client/src/lib/api");
      await sendSmsCode({ phone: "13800138000" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-App-Key"]).toBe("tzk_ce457c0a5a5daf5a5ba0af8c6952f345");
    });

    it("should include Authorization header when token exists", async () => {
      localStorageMock.getItem.mockImplementation((key: string) => {
        if (key === "tz_biz_token") return "existing_token";
        return null;
      });

      mockFetch.mockResolvedValueOnce({
        json: async () => ({
          code: 200,
          msg: "success",
          data: { expires_in: 300 },
        }),
      });

      const { sendSmsCode } = await import("../client/src/lib/api");
      await sendSmsCode({ phone: "13800138000" });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Authorization"]).toBe("Bearer existing_token");
    });
  });
});
