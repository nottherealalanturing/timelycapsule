CREATE TYPE "public"."action_kind" AS ENUM('capsule_unlock', 'recipient_unlock', 'reminder', 'checkin', 'breakglass_open', 'trash_purge', 'trigger_release', 'chain_unlock', 'series_spawn', 'announce', 'capsule_expire', 'expire_purge');--> statement-breakpoint
CREATE TYPE "public"."action_state" AS ENUM('pending', 'enqueued', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'recipient', 'admin', 'system');--> statement-breakpoint
CREATE TYPE "public"."break_glass" AS ENUM('disabled', 'allowed');--> statement-breakpoint
CREATE TYPE "public"."capsule_state" AS ENUM('draft', 'sealing', 'sealed', 'unlocked', 'expired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."capsule_type" AS ENUM('self', 'personal', 'group', 'birthday', 'anniversary', 'public', 'legacy', 'emergency', 'campaign', 'micro');--> statement-breakpoint
CREATE TYPE "public"."entitlement_plan" AS ENUM('free', 'premium', 'family', 'business', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."entitlement_source" AS ENUM('stripe', 'apple', 'google', 'gift', 'comp');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('image', 'video', 'audio', 'voice', 'document', 'archive', 'link', 'location');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('uploading', 'processing', 'ready', 'failed', 'infected');--> statement-breakpoint
CREATE TYPE "public"."notif_category" AS ENUM('unlock', 'reminder', 'delivery', 'social', 'security', 'billing', 'product', 'digest');--> statement-breakpoint
CREATE TYPE "public"."oauth_provider" AS ENUM('apple', 'google');--> statement-breakpoint
CREATE TYPE "public"."outbound_channel" AS ENUM('email', 'sms', 'push');--> statement-breakpoint
CREATE TYPE "public"."outbound_state" AS ENUM('queued', 'sent', 'delivered', 'bounced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('web', 'ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('added', 'invited', 'notified', 'viewed_locked', 'opened', 'bounced', 'blocked_suppressed');--> statement-breakpoint
CREATE TYPE "public"."unlock_mode" AS ENUM('absolute', 'recipient_local', 'trustee', 'chained');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('unverified', 'active', 'suspended', 'pending_deletion', 'deleted', 'ghost');--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "oauth_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "platform" NOT NULL,
	"last_seen_at" timestamp with time zone,
	"invalid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"device_name" text,
	"platform" "platform" NOT NULL,
	"ip" "inet",
	"user_agent" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"display_name" text NOT NULL,
	"handle" "citext",
	"avatar_key" text,
	"birthday" date,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "user_status" DEFAULT 'unverified' NOT NULL,
	"ghost_claimed_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false,
	"quiet_hours" jsonb,
	"marketing_opt_in" boolean DEFAULT false,
	"deletion_requested_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capsule_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capsule_id" uuid NOT NULL,
	"user_id" uuid,
	"email" "citext",
	"phone" text,
	"display_name" text,
	"access_token_hash" text NOT NULL,
	"status" "recipient_status" DEFAULT 'added' NOT NULL,
	"first_opened_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"tz_inferred" text,
	"resolved_unlock_at" timestamp with time zone,
	"verification_required" boolean,
	"verified_at" timestamp with time zone,
	"is_fallback" boolean DEFAULT false,
	"fallback_after" interval,
	"reminder_opt_in" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capsules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"seals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_after" interval,
	"expiry_strict" boolean DEFAULT false,
	"expired_at" timestamp with time zone,
	"owner_id" uuid NOT NULL,
	"org_id" uuid,
	"type" "capsule_type" NOT NULL,
	"state" "capsule_state" DEFAULT 'draft' NOT NULL,
	"title" text,
	"cover" jsonb,
	"teaser" text,
	"content_doc_enc" "bytea",
	"owner_key_wrap" "bytea",
	"passphrase_hint" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"unlock_mode" "unlock_mode" DEFAULT 'absolute' NOT NULL,
	"unlock_at" timestamp with time zone,
	"unlock_local" jsonb,
	"seal_deadline_at" timestamp with time zone,
	"sealed_at" timestamp with time zone,
	"extended_once" boolean DEFAULT false,
	"recurrence" jsonb,
	"series_id" uuid,
	"chain_parent_id" uuid,
	"chain_delay" interval,
	"allow_download" boolean DEFAULT true,
	"recipients_visible" boolean DEFAULT false,
	"announce_on_seal" boolean DEFAULT true,
	"break_glass" "break_glass" DEFAULT 'disabled',
	"break_glass_requested_at" timestamp with time zone,
	"require_recipient_verification" boolean DEFAULT false,
	"reply_prompt" text,
	"location" jsonb,
	"sealed_day_snapshot" jsonb,
	"archived_at" timestamp with time zone,
	"trashed_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"legacy_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capsule_id" uuid NOT NULL,
	"uploader_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"storage_key" text,
	"original_name" text,
	"mime" text,
	"size_bytes" bigint,
	"duration_ms" integer,
	"width" integer,
	"height" integer,
	"caption" text,
	"position" integer NOT NULL,
	"blurhash" text,
	"thumb_key" text,
	"preview_key" text,
	"hls_key" text,
	"enc_meta" jsonb,
	"status" "media_status" DEFAULT 'uploading',
	"scan_result" jsonb,
	"exif_captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capsule_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "action_kind" NOT NULL,
	"subject_id" uuid NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"state" "action_state" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"recipient_id" uuid,
	"category" "notif_category" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "outbound_channel" NOT NULL,
	"to_ref" text NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb,
	"state" "outbound_state" DEFAULT 'queued' NOT NULL,
	"provider_id" text,
	"attempts" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capsule_tags" (
	"capsule_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "capsule_tags_capsule_id_tag_id_pk" PRIMARY KEY("capsule_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" "citext",
	"phone" text,
	"birthday" date,
	"linked_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_id" uuid NOT NULL,
	"capsule_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_id_capsule_id_pk" PRIMARY KEY("user_id","capsule_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"plan" "entitlement_plan" DEFAULT 'free' NOT NULL,
	"source" "entitlement_source",
	"storage_quota_bytes" bigint NOT NULL,
	"seats" integer,
	"family_owner_id" uuid,
	"valid_until" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"metadata" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_recipients" ADD CONSTRAINT "capsule_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsules" ADD CONSTRAINT "capsules_chain_parent_id_capsules_id_fk" FOREIGN KEY ("chain_parent_id") REFERENCES "public"."capsules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_uploader_id_users_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_tags" ADD CONSTRAINT "capsule_tags_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_tags" ADD CONSTRAINT "capsule_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_family_owner_id_users_id_fk" FOREIGN KEY ("family_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_unique" ON "oauth_accounts" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_unique" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recovery_codes_user_id_idx" ON "recovery_codes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_token_hash_unique" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_unique" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "capsule_recipients_capsule_email_unique" ON "capsule_recipients" USING btree ("capsule_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "capsule_recipients_capsule_user_unique" ON "capsule_recipients" USING btree ("capsule_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capsule_recipients_access_token_hash_unique" ON "capsule_recipients" USING btree ("access_token_hash");--> statement-breakpoint
CREATE INDEX "capsule_recipients_capsule_id_idx" ON "capsule_recipients" USING btree ("capsule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capsules_public_id_unique" ON "capsules" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "capsules_owner_state_idx" ON "capsules" USING btree ("owner_id","state");--> statement-breakpoint
CREATE INDEX "capsules_state_unlock_at_idx" ON "capsules" USING btree ("state","unlock_at");--> statement-breakpoint
CREATE INDEX "capsules_org_id_idx" ON "capsules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "capsules_series_id_idx" ON "capsules" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "capsules_trashed_at_idx" ON "capsules" USING btree ("trashed_at") WHERE "capsules"."trashed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "media_items_capsule_id_idx" ON "media_items" USING btree ("capsule_id");--> statement-breakpoint
CREATE INDEX "reactions_capsule_id_idx" ON "reactions" USING btree ("capsule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scheduled_actions_idempotency_key_unique" ON "scheduled_actions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "scheduled_actions_state_run_at_idx" ON "scheduled_actions" USING btree ("state","run_at") WHERE "scheduled_actions"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "outbound_messages_state_idx" ON "outbound_messages" USING btree ("state");--> statement-breakpoint
CREATE INDEX "outbound_messages_to_ref_idx" ON "outbound_messages" USING btree ("to_ref");--> statement-breakpoint
CREATE INDEX "capsule_tags_tag_id_idx" ON "capsule_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "contacts_owner_id_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_name_unique" ON "tags" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "audit_events_subject_idx" ON "audit_events" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_type","actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");