CREATE TABLE "sync_media_attachments" (
	"object_path" text PRIMARY KEY NOT NULL,
	"entity_type" "sync_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"audience_user_ids" text[] DEFAULT '{}' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_records" ADD COLUMN "parent_id" text;--> statement-breakpoint
UPDATE "sync_records"
SET "parent_id" = COALESCE(
  CASE
    WHEN jsonb_typeof("payload"->'postId') = 'string'
      AND NULLIF(btrim("payload"->>'postId'), '') IS NOT NULL
    THEN "payload"->>'postId'
  END,
  CASE
    WHEN jsonb_typeof("payload"->'targetId') = 'string'
      AND NULLIF(btrim("payload"->>'targetId'), '') IS NOT NULL
    THEN "payload"->>'targetId'
  END,
  CASE
    WHEN jsonb_typeof("payload"->'parentId') = 'string'
      AND NULLIF(btrim("payload"->>'parentId'), '') IS NOT NULL
    THEN "payload"->>'parentId'
  END
)
WHERE "entity_type" = 'comment' AND "parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX "sync_media_attachments_entity_lookup" ON "sync_media_attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "sync_media_attachments_audience_lookup" ON "sync_media_attachments" USING btree ("audience_user_ids");--> statement-breakpoint
CREATE INDEX "sync_records_parent_lookup" ON "sync_records" USING btree ("entity_type","parent_id","deleted_at");