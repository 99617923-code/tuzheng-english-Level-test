/**
 * @fileoverview Server routers - 途正英语AI分级测评
 * @author 火鹰科技
 * @copyright 2005-2026 广州火鹰信息科技有限公司. All rights reserved.
 */
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { qrcodeRouter } from "./routers/qrcode";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  qrcode: qrcodeRouter,
});

export type AppRouter = typeof appRouter;
