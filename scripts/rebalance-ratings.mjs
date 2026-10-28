import { readFile, writeFile } from "node:fs/promises";

const catalogPaths = ["shared/catalog.json", "shared/crossover-catalog.json"];

// The cap counts identities, not cards. A character can have multiple cards,
// but those versions must not occupy several places in the talent pyramid.
const ratingCaps = new Map([
  [97, 2], [96, 2], [95, 3], [94, 4], [93, 5], [92, 7],
  [91, 9], [90, 12], [89, 16], [88, 22], [87, 30], [86, 40],
  [85, 55], [84, 75],
]);

// Narrative anchors only settle the exceptional end of the scale. Everyone
// else is ranked from the existing editorial score, team level and appearances.
const curatedPeaks = {
  "blue-lock": {
    "Noel Noa": 97,
    "Marc Snuffy": 97,
    "Chris Prince": 96,
    "Julian Loki": 96,
    Lavinho: 95,
    "Michael Kaiser": 95,
    "Don Lorenzo": 95,
    "Sae Itoshi": 94,
    "Rin Itoshi": 94,
    "Yoichi Isagi": 94,
    "Ryusei Shido": 94,
    "Shoei Baro": 93,
    "Seishiro Nagi": 93,
    "Meguru Bachira": 93,
    "Charles Chevalier": 93,
    "Oliver Aiku": 92,
    "Hyoma Chigiri": 92,
    "Rensuke Kunigami": 92,
    "Reo Mikage": 91,
    "Tabito Karasu": 91,
    "Yo Hiori": 91,
    "Gin Gagamaru": 90,
    "Kenyu Yukimiya": 89,
  },
  "captain-tsubasa": {
    Michael: 97,
    "Tsubasa Ozora": 97,
    Natureza: 96,
    Rivaul: 96,
    "Karl Heinz Schneider": 95,
    "Genzo Wakabayashi": 95,
    "Carlos Santana": 95,
    "Kojiro Hyuga": 94,
    "Taro Misaki": 94,
    "Juan Diaz": 94,
    "Brian Cruyfford": 94,
    "Deuter Muller": 93,
    "Jun Misugi": 93,
    "Stefan Levin": 93,
    "Elle Sid Pierre": 93,
    "Hikaru Matsuyama": 92,
    "Shingo Aoi": 92,
    "Ken Wakashimazu": 92,
    "Ricardo Espadas": 92,
    "Hermann Kaltz": 91,
    "Ryoma Hino": 91,
    "Salvatore Gentile": 91,
    "Shun Nitta": 90,
  },
};

function normalizedName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

async function loadOverrides() {
  const option = process.argv.indexOf("--overrides-url");
  if (option < 0) return {};
  const url = process.argv[option + 1];
  if (!url) throw new Error("--overrides-url requires an HTTPS URL");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("The overrides URL must use HTTPS");
  const response = await fetch(parsed, { headers: { "User-Agent": "ElevenForceRatingAudit/1.0" } });
  if (!response.ok) throw new Error(`Could not load overrides: ${response.status}`);
  const payload = await response.json();
  if (!payload?.overrides || typeof payload.overrides !== "object") throw new Error("Invalid overrides response");
  return payload.overrides;
}

const catalogues = await Promise.all(catalogPaths.map(async (path) => ({
  path,
  squads: JSON.parse(await readFile(path, "utf8")),
})));
const squads = catalogues.flatMap((catalogue) => catalogue.squads);
const overrides = await loadOverrides();
const cards = squads.flatMap((squad) => squad.players.map((player) => ({
  player,
  squad,
  editorialRating: overrides[player.id]?.rating ?? player.rating,
})));

const reports = {};
for (const season of [...new Set(squads.map((squad) => squad.season))]) {
  const seasonCards = cards.filter(({ player }) => player.season === season);
  const identities = new Map();
  for (const card of seasonCards) {
    // Names are the canonical identity boundary. This also merges legacy wiki
    // aliases such as Schneider's 1983 article without merging the twins.
    const key = normalizedName(card.player.name);
    const identity = identities.get(key) ?? { key, name: card.player.name, cards: [] };
    identity.cards.push(card);
    identities.set(key, identity);
  }

  const anchors = curatedPeaks[season] ?? {};
  const anchoredByKey = new Map(Object.entries(anchors).map(([name, rating]) => [normalizedName(name), rating]));
  for (const name of Object.keys(anchors)) {
    if (!identities.has(normalizedName(name))) throw new Error(`Missing curated identity in ${season}: ${name}`);
  }
  const ranked = [...identities.values()].map((identity) => {
    const currentPeak = Math.max(...identity.cards.map((card) => card.editorialRating));
    const maxTier = Math.max(...identity.cards.map((card) => card.squad.tier));
    const teams = new Set(identity.cards.map((card) => card.squad.id)).size;
    const curatedPeak = anchoredByKey.get(identity.key);
    const requestedPeak = curatedPeak ?? currentPeak;
    const peakCard = [...identity.cards].sort((first, second) =>
      second.editorialRating - first.editorialRating
      || second.squad.tier - first.squad.tier
      || first.player.id.localeCompare(second.player.id),
    )[0];
    return {
      ...identity,
      currentPeak,
      maxTier,
      teams,
      curatedPeak,
      requestedPeak,
      peakCardId: peakCard.player.id,
      rankScore: requestedPeak * 10_000 + maxTier * 100 + Math.min(99, teams) + (hash(identity.key) % 100) / 1_000,
    };
  }).sort((first, second) => second.rankScore - first.rankScore || first.name.localeCompare(second.name));

  const usedBuckets = new Map();
  for (const identity of ranked) {
    let peak = Math.min(97, Math.max(60, Math.round(identity.requestedPeak)));
    while ((usedBuckets.get(peak) ?? 0) >= (ratingCaps.get(peak) ?? Number.POSITIVE_INFINITY)) peak -= 1;
    identity.peak = peak;
    usedBuckets.set(peak, (usedBuckets.get(peak) ?? 0) + 1);
  }

  for (const identity of ranked) {
    for (const card of identity.cards) {
      const editorialGap = Math.max(0, identity.currentPeak - card.editorialRating);
      // Blue Lock squads represent one continuous phase, while Inazuma and
      // Captain Tsubasa include materially younger/older versions.
      const contextualGap = season === "blue-lock" ? 0 : Math.max(0, Math.round((identity.maxTier - card.squad.tier) * 0.55));
      const versionGap = card.player.id === identity.peakCardId ? 0 : Math.max(editorialGap, contextualGap);
      card.player.rating = Math.max(60, identity.peak - versionGap);
    }
  }

  const identityDistribution = Object.fromEntries(
    [...usedBuckets.entries()].sort((first, second) => second[0] - first[0]),
  );
  const squadAverages = squads.filter((squad) => squad.season === season).map((squad) => ({
    name: squad.name,
    average: Number(average(squad.players.map((player) => player.rating)).toFixed(2)),
  })).sort((first, second) => second.average - first.average || first.name.localeCompare(second.name));
  reports[season] = {
    squads: squadAverages.length,
    cards: seasonCards.length,
    identities: ranked.length,
    cardAverage: Number(average(seasonCards.map(({ player }) => player.rating)).toFixed(2)),
    identityPeakAverage: Number(average(ranked.map((identity) => identity.peak)).toFixed(2)),
    identityDistribution,
    topIdentities: ranked.slice(0, 30).map((identity) => ({ name: identity.name, rating: identity.peak })),
    strongestSquads: squadAverages.slice(0, 8),
    weakestSquads: squadAverages.slice(-5).reverse(),
  };
}

for (const [season, report] of Object.entries(reports)) {
  for (const [rating, cap] of ratingCaps) {
    const count = report.identityDistribution[rating] ?? 0;
    if (count > cap) throw new Error(`${season} has ${count} identities rated ${rating}; cap is ${cap}`);
  }
}
for (const { player } of cards) {
  if (!Number.isInteger(player.rating) || player.rating < 60 || player.rating > 97) {
    throw new Error(`Invalid rating for ${player.id}: ${player.rating}`);
  }
}

for (const catalogue of catalogues) {
  await writeFile(catalogue.path, `${JSON.stringify(catalogue.squads, null, 2)}\n`);
}
await writeFile("shared/rating-report.json", `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  scale: {
    elite: "94-97",
    star: "90-93",
    good: "88-89",
    caps: Object.fromEntries(ratingCaps),
  },
  seasons: reports,
}, null, 2)}\n`);

console.log(`Rebalanced ${cards.length} cards across ${Object.keys(reports).length} sagas.`);
for (const [season, report] of Object.entries(reports)) {
  const high = Object.entries(report.identityDistribution).filter(([rating]) => Number(rating) >= 88)
    .sort((first, second) => Number(second[0]) - Number(first[0]))
    .map(([rating, count]) => `${rating}:${count}`).join(" ");
  console.log(`${season.padEnd(17)} cards ${String(report.cards).padStart(4)} | identities ${String(report.identities).padStart(3)} | average ${report.cardAverage.toFixed(2)} | ${high}`);
}
