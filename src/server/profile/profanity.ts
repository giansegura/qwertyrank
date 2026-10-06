import "server-only";
import {
  DataSet,
  RegExpMatcher,
  collapseDuplicatesTransformer,
  englishDataset,
  englishRecommendedWhitelistMatcherTransformers,
  parseRawPattern,
  resolveConfusablesTransformer,
  resolveLeetSpeakTransformer,
  toAsciiLowerCaseTransformer,
} from "obscenity";

/**
 * Palabrotas para nicks (spec §3.6). La base inglesa es la de obscenity; la de español y
 * portugués es nuestra, y cada palabra lleva sus excepciones legítimas (`computadora` contiene
 * `puta`). En los patrones, `|x` exige empezar en límite de palabra y `x|` acabar en uno.
 */
const ES_PT: Record<string, readonly string[]> = {
  puta: ["computa", "reputa", "disputa", "diputa", "deputa", "imputa", "amputa", "putativ"],
  puto: ["computo", "disputo", "reputo", "imputo", "amputo"],
  mierda: [],
  joder: [],
  jodete: [],
  gilipollas: [],
  cabron: [],
  cabrao: [],
  pendejo: [],
  pendeja: [],
  verga: ["vergara"],
  polla: [],
  maricon: [],
  culero: [],
  "|culo|": [],
  "|cono|": [],
  chinga: [],
  pinche: [],
  follar: [],
  zorra: [],
  hijueputa: [],
  malparido: [],
  caralho: [],
  porra: [],
  merda: [],
  buceta: [],
  "|foda": [],
  foder: ["fodder"],
  fodido: [],
  viado: ["enviado", "desviado"],
  punheta: [],
  piroca: [],
  xoxota: [],
  arrombado: [],
  cuzao: [],
  vadia: ["vadiar"],
  bosta: [],
  "|fdp|": [],
  "|pqp|": [],
  "|vsf|": [],
};

type Metadata = { originalWord: string };

const dataset = new DataSet<Metadata>().addAll(englishDataset as unknown as DataSet<Metadata>);
for (const [word, allowed] of Object.entries(ES_PT)) {
  dataset.addPhrase((phrase) => {
    phrase.setMetadata({ originalWord: word }).addPattern(parseRawPattern(word));
    for (const term of allowed) phrase.addWhitelistedTerm(term);
    return phrase;
  });
}
const built = dataset.build();

const matcher = new RegExpMatcher({
  blacklistedTerms: built.blacklistedTerms,
  whitelistedTerms: [...(built.whitelistedTerms ?? []), "cockpit"],
  blacklistMatcherTransformers: [
    resolveConfusablesTransformer(),
    resolveLeetSpeakTransformer(),
    toAsciiLowerCaseTransformer(),
    // Como el preset inglés, pero con la "r" doble: si no, "porra" se queda en "pora" y no se detecta.
    collapseDuplicatesTransformer({
      defaultThreshold: 1,
      customThresholds: new Map([
        ["b", 2],
        ["e", 2],
        ["o", 2],
        ["l", 2],
        ["s", 2],
        ["g", 2],
        ["r", 2],
      ]),
    }),
  ],
  whitelistMatcherTransformers: englishRecommendedWhitelistMatcherTransformers,
});

/** Para obscenity `_` es una letra más: se cambia por un espacio para que funcionen los límites de palabra. */
export function isProfane(text: string): boolean {
  return matcher.hasMatch(text.replaceAll("_", " "));
}
