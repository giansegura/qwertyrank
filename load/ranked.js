// Load test (spec 5e §4): players finishing Ranked games (`start` → `keys` every 3 s → `finish`) while visitors
// load the pages. Run it against a disposable environment, never production: every game is saved.
//
//   k6 run load/ranked.js                                  (k6 installed, app on localhost:3000)
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:3000 grafana/k6:2.3.0 run - < load/ranked.js
//
// Options (environment): BASE_URL, PLAYERS (peak concurrent games, 50), VISITORS (page loads per second, 10),
// HOLD (time at the peak, 3m). Keep HOLD under an hour: each VU is one anonymous player, and the app allows
// 100 games per hour per player (spec 4a §2).
// The app must run with Cloudflare's Turnstile test keys (or none): the token below only passes the test secret.

import { check, sleep } from "k6";
import http from "k6/http";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const PLAYERS = Number(__ENV.PLAYERS || 50);
const VISITORS = Number(__ENV.VISITORS || 10);
const HOLD = __ENV.HOLD || "3m";

/** The token Cloudflare's test site key produces: the test secret key accepts it (spec 4a §2.2). */
const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";
/** Like the client (`batch-sender.ts`): a batch every 3 s. */
const BATCH_MS = 3_000;
/** About 60 wpm: one character every 200 ms. */
const CHAR_MS = 200;

export const options = {
  scenarios: {
    players: {
      executor: "ramping-vus",
      exec: "player",
      stages: [
        { duration: "1m", target: PLAYERS },
        { duration: HOLD, target: PLAYERS },
        { duration: "30s", target: 0 },
      ],
      // A game in progress finishes before the VU stops.
      gracefulRampDown: "45s",
    },
    visitors: {
      executor: "constant-arrival-rate",
      exec: "visitor",
      rate: VISITORS,
      timeUnit: "1s",
      duration: "4m30s",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  // Server time (p95) per kind of request, and almost no errors.
  thresholds: {
    http_req_failed: ["rate<0.01"],
    checks: ["rate>0.99"],
    "http_req_duration{endpoint:start}": ["p(95)<500"],
    "http_req_duration{endpoint:keys}": ["p(95)<300"],
    "http_req_duration{endpoint:finish}": ["p(95)<1000"],
    "http_req_duration{endpoint:page}": ["p(95)<800"],
  },
};

/**
 * This VU's cookies: the anonymous id and the human pass. Kept by hand because the app marks them `Secure`
 * in production and k6 doesn't send those over plain `http://`.
 */
const cookies = {};

function keepCookies(response) {
  for (const [name, values] of Object.entries(response.cookies)) {
    if (values.length > 0) cookies[name] = values[0].value;
  }
  return response;
}

/**
 * A different client IP per VU (players and visitors), so the per-IP limit (150 games per hour, spec 4a §2) doesn't cut the test short.
 * Only works where the app reads `x-forwarded-for` as sent: locally, not on Vercel, which overwrites it.
 */
function headers() {
  const vu = __VU;
  return {
    "content-type": "application/json",
    "x-forwarded-for": `10.${(vu >> 16) & 255}.${(vu >> 8) & 255}.${vu & 255}`,
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
  };
}

/** A `busy` finish (409) is retried, like the client does: it isn't a failed request. */
const FINISH_STATUSES = http.expectedStatuses(200, 409);

function post(path, body, endpoint) {
  const params = { headers: headers(), tags: { endpoint } };
  if (endpoint === "finish") params.responseCallback = FINISH_STATUSES;
  return keepCookies(http.post(`${BASE_URL}${path}`, JSON.stringify(body), params));
}

/** `keydown`, `input` and `keyup` of each character, at `t` ms since the game started. */
function typingEvents(text, fromIndex, toIndex) {
  const events = [];
  for (let i = fromIndex; i < toIndex; i++) {
    const char = text[i];
    const t = i * CHAR_MS + 50;
    const code = char === " " ? "Space" : `Key${char.toUpperCase()}`;
    events.push({ t, type: "down", key: char, code, trusted: true });
    events.push({ t: t + 1, type: "input", deleted: 0, inserted: char, trusted: true });
    events.push({ t: t + 70, type: "up", key: char, code, trusted: true });
  }
  return events;
}

export function player() {
  const started = post(
    "/api/game/start",
    { language: "en", env: { coarse: false, touchPoints: 0 }, turnstileToken: TURNSTILE_TEST_TOKEN },
    "start",
  );
  if (!check(started, { "start 200": (r) => r.status === 200 })) {
    sleep(5);
    return;
  }
  const game = started.json();
  // The game's clock: batches leave on schedule, like the client's `setInterval`, however long each request takes.
  // If they waited 3 s after each response, latency would pile up and the last ones would arrive `late`.
  const startsAt = Date.now() + game.countdownMs;
  const sleepUntil = (ms) => sleep(Math.max(0, startsAt + ms - Date.now()) / 1_000);

  const text = `${game.words.join(" ")} `;
  const batches = Math.ceil(game.durationMs / BATCH_MS);
  let typed = 0;
  for (let seq = 1; seq <= batches; seq++) {
    sleepUntil(seq * BATCH_MS);
    // What fits until this batch leaves, minus the last character: no event is ever ahead of the clock.
    const upTo = Math.min(text.length, Math.floor((seq * BATCH_MS) / CHAR_MS) - 1);
    const keys = post(`/api/game/${game.gameId}/keys`, { seq, events: typingEvents(text, typed, upTo) }, "keys");
    check(keys, { "keys 200": (r) => r.status === 200 });
    typed = upTo;
  }

  // The client retries `busy` (another finish of the same game in progress).
  let finished = post(`/api/game/${game.gameId}/finish`, { lastSeq: batches }, "finish");
  for (let retry = 0; retry < 3 && finished.status === 409 && finished.json("error") === "busy"; retry++) {
    sleep(0.4);
    finished = post(`/api/game/${game.gameId}/finish`, { lastSeq: batches }, "finish");
  }
  check(finished, {
    "finish 200": (r) => r.status === 200,
    "game valid": (r) => r.status === 200 && r.json("verdict") === "valid",
  });
  sleep(2);
}

const PAGES = ["/en", "/es", "/en/practice", "/en/leaderboard/physical", "/es/ranking/fisico", "/en/guides"];

export function visitor() {
  const path = PAGES[Math.floor(Math.random() * PAGES.length)];
  const page = http.get(`${BASE_URL}${path}`, { headers: headers(), tags: { endpoint: "page" } });
  if (!check(page, { "page 200": (r) => r.status === 200 })) console.warn(`${path}: ${page.status} ${page.error}`);
}
