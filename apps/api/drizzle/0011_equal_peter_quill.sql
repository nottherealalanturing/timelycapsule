CREATE TYPE "public"."deletion_decision" AS ENUM('deliver', 'withdraw');--> statement-breakpoint
ALTER TYPE "public"."action_kind" ADD VALUE 'data_export';--> statement-breakpoint
ALTER TYPE "public"."action_kind" ADD VALUE 'account_purge';--> statement-breakpoint
ALTER TYPE "public"."otp_purpose" ADD VALUE 'change_email';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pending_email" "citext";--> statement-breakpoint
ALTER TABLE "capsules" ADD COLUMN "deletion_decision" "deletion_decision";