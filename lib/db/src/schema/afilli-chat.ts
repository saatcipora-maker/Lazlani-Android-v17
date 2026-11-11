import { boolean, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const afilliRoomPoliciesTable = pgTable("afilli_room_policies", {
  roomId: text("room_id").primaryKey(),
  allowGifs: boolean("allow_gifs").notNull().default(true),
});

export const afilliChatGifsTable = pgTable("afilli_chat_gifs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  category: text("category").notNull().default("Genel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const afilliUserBlocksTable = pgTable("afilli_user_blocks", {
  blockerId: text("blocker_id").notNull(),
  blockedId: text("blocked_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.blockerId, table.blockedId] })]);
