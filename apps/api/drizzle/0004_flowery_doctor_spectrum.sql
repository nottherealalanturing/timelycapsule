CREATE TABLE "blocks" (
	"blocker_user_id" uuid NOT NULL,
	"blocked_email" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_user_id_blocked_email_pk" PRIMARY KEY("blocker_user_id","blocked_email")
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_user_id_users_id_fk" FOREIGN KEY ("blocker_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;