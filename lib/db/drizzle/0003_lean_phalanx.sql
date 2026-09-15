CREATE TYPE "public"."sync_entity_type" AS ENUM('message', 'notification', 'comment', 'reply', 'ozel_comment', 'ozel_reply', 'ozel_video', 'like', 'reaction', 'vote');--> statement-breakpoint
CREATE TYPE "public"."sync_interaction_type" AS ENUM('like', 'reaction', 'vote');--> statement-breakpoint
CREATE TYPE "public"."sync_operation_type" AS ENUM('create_message', 'create_notification', 'create_comment', 'create_reply', 'create_ozel_comment', 'create_ozel_reply', 'upsert_ozel_video', 'toggle_like', 'set_reaction', 'toggle_vote');--> statement-breakpoint
CREATE TABLE "sync_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" "sync_entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"audience_user_ids" text[],
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_interactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"interaction_type" "sync_interaction_type" NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"value" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_interactions_user_target_key" UNIQUE("user_id","target_type","target_id","interaction_type")
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_operation_id" text NOT NULL,
	"operation_type" "sync_operation_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"canonical_result" jsonb NOT NULL,
	"event_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_operations_user_client_key" UNIQUE("user_id","client_operation_id")
);
--> statement-breakpoint
CREATE TABLE "sync_records" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "sync_entity_type" NOT NULL,
	"owner_user_id" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"audience_user_ids" text[] DEFAULT '{}' NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_records_entity_identity" UNIQUE("entity_type","id")
);
