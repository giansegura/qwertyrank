import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { loadEnvConfig } from "@next/env";
import { describeTargets, parseScriptEnv, type ScriptEnv } from "@/server/script-env";

/**
 * A script's environment. Without `--env`, the development one (`.env.local`...). With `--env <file>`, ONLY that file
 * (e.g. `.env.vercel-prod`): nothing is mixed with `.env.local` or with shell variables. Returns the remaining
 * arguments and shows the targets before going on.
 */
export function loadScriptEnv(argv: string[]): { env: ScriptEnv; args: string[] } {
  const args = [...argv];
  const at = args.indexOf("--env");
  let file: string | undefined;
  if (at !== -1) {
    file = args[at + 1];
    if (!file || file.startsWith("--")) throw new Error("--env needs a file path.");
    args.splice(at, 2);
  }
  let env: ScriptEnv;
  if (file) {
    env = parseScriptEnv(parseEnv(readFileSync(file, "utf8")), file);
  } else {
    loadEnvConfig(process.cwd(), true);
    env = parseScriptEnv(process.env, "the local environment (.env.local)");
  }
  console.log(`Target (${file ?? "local environment"}) → ${describeTargets(env)}`);
  return { env, args };
}
