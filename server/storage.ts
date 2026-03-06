import { botConfig, facebookPages } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
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
  getBotConfig(): Promise<BotConfigData>;
  updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>): Promise<BotConfigData>;
  addPage(page: PageConfig): Promise<BotConfigData>;
  removePage(id: string): Promise<BotConfigData>;
  getPages(): Promise<PageConfig[]>;
  getPageByFacebookId(facebookPageId: string): Promise<PageConfig | undefined>;
}

export class DatabaseStorage implements IStorage {
  private async ensureConfig() {
    const rows = await db.select().from(botConfig);
    if (rows.length === 0) {
      await db.insert(botConfig).values({
        openRouterApiKey: process.env.OPENROUTER_API_KEY || null,
        openRouterModel: "stepfun/step-3.5-flash:free",
        verifyToken: process.env.VERIFY_TOKEN || null,
      });
    }
    const [row] = await db.select().from(botConfig);
    return row;
  }

  async initDefaults() {
    await this.ensureConfig();

    if (process.env.PAGE_ACCESS_TOKEN) {
      const pages = await this.getPages();
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

  async getBotConfig(): Promise<BotConfigData> {
    const config = await this.ensureConfig();
    const pages = await this.getPages();
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

  async updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>): Promise<BotConfigData> {
    const config = await this.ensureConfig();
    await db.update(botConfig).set({ ...updates, updatedAt: new Date() }).where(eq(botConfig.id, config.id));
    return this.getBotConfig();
  }

  async addPage(page: PageConfig): Promise<BotConfigData> {
    const pages = await this.getPages();
    if (pages.length >= 15) {
      throw new Error("Maximum of 15 pages reached");
    }
    await db.insert(facebookPages).values({
      id: page.id,
      name: page.name,
      facebookPageId: page.facebookPageId,
      accessToken: page.accessToken,
    });
    return this.getBotConfig();
  }

  async removePage(id: string): Promise<BotConfigData> {
    await db.delete(facebookPages).where(eq(facebookPages.id, id));
    return this.getBotConfig();
  }

  async getPages(): Promise<PageConfig[]> {
    const rows = await db.select().from(facebookPages);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      facebookPageId: r.facebookPageId,
      accessToken: r.accessToken,
      addedAt: r.addedAt?.toISOString() || new Date().toISOString(),
    }));
  }

  async getPageByFacebookId(facebookPageId: string): Promise<PageConfig | undefined> {
    const [row] = await db.select().from(facebookPages).where(eq(facebookPages.facebookPageId, facebookPageId));
    if (!row) return undefined;
    return {
      id: row.id,
      name: row.name,
      facebookPageId: row.facebookPageId,
      accessToken: row.accessToken,
      addedAt: row.addedAt?.toISOString() || new Date().toISOString(),
    };
  }
}

export const storage = new DatabaseStorage();
