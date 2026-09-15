CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "id" uuid;--> statement-breakpoint
UPDATE "auth_sessions" SET "id" = gen_random_uuid() WHERE "id" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_id_unique" UNIQUE("id");