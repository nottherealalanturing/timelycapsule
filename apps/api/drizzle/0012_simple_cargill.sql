CREATE TYPE "public"."reply_author" AS ENUM('sender', 'recipient');--> statement-breakpoint
CREATE TABLE "capsule_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capsule_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"author" "reply_author" NOT NULL,
	"body_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capsule_replies" ADD CONSTRAINT "capsule_replies_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capsule_replies" ADD CONSTRAINT "capsule_replies_recipient_id_capsule_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."capsule_recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capsule_replies_recipient_id_created_at_idx" ON "capsule_replies" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "capsule_replies_capsule_id_idx" ON "capsule_replies" USING btree ("capsule_id");