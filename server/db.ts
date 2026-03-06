import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });

export async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_config (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR,
        open_router_api_key TEXT,
        open_router_model TEXT DEFAULT 'stepfun/step-3.5-flash:free',
        image_api_key TEXT,
        image_api_url TEXT,
        image_model TEXT,
        verify_token TEXT,
        whatsapp_phone TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS facebook_pages (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR,
        name TEXT NOT NULL DEFAULT 'Facebook Page',
        facebook_page_id TEXT NOT NULL DEFAULT '',
        access_token TEXT NOT NULL,
        added_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS registered_users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name VARCHAR NOT NULL DEFAULT 'User',
        email_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS verification_codes (
        id SERIAL PRIMARY KEY,
        email VARCHAR NOT NULL,
        code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR UNIQUE,
        first_name VARCHAR,
        last_name VARCHAR,
        profile_image_url VARCHAR,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    try {
      await client.query(`ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
      await client.query(`ALTER TABLE facebook_pages ADD COLUMN IF NOT EXISTS user_id VARCHAR`);
    } catch {}

    console.log("Database tables verified");
  } catch (err: any) {
    console.error("Error ensuring tables:", err.message);
  } finally {
    client.release();
  }
}
