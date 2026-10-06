import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { loadEnvConfig } from "@next/env";
import { describeTargets, parseScriptEnv, type ScriptEnv } from "@/server/script-env";

/**
 * Entorno de un script. Sin `--env`, el de desarrollo (`.env.local`...). Con `--env <archivo>`, SOLO ese archivo
 * (p. ej. `.env.vercel-prod`): nada se mezcla con `.env.local` ni con variables del shell. Devuelve los argumentos
 * restantes y muestra los destinos antes de seguir.
 */
export function loadScriptEnv(argv: string[]): { env: ScriptEnv; args: string[] } {
  const args = [...argv];
  const at = args.indexOf("--env");
  let file: string | undefined;
  if (at !== -1) {
    file = args[at + 1];
    if (!file || file.startsWith("--")) throw new Error("--env necesita la ruta de un archivo.");
    args.splice(at, 2);
  }
  let env: ScriptEnv;
  if (file) {
    env = parseScriptEnv(parseEnv(readFileSync(file, "utf8")), file);
  } else {
    loadEnvConfig(process.cwd(), true);
    env = parseScriptEnv(process.env, "el entorno local (.env.local)");
  }
  console.log(`Destino (${file ?? "entorno local"}) → ${describeTargets(env)}`);
  return { env, args };
}
