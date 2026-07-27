CREATE TABLE "recipient_otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipient_otp_codes" ADD CONSTRAINT "recipient_otp_codes_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipient_otp_codes_recipient_id_idx" ON "recipient_otp_codes" USING btree ("recipient_id");