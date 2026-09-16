CREATE TABLE "love_conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text DEFAULT 'dm' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_message_at" timestamp with time zone,
  "last_message_id" text
);
CREATE INDEX "love_conversations_kind_updated_idx" ON "love_conversations" USING btree ("kind","updated_at");
CREATE TABLE "love_conversation_members" (
  "conversation_id" text NOT NULL REFERENCES "love_conversations"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "last_read_message_id" text,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,
  CONSTRAINT "love_conversation_membership_key" UNIQUE("conversation_id","user_id")
);
CREATE INDEX "love_conversation_members_user_idx" ON "love_conversation_members" USING btree ("user_id","left_at");
CREATE TABLE "love_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL REFERENCES "love_conversations"("id") ON DELETE CASCADE,
  "sender_id" text NOT NULL,
  "client_message_id" text NOT NULL,
  "body" text,
  "media_object_path" text,
  "media_type" text,
  "version" integer DEFAULT 1 NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "love_messages_sender_client_key" UNIQUE("sender_id","client_message_id")
);
CREATE INDEX "love_messages_conversation_order_idx" ON "love_messages" USING btree ("conversation_id","created_at","id");
CREATE TABLE "love_message_reactions" (
  "message_id" text NOT NULL REFERENCES "love_messages"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "reaction" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "love_message_reaction_key" UNIQUE("message_id","user_id","reaction")
);
CREATE TABLE "love_presence" (
  "user_id" text PRIMARY KEY NOT NULL,
  "status" text DEFAULT 'online' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "love_blocks" (
  "blocker_id" text NOT NULL,
  "blocked_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "love_block_key" UNIQUE("blocker_id","blocked_id")
);
CREATE TABLE "love_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "reporter_id" text NOT NULL,
  "message_id" text,
  "reported_user_id" text,
  "reason" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "love_reports_status_created_idx" ON "love_reports" USING btree ("status","created_at");
CREATE TABLE "love_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_id" text NOT NULL,
  "action" text NOT NULL,
  "target_id" text,
  "details" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "love_settings" (
  "user_id" text PRIMARY KEY NOT NULL,
  "notifications" boolean DEFAULT true NOT NULL,
  "sound" boolean DEFAULT true NOT NULL,
  "vibration" boolean DEFAULT true NOT NULL,
  "theme" text DEFAULT 'rose' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);