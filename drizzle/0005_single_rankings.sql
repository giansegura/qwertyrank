DELETE FROM "period_bests" WHERE "period_type" <> 'all';--> statement-breakpoint
ALTER TABLE "period_bests" RENAME TO "bests";--> statement-breakpoint
ALTER TABLE "bests" DROP CONSTRAINT "period_bests_period_type_check";--> statement-breakpoint
ALTER TABLE "bests" DROP CONSTRAINT "period_bests_user_id_language_input_type_period_type_period_key_pk";--> statement-breakpoint
DROP INDEX "period_bests_board_idx";--> statement-breakpoint
ALTER TABLE "bests" DROP COLUMN "period_type";--> statement-breakpoint
ALTER TABLE "bests" DROP COLUMN "period_key";--> statement-breakpoint
ALTER TABLE "bests" RENAME CONSTRAINT "period_bests_user_id_users_id_fk" TO "bests_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "bests" RENAME CONSTRAINT "period_bests_game_id_games_id_fk" TO "bests_game_id_games_id_fk";--> statement-breakpoint
ALTER TABLE "bests" ADD CONSTRAINT "bests_user_id_language_input_type_pk" PRIMARY KEY("user_id","language","input_type");--> statement-breakpoint
CREATE INDEX "bests_board_idx" ON "bests" USING btree ("language","input_type","score" DESC NULLS LAST);
