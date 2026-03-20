/**
 * 口语训练营群二维码管理路由
 * - 管理员: CRUD 各等级群二维码
 * - 前端: 按等级获取已启用的群二维码
 */
import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "../_core/trpc";
import {
  getAllQrcodes,
  getQrcodeByLevel,
  upsertQrcode,
  deleteQrcode,
  toggleQrcodeEnabled,
} from "../db";
import { storagePut } from "../storage";

export const qrcodeRouter = router({
  /** 前端: 根据等级获取已启用的群二维码 */
  getByLevel: publicProcedure
    .input(z.object({ level: z.number().min(0).max(3) }))
    .query(async ({ input }) => {
      const qrcode = await getQrcodeByLevel(input.level);
      if (!qrcode) return null;
      return {
        level: qrcode.level,
        levelName: qrcode.levelName,
        qrcodeUrl: qrcode.qrcodeUrl,
        groupName: qrcode.groupName,
      };
    }),

  /** 管理员: 获取所有等级的群二维码配置 */
  list: adminProcedure.query(async () => {
    return getAllQrcodes();
  }),

  /** 管理员: 创建或更新群二维码 */
  upsert: adminProcedure
    .input(
      z.object({
        level: z.number().min(0).max(3),
        levelName: z.string().min(1).max(64),
        qrcodeUrl: z.string().url(),
        groupName: z.string().max(128).optional(),
        enabled: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      await upsertQrcode({
        level: input.level,
        levelName: input.levelName,
        qrcodeUrl: input.qrcodeUrl,
        groupName: input.groupName ?? null,
        enabled: input.enabled ?? 1,
      });
      return { success: true };
    }),

  /** 管理员: 上传二维码图片到S3 */
  uploadQrcode: adminProcedure
    .input(
      z.object({
        level: z.number().min(0).max(3),
        base64Data: z.string(),
        mimeType: z.string().default("image/png"),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const ext = input.mimeType.includes("png") ? "png" : "jpg";
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const fileKey = `qrcodes/level-${input.level}-${randomSuffix}.${ext}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      return { url };
    }),

  /** 管理员: 删除群二维码配置 */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteQrcode(input.id);
      return { success: true };
    }),

  /** 管理员: 切换启用状态 */
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      await toggleQrcodeEnabled(input.id, input.enabled);
      return { success: true };
    }),
});
