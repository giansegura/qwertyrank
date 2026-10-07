"""Presupuesto de JS de la portada (spec §7.5): lo que `/[locale]` carga además de lo que carga
`/_not-found` (el JS común de la app), en gzip de nivel 9, como máximo 30,0 KB. Se mide tras `pnpm build`.

En Python y no en Node: el zlib de Node comprime distinto (unos 120 B más en la portada) y el
presupuesto se fijó con esta medida."""

import gzip
import json
import sys

LIMIT_BYTES = 30 * 1024
ROUTES = ["/[locale]", "/[locale]/practice"]

try:
    with open(".next/diagnostics/route-bundle-stats.json") as file:
        stats = {entry["route"]: entry["firstLoadChunkPaths"] for entry in json.load(file)}
except FileNotFoundError:
    sys.exit("No hay .next/diagnostics/route-bundle-stats.json: ejecuta antes `pnpm build`.")

base = set(stats["/_not-found"])


def own_bytes(route):
    """Bytes en gzip de los chunks de la ruta que no carga `/_not-found`."""
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
    sys.exit(f"La portada pasa del presupuesto: {kb(home)} > {kb(LIMIT_BYTES)}.")
print(f"Margen de la portada: {LIMIT_BYTES - home} B.")
