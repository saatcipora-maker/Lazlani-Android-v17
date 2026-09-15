import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index("password_reset_tokens_email_created_id_idx").on(
      table.email,
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
  ],
);

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokensTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;

export const passwordCredentialsTable = pgTable("password_credentials", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPasswordCredentialSchema = createInsertSchema(passwordCredentialsTable);
export type InsertPasswordCredential = z.infer<typeof insertPasswordCredentialSchema>;
export type PasswordCredential = typeof passwordCredentialsTable.$inferSelect;