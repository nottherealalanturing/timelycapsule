CREATE TABLE "capsule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capsule_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capsule_versions" ADD CONSTRAINT "capsule_versions_capsule_id_capsules_id_fk" FOREIGN KEY ("capsule_id") REFERENCES "public"."capsules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capsule_versions_capsule_id_created_at_idx" ON "capsule_versions" USING btree ("capsule_id","created_at");