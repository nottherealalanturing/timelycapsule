ALTER TYPE "public"."action_kind" ADD VALUE 'media_release_warning';--> statement-breakpoint
ALTER TYPE "public"."action_kind" ADD VALUE 'media_release';--> statement-breakpoint
ALTER TYPE "public"."media_status" ADD VALUE 'released';--> statement-breakpoint
ALTER TABLE "capsules" ADD COLUMN "sealed_entitlement_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "capsules" ADD COLUMN "media_retention_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "release_reason" text;