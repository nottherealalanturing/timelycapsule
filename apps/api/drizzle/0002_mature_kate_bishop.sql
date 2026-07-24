CREATE TYPE "public"."otp_purpose" AS ENUM('verify_email', 'password_reset');--> statement-breakpoint
CREATE TABLE "email_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "previous_refresh_token_hash" text;--> statement-breakpoint
ALTER TABLE "email_otp_codes" ADD CONSTRAINT "email_otp_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_otp_codes_user_id_purpose_idx" ON "email_otp_codes" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "email_otp_codes_code_hash_idx" ON "email_otp_codes" USING btree ("code_hash");