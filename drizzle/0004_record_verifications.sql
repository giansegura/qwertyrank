CREATE TABLE "record_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"game_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "record_verifications_language_check" CHECK ("record_verifications"."language" in ('en', 'es', 'pt')),
	CONSTRAINT "record_verifications_input_type_check" CHECK ("record_verifications"."input_type" in ('physical', 'touch')),
	CONSTRAINT "record_verifications_status_check" CHECK ("record_verifications"."status" in ('pending', 'verified', 'failed')),
	CONSTRAINT "record_verifications_attempts_check" CHECK ("record_verifications"."attempts" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "verified_levels" (
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"wpm" double precision NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verified_levels_user_id_language_input_type_pk" PRIMARY KEY("user_id","language","input_type"),
	CONSTRAINT "verified_levels_language_check" CHECK ("verified_levels"."language" in ('en', 'es', 'pt')),
	CONSTRAINT "verified_levels_input_type_check" CHECK ("verified_levels"."input_type" in ('physical', 'touch'))
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "mode" text DEFAULT 'ranked' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "verification_id" uuid;--> statement-breakpoint
ALTER TABLE "record_verifications" ADD CONSTRAINT "record_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_verifications" ADD CONSTRAINT "record_verifications_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_levels" ADD CONSTRAINT "verified_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "record_verifications_pending_idx" ON "record_verifications" USING btree ("user_id","language","input_type") WHERE "record_verifications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "record_verifications_status_created_idx" ON "record_verifications" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_verification_id_record_verifications_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."record_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_verification_idx" ON "games" USING btree ("verification_id");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_mode_check" CHECK ("games"."mode" in ('ranked', 'verification'));