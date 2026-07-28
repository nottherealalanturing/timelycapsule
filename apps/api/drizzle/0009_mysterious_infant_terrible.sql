CREATE TABLE "contact_group_members" (
	"group_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "contact_group_members_group_id_contact_id_pk" PRIMARY KEY("group_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_group_id_contact_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."contact_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_group_members" ADD CONSTRAINT "contact_group_members_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_groups" ADD CONSTRAINT "contact_groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_group_members_contact_id_idx" ON "contact_group_members" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_groups_owner_id_name_unique" ON "contact_groups" USING btree ("owner_id","name");