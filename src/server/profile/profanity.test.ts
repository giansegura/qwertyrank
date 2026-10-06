import { describe, expect, it } from "vitest";
import { isProfane } from "./profanity";

// Listas probadas al elegir la librería: insultos con leetspeak y palabras legítimas que los contienen.
const PROFANE = [
  "xx_puta_xx", "put4", "PUT4_master", "sh1t", "5h1t_lord", "fuuuck", "fuck_you", "m3rd4", "caralh0",
  "p0rr4", "gilip0llas", "pqp", "f0da", "fodase", "pendej0", "v3rga", "cabr0n", "b1tch", "pussy_cat",
  "buceta", "arrombado", "xx_culo", "cono_sur", "fdp_123", "hijueputa", "m13rda", "c4r4lh0", "vi4do", "b0sta",
];
const CLEAN = [
  "assassin", "classic", "grass", "scunthorpe", "computadora", "reputation", "reputacion", "diputado",
  "deputado", "disputa", "temporada", "escudo", "curioso", "titan", "shitake", "analyst", "enviado",
  "desviado", "americano", "calculo", "icono", "conocer", "vergara", "essex", "hancock", "dickens",
  "cumulus", "mississippi", "titanic", "corporacion", "porta", "pollo", "zorro", "speedtyper",
  "qwerty_king", "sextant", "pinchazo", "vadiar", "mercado", "fodder", "cockpit", "cockpit_ace",
];

describe("isProfane", () => {
  it.each(PROFANE)("detecta %s", (nick) => {
    expect(isProfane(nick)).toBe(true);
  });

  it.each(CLEAN)("deja pasar %s", (nick) => {
    expect(isProfane(nick)).toBe(false);
  });
});
