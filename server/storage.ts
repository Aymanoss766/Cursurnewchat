import { botConfig, facebookPages } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import path from "path";
import { promises as fs } from "fs";

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
  initDefaults(): Promise<void>;
  getBotConfig(): Promise<BotConfigData>;
  updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>): Promise<BotConfigData>;
  addPage(page: PageConfig): Promise<BotConfigData>;
  removePage(id: string): Promise<BotConfigData>;
  getPages(): Promise<PageConfig[]>;
  getPageByFacebookId(facebookPageId: string): Promise<PageConfig | undefined>;
}

function getDatabaseOrThrow() {
  if (!db) {
    throw new Error("DATABASE_URL is not configured");
  }
  return db;
}

export class DatabaseStorage implements IStorage {
  private async ensureConfig() {
    const database = getDatabaseOrThrow();
    const rows = await database.select().from(botConfig);
    if (rows.length === 0) {
      await database.insert(botConfig).values({
        openRouterApiKey: process.env.OPENROUTER_API_KEY || null,
        openRouterModel: "stepfun/step-3.5-flash:free",
        verifyToken: process.env.VERIFY_TOKEN || null,
      });
    }
    const [row] = await database.select().from(botConfig);
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

        const database = getDatabaseOrThrow();
        await database.insert(facebookPages).values({
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
    const database = getDatabaseOrThrow();
    await database.update(botConfig).set({ ...updates, updatedAt: new Date() }).where(eq(botConfig.id, config.id));
    return this.getBotConfig();
  }

  async addPage(page: PageConfig): Promise<BotConfigData> {
    const pages = await this.getPages();
    if (pages.length >= 15) {
      throw new Error("Maximum of 15 pages reached");
    }
    const database = getDatabaseOrThrow();
    await database.insert(facebookPages).values({
      id: page.id,
      name: page.name,
      facebookPageId: page.facebookPageId,
      accessToken: page.accessToken,
    });
    return this.getBotConfig();
  }

  async removePage(id: string): Promise<BotConfigData> {
    const database = getDatabaseOrThrow();
    await database.delete(facebookPages).where(eq(facebookPages.id, id));
    return this.getBotConfig();
  }

  async getPages(): Promise<PageConfig[]> {
    const database = getDatabaseOrThrow();
    const rows = await database.select().from(facebookPages);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      facebookPageId: r.facebookPageId,
      accessToken: r.accessToken,
      addedAt: r.addedAt?.toISOString() || new Date().toISOString(),
    }));
  }

  async getPageByFacebookId(facebookPageId: string): Promise<PageConfig | undefined> {
    const database = getDatabaseOrThrow();
    const [row] = await database.select().from(facebookPages).where(eq(facebookPages.facebookPageId, facebookPageId));
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

const LOCAL_STORAGE_PATH = path.join(process.cwd(), ".local-data", "bot-config.json");

type LocalStorageData = BotConfigData;

export class LocalFileStorage implements IStorage {
  private async createInitialState(): Promise<LocalStorageData> {
    const initialPages: PageConfig[] = [];

    if (process.env.PAGE_ACCESS_TOKEN) {
      initialPages.push({
        id: randomUUID(),
        name: "Default Page",
        facebookPageId: "",
        accessToken: process.env.PAGE_ACCESS_TOKEN,
        addedAt: new Date().toISOString(),
      });
    }

    return {
      openRouterApiKey: process.env.OPENROUTER_API_KEY || null,
      openRouterModel: "stepfun/step-3.5-flash:free",
      imageApiKey: null,
      imageApiUrl: null,
      imageModel: null,
      verifyToken: process.env.VERIFY_TOKEN || null,
      whatsappPhone: null,
      pages: initialPages,
    };
  }

  private async ensureFile(): Promise<LocalStorageData> {
    await fs.mkdir(path.dirname(LOCAL_STORAGE_PATH), { recursive: true });

    try {
      const raw = await fs.readFile(LOCAL_STORAGE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<LocalStorageData>;

      return {
        openRouterApiKey: parsed.openRouterApiKey ?? process.env.OPENROUTER_API_KEY ?? null,
        openRouterModel: parsed.openRouterModel ?? "stepfun/step-3.5-flash:free",
        imageApiKey: parsed.imageApiKey ?? null,
        imageApiUrl: parsed.imageApiUrl ?? null,
        imageModel: parsed.imageModel ?? null,
        verifyToken: parsed.verifyToken ?? process.env.VERIFY_TOKEN ?? null,
        whatsappPhone: parsed.whatsappPhone ?? null,
        pages: Array.isArray(parsed.pages) ? parsed.pages : [],
      };
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        throw error;
      }

      const initialState = await this.createInitialState();
      await this.writeFile(initialState);
      return initialState;
    }
  }

  private async writeFile(data: LocalStorageData): Promise<void> {
    await fs.writeFile(LOCAL_STORAGE_PATH, JSON.stringify(data, null, 2), "utf8");
  }

  async initDefaults(): Promise<void> {
    await this.ensureFile();
  }

  async getBotConfig(): Promise<BotConfigData> {
    return await this.ensureFile();
  }

  async updateBotConfig(updates: Partial<Omit<BotConfigData, "pages">>): Promise<BotConfigData> {
    const current = await this.ensureFile();
    const nextState: BotConfigData = {
      ...current,
      ...updates,
      pages: current.pages,
    };
    await this.writeFile(nextState);
    return nextState;
  }

  async addPage(page: PageConfig): Promise<BotConfigData> {
    const current = await this.ensureFile();
    if (current.pages.length >= 15) {
      throw new Error("Maximum of 15 pages reached");
    }

    const nextState = {
      ...current,
      pages: [...current.pages, page],
    };
    await this.writeFile(nextState);
    return nextState;
  }

  async removePage(id: string): Promise<BotConfigData> {
    const current = await this.ensureFile();
    const nextState = {
      ...current,
      pages: current.pages.filter(page => page.id !== id),
    };
    await this.writeFile(nextState);
    return nextState;
  }

  async getPages(): Promise<PageConfig[]> {
    const current = await this.ensureFile();
    return current.pages;
  }

  async getPageByFacebookId(facebookPageId: string): Promise<PageConfig | undefined> {
    const current = await this.ensureFile();
    return current.pages.find(page => page.facebookPageId === facebookPageId);
  }
}

export const storage: IStorage = db ? new DatabaseStorage() : new LocalFileStorage();
