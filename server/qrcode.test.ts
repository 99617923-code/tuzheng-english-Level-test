import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

/** 创建管理员上下文 */
function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@tuzheng.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

/** 创建普通用户上下文 */
function createUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "normal-user",
    email: "user@test.com",
    name: "Normal User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

/** 创建未登录上下文 */
function createAnonymousContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("qrcode router", () => {
  describe("qrcode.getByLevel", () => {
    it("returns null when no qrcode is configured for the level", async () => {
      const ctx = createAnonymousContext();
      const caller = appRouter.createCaller(ctx);

      // Level 0 might not have a qrcode configured
      const result = await caller.qrcode.getByLevel({ level: 0 });
      // Result should be null or a valid qrcode object
      expect(result === null || (typeof result === "object" && "qrcodeUrl" in result)).toBe(true);
    });

    it("accepts valid level values (0-3)", async () => {
      const ctx = createAnonymousContext();
      const caller = appRouter.createCaller(ctx);

      // Should not throw for valid levels
      for (const level of [0, 1, 2, 3]) {
        const result = await caller.qrcode.getByLevel({ level });
        expect(result === null || typeof result === "object").toBe(true);
      }
    });

    it("rejects invalid level values", async () => {
      const ctx = createAnonymousContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.qrcode.getByLevel({ level: -1 })).rejects.toThrow();
      await expect(caller.qrcode.getByLevel({ level: 4 })).rejects.toThrow();
    });
  });

  describe("qrcode.list (admin only)", () => {
    it("allows admin to list all qrcodes", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.qrcode.list();
      expect(Array.isArray(result)).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.qrcode.list()).rejects.toThrow();
    });

    it("rejects unauthenticated users", async () => {
      const ctx = createAnonymousContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.qrcode.list()).rejects.toThrow();
    });
  });

  describe("qrcode.upsert (admin only)", () => {
    it("allows admin to create a qrcode config", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.qrcode.upsert({
        level: 0,
        levelName: "零级口语营",
        qrcodeUrl: "https://example.com/qrcode-level0.png",
        groupName: "途正英语零级口语营",
        enabled: 1,
      });

      expect(result).toEqual({ success: true });
    });

    it("allows admin to update an existing qrcode config", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      // Create first
      await caller.qrcode.upsert({
        level: 1,
        levelName: "一级口语营",
        qrcodeUrl: "https://example.com/qrcode-level1.png",
      });

      // Update
      const result = await caller.qrcode.upsert({
        level: 1,
        levelName: "一级口语营（更新）",
        qrcodeUrl: "https://example.com/qrcode-level1-v2.png",
        groupName: "途正英语一级口语营",
      });

      expect(result).toEqual({ success: true });
    });

    it("rejects non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.qrcode.upsert({
          level: 0,
          levelName: "零级口语营",
          qrcodeUrl: "https://example.com/qrcode.png",
        })
      ).rejects.toThrow();
    });

    it("validates input - rejects invalid level", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.qrcode.upsert({
          level: 5,
          levelName: "无效等级",
          qrcodeUrl: "https://example.com/qrcode.png",
        })
      ).rejects.toThrow();
    });

    it("validates input - rejects invalid URL", async () => {
      const ctx = createAdminContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.qrcode.upsert({
          level: 0,
          levelName: "零级口语营",
          qrcodeUrl: "not-a-valid-url",
        })
      ).rejects.toThrow();
    });
  });

  describe("qrcode.toggleEnabled (admin only)", () => {
    it("rejects non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(
        caller.qrcode.toggleEnabled({ id: 1, enabled: false })
      ).rejects.toThrow();
    });
  });

  describe("qrcode.delete (admin only)", () => {
    it("rejects non-admin users", async () => {
      const ctx = createUserContext();
      const caller = appRouter.createCaller(ctx);

      await expect(caller.qrcode.delete({ id: 1 })).rejects.toThrow();
    });
  });

  describe("getByLevel returns configured qrcode after upsert", () => {
    it("returns the configured qrcode for a level", async () => {
      const adminCtx = createAdminContext();
      const adminCaller = appRouter.createCaller(adminCtx);

      // Admin creates qrcode for level 2
      await adminCaller.qrcode.upsert({
        level: 2,
        levelName: "二级口语营",
        qrcodeUrl: "https://example.com/qrcode-level2.png",
        groupName: "途正英语二级口语营",
        enabled: 1,
      });

      // Public user queries level 2
      const publicCtx = createAnonymousContext();
      const publicCaller = appRouter.createCaller(publicCtx);
      const result = await publicCaller.qrcode.getByLevel({ level: 2 });

      expect(result).not.toBeNull();
      expect(result?.level).toBe(2);
      expect(result?.levelName).toBe("二级口语营");
      expect(result?.qrcodeUrl).toBe("https://example.com/qrcode-level2.png");
      expect(result?.groupName).toBe("途正英语二级口语营");
    });
  });
});
