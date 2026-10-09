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
 * Swear words for nicks (spec §3.6). The English base is obscenity's; the Spanish and Portuguese
 * one is ours, and each word carries its legitimate exceptions (`computadora` contains `puta`).
 * In the patterns, `|x` requires starting at a word boundary and `x|` ending at one.
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
    // Like the English preset, but with double "r": otherwise "porra" becomes "pora" and is not detected.
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

/** For obscenity `_` is just another letter: it is replaced by a space so word boundaries work. */
export function isProfane(text: string): boolean {
  return matcher.hasMatch(text.replaceAll("_", " "));
}
