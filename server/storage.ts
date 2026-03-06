import { botConfig, facebookPages, registeredUsers, verificationCodes } from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface PageConfig {
  id: string;
  name: string;
  facebookPageId: string;
  accessToken: string;
  addedAt: string;
}

export interface BotConfigData {
  openRouterApiKey: string | null;
  openRouterModel: string | null;
  imageApiKey: string | null;
  imageApiUrl: string | null;
  imageModel: string | null;
  verifyToken: string | null;
  whatsappPhone: string | null;
  pages: PageConfig[];
}

export interface IStorage {
  getBotConfig(userId?: string | null): Promise<BotConfigData>;
  updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>, userId?: string | null): Promise<BotConfigData>;
  addPage(page: PageConfig, userId?: string | null): Promise<BotConfigData>;
  removePage(id: string, userId?: string | null): Promise<BotConfigData>;
  getPages(userId?: string | null): Promise<PageConfig[]>;
  getPageByFacebookId(facebookPageId: string): Promise<(PageConfig & { userId: string | null }) | undefined>;
  initDefaults(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private async ensureConfig(userId?: string | null) {
    const condition = userId ? eq(botConfig.userId, userId) : isNull(botConfig.userId);
    const rows = await db.select().from(botConfig).where(condition);
    if (rows.length === 0) {
      const insertValues: any = {
        openRouterModel: "stepfun/step-3.5-flash:free",
      };
      if (userId) {
        insertValues.userId = userId;
      } else {
        insertValues.openRouterApiKey = process.env.OPENROUTER_API_KEY || null;
        insertValues.verifyToken = process.env.VERIFY_TOKEN || null;
      }
      await db.insert(botConfig).values(insertValues);
    }
    const [row] = await db.select().from(botConfig).where(condition);
    return row;
  }

  async initDefaults() {
    await this.ensureConfig(null);

    if (process.env.PAGE_ACCESS_TOKEN) {
      const pages = await this.getPages(null);
      const tokenExists = pages.some(p => p.accessToken === process.env.PAGE_ACCESS_TOKEN);
      if (!tokenExists && pages.length === 0) {
        let pageName = "Default Page";
        let fbPageId = "";
        try {
          const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${process.env.PAGE_ACCESS_TOKEN}`);
          if (res.ok) {
            const data = await res.json();
            if (data?.id) fbPageId = data.id;
            if (data?.name) pageName = data.name;
          }
        } catch {}

        await db.insert(facebookPages).values({
          id: randomUUID(),
          name: pageName,
          facebookPageId: fbPageId,
          accessToken: process.env.PAGE_ACCESS_TOKEN,
        });
      }
    }
  }

  async getBotConfig(userId?: string | null): Promise<BotConfigData> {
    const config = await this.ensureConfig(userId);
    const pages = await this.getPages(userId);
    return {
      openRouterApiKey: config.openRouterApiKey,
      openRouterModel: config.openRouterModel,
      imageApiKey: config.imageApiKey,
      imageApiUrl: config.imageApiUrl,
      imageModel: config.imageModel,
      verifyToken: config.verifyToken,
      whatsappPhone: config.whatsappPhone,
      pages,
    };
  }

  async updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>, userId?: string | null): Promise<BotConfigData> {
    const config = await this.ensureConfig(userId);
    await db.update(botConfig).set({ ...updates, updatedAt: new Date() }).where(eq(botConfig.id, config.id));
    return this.getBotConfig(userId);
  }

  async addPage(page: PageConfig, userId?: string | null): Promise<BotConfigData> {
    const pages = await this.getPages(userId);
    if (pages.length >= 15) {
      throw new Error("Maximum of 15 pages reached");
    }
    await db.insert(facebookPages).values({
      id: page.id,
      userId: userId || null,
      name: page.name,
      facebookPageId: page.facebookPageId,
      accessToken: page.accessToken,
    });
    return this.getBotConfig(userId);
  }

  async removePage(id: string, userId?: string | null): Promise<BotConfigData> {
    const condition = userId
      ? and(eq(facebookPages.id, id), eq(facebookPages.userId, userId))
      : and(eq(facebookPages.id, id), isNull(facebookPages.userId));
    await db.delete(facebookPages).where(condition);
    return this.getBotConfig(userId);
  }

  async getPages(userId?: string | null): Promise<PageConfig[]> {
    const condition = userId ? eq(facebookPages.userId, userId) : isNull(facebookPages.userId);
    const rows = await db.select().from(facebookPages).where(condition);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      facebookPageId: r.facebookPageId,
      accessToken: r.accessToken,
      addedAt: r.addedAt?.toISOString() || new Date().toISOString(),
    }));
  }

  async getPageByFacebookId(facebookPageId: string): Promise<(PageConfig & { userId: string | null }) | undefined> {
    const [row] = await db.select().from(facebookPages).where(eq(facebookPages.facebookPageId, facebookPageId));
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      facebookPageId: row.facebookPageId,
      accessToken: row.accessToken,
      addedAt: row.addedAt?.toISOString() || new Date().toISOString(),
      userId: row.userId,
    };
  }

  async getAllPages(): Promise<(PageConfig & { userId: string | null })[]> {
    const rows = await db.select().from(facebookPages);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      facebookPageId: r.facebookPageId,
      accessToken: r.accessToken,
      addedAt: r.addedAt?.toISOString() || new Date().toISOString(),
      userId: r.userId,
    }));
  }

  async createUser(email: string, passwordHash: string, name: string): Promise<string> {
    const id = randomUUID();
    await db.insert(registeredUsers).values({
      id,
      email,
      passwordHash,
      name,
      emailVerified: false,
    });
    return id;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(registeredUsers).where(eq(registeredUsers.email, email));
    return user || null;
  }

  async getUserById(id: string) {
    const [user] = await db.select().from(registeredUsers).where(eq(registeredUsers.id, id));
    return user || null;
  }

  async verifyUserEmail(email: string) {
    await db.update(registeredUsers).set({ emailVerified: true, updatedAt: new Date() }).where(eq(registeredUsers.email, email));
  }

  async createVerificationCode(email: string, code: string) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.insert(verificationCodes).values({ email, code, expiresAt });
  }

  async verifyCode(email: string, code: string): Promise<boolean> {
    const [record] = await db.select().from(verificationCodes).where(
      and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        eq(verificationCodes.used, false),
        gt(verificationCodes.expiresAt, new Date()),
      )
    );
    if (!record) return false;
    await db.update(verificationCodes).set({ used: true }).where(eq(verificationCodes.id, record.id));
    return true;
  }
}

export const storage = new DatabaseStorage();
