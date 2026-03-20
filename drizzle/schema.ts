import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 口语训练营群二维码配置表
 * 管理员为每个等级(0-3)配置对应的口语营群二维码
 * 用户测评完成后，根据等级展示对应的群二维码供扫码加入
 */
export const courseGroupQrcodes = mysqlTable("course_group_qrcodes", {
  id: int("id").autoincrement().primaryKey(),
  /** 等级: 0=零级, 1=一级, 2=二级, 3=三级 */
  level: int("level").notNull().unique(),
  /** 等级名称，如"零级口语营" */
  levelName: varchar("levelName", { length: 64 }).notNull(),
  /** 群二维码图片URL (存储在S3) */
  qrcodeUrl: text("qrcodeUrl").notNull(),
  /** 群名称/描述 */
  groupName: varchar("groupName", { length: 128 }),
  /** 是否启用 */
  enabled: int("enabled").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CourseGroupQrcode = typeof courseGroupQrcodes.$inferSelect;
export type InsertCourseGroupQrcode = typeof courseGroupQrcodes.$inferInsert;