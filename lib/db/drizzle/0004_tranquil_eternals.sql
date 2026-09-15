ALTER TYPE "public"."sync_entity_type" ADD VALUE 'book';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'create_book';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'update_book';--> statement-breakpoint
ALTER TYPE "public"."sync_operation_type" ADD VALUE 'delete_book';