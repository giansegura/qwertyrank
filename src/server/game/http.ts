import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { ANON_COOKIE, readAnonId } from "../anon";
import { serverEnv } from "../env";

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function parseBody<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T> | null> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function readOwner(request: NextRequest): string | null {
  return readAnonId(request.cookies.get(ANON_COOKIE)?.value, serverEnv().ANON_COOKIE_SECRET);
}
