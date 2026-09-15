CREATE TYPE "public"."premium_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "premium_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"status" "premium_request_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "premium_requests" ADD CONSTRAINT "premium_requests_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "premium_requests" ADD CONSTRAINT "premium_requests_reviewed_by_auth_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "premium_requests_one_pending_per_user" ON "premium_requests" USING btree ("user_id") WHERE "premium_requests"."status" = 'pending';