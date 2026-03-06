import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const botConfigSqlite = sqliteTable("bot_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openRouterApiKey: text("open_router_api_key"),
  openRouterModel: text("open_router_model").default("stepfun/step-3.5-flash:free"),
  imageApiKey: text("image_api_key"),
  imageApiUrl: text("image_api_url"),
  imageModel: text("image_model"),
  verifyToken: text("verify_token"),
  whatsappPhone: text("whatsapp_phone"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const facebookPagesSqlite = sqliteTable("facebook_pages", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Facebook Page"),
  facebookPageId: text("facebook_page_id").notNull().default(""),
  accessToken: text("access_token").notNull(),
  addedAt: integer("added_at", { mode: "timestamp" }).defaultNow(),
});
