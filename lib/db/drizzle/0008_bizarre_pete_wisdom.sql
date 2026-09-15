ALTER TYPE "public"."sync_entity_type" ADD VALUE 'post' BEFORE 'notification';--> statement-breakpoint
ALTER TYPE "public"."sync_entity_type" ADD VALUE 'reading';--> statement-breakpoint
ALTER TYPE "public"."sync_interaction_type" ADD VALUE 'reading';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'delete_message' BEFORE 'create_notification';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'delete_comment' BEFORE 'create_reply';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'create_post';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'update_post';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'delete_post';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'start_reading';