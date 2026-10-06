CREATE TABLE "period_bests" (
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"period_type" text NOT NULL,
	"period_key" text NOT NULL,
	"game_id" uuid NOT NULL,
	"wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"score" bigint NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "period_bests_user_id_language_input_type_period_type_period_key_pk" PRIMARY KEY("user_id","language","input_type","period_type","period_key"),
	CONSTRAINT "period_bests_period_type_check" CHECK ("period_bests"."period_type" in ('day', 'week', 'month', 'year', 'all'))
);
--> statement-breakpoint
ALTER TABLE "period_bests" ADD CONSTRAINT "period_bests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_bests" ADD CONSTRAINT "period_bests_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "period_bests_board_idx" ON "period_bests" USING btree ("language","input_type","period_type","period_key","score" DESC NULLS LAST);