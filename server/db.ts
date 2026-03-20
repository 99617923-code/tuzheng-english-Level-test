import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, courseGroupQrcodes, InsertCourseGroupQrcode, CourseGroupQrcode } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============ 口语营群二维码管理 ============

/** 获取所有等级的群二维码配置 */
export async function getAllQrcodes(): Promise<CourseGroupQrcode[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(courseGroupQrcodes).orderBy(courseGroupQrcodes.level);
}

/** 根据等级获取已启用的群二维码 */
export async function getQrcodeByLevel(level: number): Promise<CourseGroupQrcode | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(courseGroupQrcodes)
    .where(and(eq(courseGroupQrcodes.level, level), eq(courseGroupQrcodes.enabled, 1)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** 创建或更新群二维码配置（按level upsert） */
export async function upsertQrcode(data: InsertCourseGroupQrcode): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(courseGroupQrcodes).values(data).onDuplicateKeyUpdate({
    set: {
      levelName: data.levelName,
      qrcodeUrl: data.qrcodeUrl,
      groupName: data.groupName ?? null,
      enabled: data.enabled ?? 1,
    },
  });
}

/** 删除群二维码配置 */
export async function deleteQrcode(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(courseGroupQrcodes).where(eq(courseGroupQrcodes.id, id));
}

/** 切换群二维码启用状态 */
export async function toggleQrcodeEnabled(id: number, enabled: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(courseGroupQrcodes)
    .set({ enabled: enabled ? 1 : 0 })
    .where(eq(courseGroupQrcodes.id, id));
}
