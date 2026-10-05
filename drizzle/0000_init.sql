CREATE TABLE "games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"anon_id" text,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"wpm" double precision NOT NULL,
	"raw_wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"verdict" text NOT NULL,
	"reject_reason" text,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"ip_hash" text,
	"starts_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_language_check" CHECK ("games"."language" in ('en', 'es', 'pt')),
	CONSTRAINT "games_input_type_check" CHECK ("games"."input_type" in ('physical', 'touch')),
	CONSTRAINT "games_verdict_check" CHECK ("games"."verdict" in ('valid', 'review', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "keystroke_logs" (
	"game_id" uuid PRIMARY KEY NOT NULL,
	"events" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keystroke_logs" ADD CONSTRAINT "keystroke_logs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;