"""Home page JS budget (spec §7.5): what `/[locale]` loads on top of what `/_not-found` loads
(the app's shared JS), gzipped at level 9, at most 30.0 KB. Measured after `pnpm build`.

In Python rather than Node: Node's zlib compresses differently (about 120 B more on the home page) and
the budget was set with this measurement."""

import gzip
import json
import sys

LIMIT_BYTES = 30 * 1024
ROUTES = ["/[locale]", "/[locale]/practice"]

try:
    with open(".next/diagnostics/route-bundle-stats.json") as file:
        stats = {entry["route"]: entry["firstLoadChunkPaths"] for entry in json.load(file)}
except FileNotFoundError:
    sys.exit("No .next/diagnostics/route-bundle-stats.json: run `pnpm build` first.")

base = set(stats["/_not-found"])


def own_bytes(route):
    """Gzipped bytes of the route's chunks that `/_not-found` doesn't load."""
    total = 0
    for path in stats[route]:
        if path not in base:
            with open(path, "rb") as chunk:
                total += len(gzip.compress(chunk.read(), 9))
    return total


def kb(size):
    return f"{size / 1024:.1f} KB ({size} B)"


sizes = {route: own_bytes(route) for route in ROUTES}
for route in ROUTES:
    print(f"{route}: {kb(sizes[route])}")

home = sizes["/[locale]"]
if home > LIMIT_BYTES:
    sys.exit(f"The home page is over budget: {kb(home)} > {kb(LIMIT_BYTES)}.")
print(f"Home page headroom: {LIMIT_BYTES - home} B.")
