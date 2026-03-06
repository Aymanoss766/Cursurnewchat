import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, serial, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const botConfig = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id"),
  openRouterApiKey: text("open_router_api_key"),
  openRouterModel: text("open_router_model").default("stepfun/step-3.5-flash:free"),
  imageApiKey: text("image_api_key"),
  imageApiUrl: text("image_api_url"),
  imageModel: text("image_model"),
  verifyToken: text("verify_token"),
  whatsappPhone: text("whatsapp_phone"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const facebookPages = pgTable("facebook_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull().default("Facebook Page"),
  facebookPageId: text("facebook_page_id").notNull().default(""),
  accessToken: text("access_token").notNull(),
  addedAt: timestamp("added_at").defaultNow(),
});

export const registeredUsers = pgTable("registered_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name").notNull().default("User"),
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const verificationCodes = pgTable("verification_codes", {
  id: serial("id").primaryKey(),
  email: varchar("email").notNull(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfig).omit({ id: true, updatedAt: true });
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type BotConfig = typeof botConfig.$inferSelect;

export const insertFacebookPageSchema = createInsertSchema(facebookPages).omit({ id: true, addedAt: true });
export type InsertFacebookPage = z.infer<typeof insertFacebookPageSchema>;
export type FacebookPage = typeof facebookPages.$inferSelect;

export const insertRegisteredUserSchema = createInsertSchema(registeredUsers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRegisteredUser = z.infer<typeof insertRegisteredUserSchema>;
export type RegisteredUser = typeof registeredUsers.$inferSelect;
