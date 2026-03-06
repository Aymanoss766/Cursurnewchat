import * as schema from "@shared/schema";
import { botConfigSqlite, facebookPagesSqlite } from "@shared/schema-sqlite";

let db: any;
let botConfig: any;
let facebookPages: any;
let pool: any = null;

if (process.env.DATABASE_URL) {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pg = await import("pg");
  const { Pool } = pg.default;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
  botConfig = schema.botConfig;
  facebookPages = schema.facebookPages;
} else {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const Database = (await import("better-sqlite3")).default;
  const path = await import("path");
  const sqlitePath = path.join(process.cwd(), "local.db");
  const sqlite = new Database(sqlitePath);
  db = drizzle(sqlite, {
    schema: { botConfig: botConfigSqlite, facebookPages: facebookPagesSqlite },
  });
  botConfig = botConfigSqlite;
  facebookPages = facebookPagesSqlite;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bot_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      open_router_api_key TEXT,
      open_router_model TEXT DEFAULT 'stepfun/step-3.5-flash:free',
      image_api_key TEXT,
      image_api_url TEXT,
      image_model TEXT,
      verify_token TEXT,
      whatsapp_phone TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS facebook_pages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Facebook Page',
      facebook_page_id TEXT NOT NULL DEFAULT '',
      access_token TEXT NOT NULL,
      added_at INTEGER
    );
  `);
}

export { db, botConfig, facebookPages, pool };
