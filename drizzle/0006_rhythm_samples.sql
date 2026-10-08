CREATE TABLE "rhythm_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" text NOT NULL,
	"input_type" text NOT NULL,
	"mode" text NOT NULL,
	"verdict" text NOT NULL,
	"reject_reason" text,
	"wpm" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"played_week" date NOT NULL,
	"player_status" text NOT NULL,
	"intervals_ms" integer[] NOT NULL,
	"holds_ms" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
