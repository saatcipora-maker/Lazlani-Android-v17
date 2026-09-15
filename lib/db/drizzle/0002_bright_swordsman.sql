ALTER TABLE "auth_sessions" ADD COLUMN "credential_updated_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "auth_sessions" AS "session"
SET "credential_updated_at" = "credential"."updated_at"
FROM "auth_users" AS "user"
INNER JOIN "password_credentials" AS "credential" ON "credential"."email" = "user"."email"
WHERE "session"."user_id" = "user"."id"
  AND "session"."credential_updated_at" IS NULL;
--> statement-breakpoint
DELETE FROM "auth_sessions" WHERE "credential_updated_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "credential_updated_at" SET NOT NULL;