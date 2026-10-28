import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const blueApi = "https://bluelock.fandom.com/api.php";
const tsubasaApi = "https://captaintsubasa.fandom.com/api.php";
const outputDirectory = join(process.cwd(), "public", "portraits");

const blueTeams = [
  ["Team Z", 80], ["Team X", 76], ["Team Y", 77], ["Team W", 78], ["Team V", 84],
  ["Team White", 86], ["Team Red", 88], ["Team A", 87], ["Team B", 85], ["Team C", 85],
  ["Blue Lock Eleven", 91], ["Japan U-20", 91], ["Bastard München", 93], ["FC Barcha", 90],
  ["Manshine City", 90], ["Ubers", 92], ["Paris X Gen", 93], ["Nigeria U-20", 88],
  ["France U-20", 94], ["England U-20", 91],
];

// These are clearly labelled draft selections built exclusively from documented
// rosters. They cover the important phases without inventing reserve players.
const blueSelections = [
  ["First Selection All-Stars", 85, ["Team Z", "Team X", "Team Y", "Team W", "Team V"]],
  ["Building 5 Selection", 84, ["Team Z", "Team X", "Team Y", "Team W", "Team V"]],
  ["Second Selection All-Stars", 89, ["Team White", "Team Red"]],
  ["Third Selection All-Stars", 90, ["Team A", "Team B", "Team C"]],
  ["Blue Lock Top 6 Selection", 92, ["Team A", "Team B", "Team C"]],
  ["Blue Lock Eleven Reserves", 89, ["Blue Lock Eleven", "Team A", "Team B", "Team C"]],
  ["Japan U-20 Attack Selection", 92, ["Japan U-20", "Blue Lock Eleven"]],
  ["Japan U-20 Midfield Selection", 91, ["Japan U-20", "Blue Lock Eleven"]],
  ["Japan U-20 Defensive Selection", 91, ["Japan U-20", "Blue Lock Eleven"]],
  ["Neo Egoist League All-Stars", 94, ["Bastard München", "FC Barcha", "Manshine City", "Ubers", "Paris X Gen"]],
  ["Neo Egoist League Masters", 96, ["Bastard München", "FC Barcha", "Manshine City", "Ubers", "Paris X Gen"]],
  ["Neo Egoist League Rising Stars", 93, ["Bastard München", "FC Barcha", "Manshine City", "Ubers", "Paris X Gen"]],
  ["Bastard München Draft XI", 92, ["Bastard München", "Team Z"]],
  ["FC Barcha Draft XI", 90, ["FC Barcha", "Team Z", "Team V"]],
  ["Manshine City Draft XI", 91, ["Manshine City", "Team V", "Team White"]],
  ["Ubers Draft XI", 92, ["Ubers", "Japan U-20", "Team X"]],
  ["Paris X Gen Draft XI", 93, ["Paris X Gen", "Team Red", "Team A"]],
  ["U-20 World Cup Stars", 94, ["Japan U-20", "Nigeria U-20", "France U-20", "England U-20"]],
  ["U-20 Europe Selection", 93, ["France U-20", "England U-20", "Bastard München", "FC Barcha"]],
  ["U-20 International Selection", 93, ["Japan U-20", "Nigeria U-20", "France U-20", "England U-20"]],
  ["Blue Lock All-Stars", 95, blueTeams.map(([name]) => name)],
];

const tsubasaTeams = [
  ["U-22 Japan", 92], ["All Japan Youth", 92], ["All Japan Jr. Youth", 90], ["All Japan Jr. Youth (1986)", 89],
  ["Olympic Japan", 94], ["Japan Selection", 91], ["World Selection", 95], ["FC Barcelona", 93],
  ["Interna Juniores", 88], ["World Selection (Sansei)", 94], ["F.C.R.B. (Hyuga Kojiro All Stars)", 91],
  ["Oozora Tsubasa Friends", 92], ["Juventus FC", 90], ["Nankatsu SC", 87], ["Olympic Brazil", 94],
  ["Olympic Germany", 94], ["All Europe Jr. Youth", 91], ["Brazil Youth", 93],
  ["Nankatsu Elementary School", 82], ["France Jr. Youth", 87], ["Meiwa FC", 83],
  ["Nankatsu High School", 87], ["Nankatsu Middle School", 88], ["Olympic Argentina", 92],
  ["Shutetsu Elementary School", 80], ["China Youth", 87], ["Germany Jr. Youth", 91],
  ["Hamburger SV Jr. Youth", 88], ["Hanawa Middle School", 82], ["Musashi FC", 84],
  ["Saudi Arabia Youth", 85], ["Uruguay Youth", 87], ["Argentina Jr. Youth", 89],
  ["Azumaichi Middle School", 80], ["Furano Elementary Soccer Club", 81], ["Furano Middle School", 85],
  ["Hanawa SS", 80], ["Hirado Middle School", 83], ["Italy Jr. Youth", 88],
  ["Meiwa Higashi Middle School", 82], ["Mexico Youth", 88], ["Musashi Middle School", 85],
  ["Naniwa FC", 80], ["Olympic Spain", 95], ["Otomo Middle School", 83], ["Real Japan 11", 90],
  ["Sao Pas FC", 88], ["Shimada Elementary Soccer Club", 78], ["Sweden Youth", 91],
  ["Thailand Youth", 87], ["Toho Academy Middle School", 88], ["Uzbekistan Youth", 84],
];

if (blueTeams.length + blueSelections.length !== 41 || tsubasaTeams.length !== 52) {
  throw new Error("The crossover catalogue must contain 41 Blue Lock and 52 Captain Tsubasa squads");
}

const starRatings = {
  "Noel Noa": 97, "Marc Snuffy": 97, "Chris Prince": 96, "Julian Loki": 96,
  Lavinho: 95, "Michael Kaiser": 95, "Don Lorenzo": 95, "Sae Itoshi": 94,
  "Rin Itoshi": 94, "Yoichi Isagi": 94, "Ryusei Shido": 94, "Shoei Baro": 93,
  "Seishiro Nagi": 93, "Meguru Bachira": 93, "Charles Chevalier": 93,
  "Hyoma Chigiri": 92, "Oliver Aiku": 92, "Rensuke Kunigami": 92,
  "Reo Mikage": 91, "Tabito Karasu": 91, "Yo Hiori": 91, "Gin Gagamaru": 90,
  "Ikki Niko": 89, "Eita Otoya": 89, "Kenyu Yukimiya": 89,
  "Tsubasa Ozora": 97, Michael: 97, Natureza: 96, Rivaul: 96,
  "Karl Heinz Schneider": 95, "Genzo Wakabayashi": 95, "Carlos Santana": 95,
  "Kojiro Hyuga": 94, "Taro Misaki": 94, "Juan Diaz": 94, "Brian Cruyfford": 94,
  "Stefan Levin": 93, "Jun Misugi": 93, "Elle Sid Pierre": 93, "Deuter Muller": 93,
  "Hikaru Matsuyama": 92, "Shingo Aoi": 92, "Ken Wakashimazu": 92, "Ricardo Espadas": 92,
  "Hermann Kaltz": 91, "Ryoma Hino": 91, "Salvatore Gentile": 91,
  "Zino Hernandez": 91, "Shun Nitta": 90, "Ramon Victorino": 90,
};

const versatilePositions = {
  "Gin Gagamaru": ["GK", "FW"], "Reo Mikage": ["MF", "DF"], "Hyoma Chigiri": ["FW", "MF"],
  "Yoichi Isagi": ["FW", "MF"], "Rin Itoshi": ["FW", "MF"], "Meguru Bachira": ["FW", "MF"],
  "Yo Hiori": ["MF", "DF"], "Ranze Kurona": ["DF", "MF"], "Jingo Raichi": ["MF", "DF"],
  "Ikki Niko": ["DF", "MF"], "Jyubei Aryu": ["DF", "FW"], "Tabito Karasu": ["MF", "DF"],
  "Tsubasa Ozora": ["MF", "FW"], "Taro Misaki": ["MF", "FW"], "Hikaru Matsuyama": ["MF", "DF"],
  "Jun Misugi": ["DF", "MF"], "Shingo Aoi": ["MF", "FW"], Natureza: ["MF", "FW"],
  Michael: ["MF", "FW"], "Carlos Santana": ["FW", "MF"], "Karl Heinz Schneider": ["FW", "MF"],
  "Hermann Kaltz": ["MF", "DF"], Rivaul: ["MF", "FW"], "Ken Wakashimazu": ["GK", "FW"],
};

const preferredPositions = {
  "Gin Gagamaru": "GK", "Oliver Aiku": "DF", "Ikki Niko": "DF", "Jyubei Aryu": "DF",
  "Miroku Darai": "DF", "Kazuma Niou": "DF", "Teppei Neru": "DF", "Don Lorenzo": "DF",
  "Reo Mikage": "MF", "Tabito Karasu": "MF", "Yo Hiori": "MF", "Sae Itoshi": "MF",
  "Charles Chevalier": "MF", "Tsubasa Ozora": "MF", "Taro Misaki": "MF", "Jun Misugi": "DF",
  "Hikaru Matsuyama": "MF", "Shingo Aoi": "MF", "Hermann Kaltz": "MF", Rivaul: "MF",
  Natureza: "MF", Michael: "MF", "Genzo Wakabayashi": "GK", "Ken Wakashimazu": "GK",
  "Deuter Muller": "GK", "Zino Hernandez": "GK", "Ricardo Espadas": "GK",
};

const palettes = [
  ["#1458ff", "#8df7ff"], ["#ff4d00", "#ffe34d"], ["#6d20d8", "#f199ff"],
  ["#00875a", "#cbff55"], ["#d10d3f", "#ffffff"], ["#113a78", "#ffcb35"],
  ["#111827", "#57d9ff"], ["#cf2727", "#f7f1db"],
];
const elements = ["Fire", "Wind", "Forest", "Mountain"];

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function slug(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clean(value = "") {
  return value.replace(/<ref[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, "").replace(/<[^>]+>/g, "")
    .replace(/''+/g, "").replace(/&amp;/g, "&").replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
}

async function fetchJson(url, attempts = 4) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "ElevenForceCatalog/2.0 (private non-commercial fan project)" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (candidate) {
      error = candidate;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw error;
}

async function wikiPages(api, titles, properties = "revisions|pageimages") {
  const pages = [];
  for (let index = 0; index < titles.length; index += 20) {
    const requested = titles.slice(index, index + 20);
    const url = new URL(api);
    url.search = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1", prop: properties,
      rvprop: "content", rvslots: "main", piprop: "thumbnail|original", pithumbsize: "640",
      titles: requested.join("|"), origin: "*",
    });
    const data = await fetchJson(url);
    const aliases = new Map([
      ...(data.query?.normalized ?? []).map(({ from, to }) => [from, to]),
      ...(data.query?.redirects ?? []).map(({ from, to }) => [from, to]),
    ]);
    const resolve = (title) => {
      let current = title;
      const visited = new Set();
      while (aliases.has(current) && !visited.has(current)) {
        visited.add(current);
        current = aliases.get(current);
      }
      return current;
    };
    const returned = data.query?.pages ?? [];
    for (const title of requested) {
      const target = resolve(title.replaceAll("_", " "));
      const page = returned.find((candidate) => candidate.title.localeCompare(target, undefined, { sensitivity: "accent" }) === 0)
        ?? returned.find((candidate) => candidate.title.localeCompare(title, undefined, { sensitivity: "accent" }) === 0);
      if (page) pages.push({ ...page, title });
    }
  }
  return pages;
}

function contentOf(page) {
  return page.revisions?.[0]?.slots?.main?.content ?? "";
}

function parseBlueRoster(page) {
  const text = contentOf(page);
  const members = text.match(/==\s*Members\s*==([\s\S]*?)(?=\n==[^=]|$)/i)?.[1] ?? text;
  const players = [];
  for (const match of members.matchAll(/\{\{\s*CharPortal\b([\s\S]*?)\}\}/gi)) {
    const body = match[1];
    const article = clean(body.match(/\|\s*articlename\s*=\s*([^|}\n]+)/i)?.[1] ?? "");
    // Portal labels may include shirt numbers or "(Master)". The article title
    // is the stable canonical identity shared by every version of the player.
    const name = clean(article.replace(/\s+\(Blue Lock\)$/i, ""));
    if (article && name) players.push({ article, name });
  }
  return [...new Map(players.map((player) => [player.article, player])).values()];
}

function parseWikiLink(value) {
  const link = value.match(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/);
  if (!link || /^(?:file|image):/i.test(link[1])) return undefined;
  return { article: clean(link[1]), name: clean(link[2] ?? link[1]) };
}

function parseTsubasaRoster(page) {
  const players = [];
  for (const match of contentOf(page).matchAll(/\{\{\s*(?:Nat squad player|Squad player)\b([\s\S]*?)\}\}/gi)) {
    const body = match[1];
    const player = parseWikiLink(body.match(/\|\s*name\s*=\s*([^\n}]+)/i)?.[1] ?? "");
    const rawPosition = clean(body.match(/\|\s*pos\s*=\s*([^|}\n]+)/i)?.[1] ?? "").toUpperCase();
    if (!player || /^unknown name$/i.test(player.name)) continue;
    const position = rawPosition.includes("GK") ? "GK" : rawPosition.includes("DF") ? "DF"
      : rawPosition.includes("FW") ? "FW" : "MF";
    players.push({ ...player, sourcePosition: position });
  }
  return [...new Map(players.map((player) => [player.article, player])).values()];
}

function normalizedName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function tsubasaStatsPortraits() {
  const directory = await (await fetch("https://captaintsubasastats.robla.es/teams")).text();
  const teamUrls = [...new Set([...directory.matchAll(/href=["'](https:\/\/captaintsubasastats\.robla\.es\/team\/[^"'#?]+)["']/gi)].map((match) => match[1]))];
  const portraits = new Map();
  let cursor = 0;
  const runners = Array.from({ length: 12 }, async () => {
    while (cursor < teamUrls.length) {
      const url = teamUrls[cursor++];
      const response = await fetch(url, { headers: { "User-Agent": "ElevenForceCatalog/2.0 (private non-commercial fan project)" } });
      if (!response.ok) continue;
      const html = await response.text();
      for (const row of html.matchAll(/<tr class="(?:odd|even)">([\s\S]*?)<\/tr>/gi)) {
        const player = row[1].match(/href=["'][^"']*\/player\/([^"'/?#]+)["'][^>]*>([\s\S]*?)<\/a>/i);
        const image = row[1].match(/class="player-photo"[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/i);
        if (!player || !image) continue;
        const displayName = clean(player[2]);
        const altName = clean(image[2]).replace(/^Picture of\s+/i, "");
        const source = image[1].replace(/\s+/g, "");
        for (const key of [player[1], displayName, altName]) {
          if (key) portraits.set(normalizedName(key), source);
        }
      }
    }
  });
  await Promise.all(runners);
  return portraits;
}

function parseBluePosition(page) {
  const raw = clean(contentOf(page).match(/\|\s*position\s*=\s*([^\n]+)/i)?.[1] ?? "").toLowerCase();
  const positions = [];
  if (/goalkeeper/.test(raw)) positions.push("GK");
  if (/defender|centre-back|center-back|full-back/.test(raw)) positions.push("DF");
  if (/midfielder|winger/.test(raw)) positions.push("MF");
  if (/forward|striker/.test(raw)) positions.push("FW");
  return positions;
}

function sourceImage(page) {
  return (page.thumbnail?.source ?? page.original?.source ?? "").replace(/\s+/g, "");
}

function baseRating(name, tier, appearances) {
  const recurring = Math.min(5, Math.floor(Math.max(0, appearances - 1) / 2));
  const jitter = (hash(name) % 5) - 2;
  return Math.max(64, Math.min(93, tier - 10 + recurring + jitter));
}

function ratingFor(name, tier, appearances) {
  return Math.max(baseRating(name, tier, appearances), starRatings[name] ?? 0);
}

function assignPositions(players) {
  const assigned = players.map((player) => {
    const source = player.sourcePositions ?? (player.sourcePosition ? [player.sourcePosition] : []);
    const curated = versatilePositions[player.name] ?? [];
    const primary = preferredPositions[player.name] ?? source[0] ?? curated[0] ?? "FW";
    return { ...player, position: primary, positions: [primary, ...source, ...curated].filter((item, index, values) => values.indexOf(item) === index) };
  });
  const target = { GK: 1, DF: 3, MF: 3, FW: 1 };
  const protectedNames = new Set(Object.keys(starRatings));
  for (const [position, minimum] of Object.entries(target)) {
    while (assigned.filter((player) => player.position === position).length < minimum) {
      const candidate = [...assigned].sort((a, b) => {
        const aProtected = protectedNames.has(a.name) || preferredPositions[a.name] ? 1 : 0;
        const bProtected = protectedNames.has(b.name) || preferredPositions[b.name] ? 1 : 0;
        return aProtected - bProtected || a.rating - b.rating || a.name.localeCompare(b.name);
      }).find((player) => player.position !== position && player.position !== "GK" && !player.reassigned);
      if (!candidate) break;
      candidate.position = position;
      candidate.positions = [position, ...candidate.positions].filter((item, index, values) => values.indexOf(item) === index);
      candidate.reassigned = true;
    }
  }
  return assigned;
}

function chooseRoster(candidates, tier, appearances) {
  const rated = candidates.map((player) => ({ ...player, rating: ratingFor(player.name, tier, appearances.get(player.article) ?? 1) }));
  const positioned = assignPositions(rated);
  const chosen = [];
  for (const position of ["GK", "DF", "MF", "FW"]) {
    const player = positioned.filter((candidate) => candidate.position === position)
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))[0];
    if (player && !chosen.includes(player)) chosen.push(player);
  }
  for (const player of positioned.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))) {
    if (chosen.length >= 18) break;
    if (!chosen.includes(player)) chosen.push(player);
  }
  if (chosen.length < 11 || !["GK", "DF", "MF", "FW"].every((position) => chosen.some((player) => player.position === position))) {
    throw new Error(`Incomplete roster: ${chosen.length} players / ${new Set(chosen.map((player) => player.position)).size} positions`);
  }
  return chosen;
}

function createSquad(season, name, tier, candidates, appearances) {
  const squadId = `${season}-${slug(name)}`;
  const roster = chooseRoster(candidates, tier, appearances);
  return {
    id: squadId, name, season, tier, colors: palettes[hash(squadId) % palettes.length],
    players: roster.map((player, index) => ({
      id: `${squadId}-${String(index + 1).padStart(2, "0")}-${slug(player.article)}`,
      characterKey: `${season}-${slug(player.article)}`, name: player.name, team: name, season,
      position: player.position, positions: player.positions, element: elements[hash(`${season}:${player.article}`) % elements.length],
      rating: player.rating, seed: hash(`${season}:${name}:${player.article}`),
    })),
  };
}

function balancedSelectionPool(name, tier, candidates, appearances) {
  const unique = [...new Map(candidates.map((player) => [player.article, player])).values()];
  const ranked = [...unique].sort((first, second) =>
    ratingFor(second.name, tier, appearances.get(second.article) ?? 1)
      - ratingFor(first.name, tier, appearances.get(first.article) ?? 1)
    || first.name.localeCompare(second.name),
  );
  const eliteCount = /All-Stars|Masters|Top 6/i.test(name) ? 7 : 4;
  const selected = ranked.slice(0, eliteCount);
  const rotation = ranked.slice(eliteCount).sort((first, second) =>
    hash(`${name}:${first.article}`) - hash(`${name}:${second.article}`),
  );
  for (const player of rotation) {
    if (selected.length >= 18) break;
    selected.push(player);
  }
  return selected;
}

async function downloadPortraits(records) {
  await mkdir(outputDirectory, { recursive: true });
  let actual = 0;
  const missing = [];
  let cursor = 0;
  const runners = Array.from({ length: 8 }, async () => {
    while (cursor < records.length) {
      const record = records[cursor++];
      const path = join(outputDirectory, `${record.characterKey}.webp`);
      try {
        if (!record.source) throw new Error("No page image");
        const url = new URL(record.source);
        const acceptedHost = url.hostname.endsWith("wikia.nocookie.net") || url.hostname === "captaintsubasastats.robla.es";
        if (url.protocol !== "https:" || !acceptedHost) throw new Error("Rejected image host");
        const response = await fetch(url, { headers: { "User-Agent": "ElevenForceCatalog/2.0 (private non-commercial fan project)" } });
        if (!response.ok) throw new Error(`${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 200 || bytes.length > 8_000_000) throw new Error(`Invalid image size ${bytes.length}`);
        await sharp(bytes).resize(512, 512, { fit: "cover", position: "north" }).webp({ quality: 84 }).toFile(path);
        actual += 1;
      } catch (error) {
        missing.push({ characterKey: record.characterKey, name: record.name, reason: String(error) });
        const initials = record.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        const accent = record.characterKey.startsWith("blue-lock-") ? "#2ed4ff" : "#ff9f1c";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#06162d"/><circle cx="256" cy="205" r="118" fill="#17385b" stroke="${accent}" stroke-width="12"/><path d="M70 512c18-135 88-203 186-203s168 68 186 203" fill="#17385b" stroke="${accent}" stroke-width="12"/><text x="256" y="230" fill="#fff" font-family="sans-serif" font-size="92" font-weight="800" text-anchor="middle">${initials}</text></svg>`;
        await sharp(Buffer.from(svg)).webp({ quality: 84 }).toFile(path);
      }
    }
  });
  await Promise.all(runners);
  return { actual, missing };
}

console.log("Fetching documented team rosters...");
const bluePages = await wikiPages(blueApi, blueTeams.map(([title]) => title), "revisions");
const blueByTitle = new Map(bluePages.map((page) => [page.title, parseBlueRoster(page)]));
for (const [title] of blueTeams) {
  if ((blueByTitle.get(title)?.length ?? 0) < 11) throw new Error(`${title} has fewer than eleven documented members`);
}

const tsubasaPages = await wikiPages(tsubasaApi, tsubasaTeams.map(([title]) => title), "revisions");
const tsubasaByTitle = new Map(tsubasaPages.map((page) => [page.title, parseTsubasaRoster(page)]));
for (const [title] of tsubasaTeams) {
  if ((tsubasaByTitle.get(title)?.length ?? 0) < 11) throw new Error(`${title} has fewer than eleven documented members`);
}

const allBluePlayers = [...new Map([...blueByTitle.values()].flat().map((player) => [player.article, player])).values()];
const bluePlayerPages = await wikiPages(blueApi, allBluePlayers.map((player) => player.article));
const blueDetails = new Map(bluePlayerPages.map((page) => [page.title, { positions: parseBluePosition(page), source: sourceImage(page) }]));
for (const roster of blueByTitle.values()) {
  for (const player of roster) player.sourcePositions = blueDetails.get(player.article)?.positions ?? [];
}

const allTsubasaPlayers = [...new Map([...tsubasaByTitle.values()].flat().map((player) => [player.article, player])).values()];
const tsubasaPlayerPages = await wikiPages(tsubasaApi, allTsubasaPlayers.map((player) => player.article));
const tsubasaDetails = new Map(tsubasaPlayerPages.map((page) => [page.title, { source: sourceImage(page) }]));
console.log("Indexing the secondary Captain Tsubasa portrait database...");
const statsPortraits = await tsubasaStatsPortraits();

const appearances = new Map();
for (const roster of [...blueByTitle.values(), ...tsubasaByTitle.values()]) {
  for (const player of roster) appearances.set(player.article, (appearances.get(player.article) ?? 0) + 1);
}

const squads = blueTeams.map(([title, tier]) => createSquad("blue-lock", title, tier, blueByTitle.get(title), appearances));
for (const [name, tier, sourceNames] of blueSelections) {
  const candidates = [...new Map(sourceNames.flatMap((source) => blueByTitle.get(source) ?? []).map((player) => [player.article, player])).values()];
  squads.push(createSquad("blue-lock", name, tier, balancedSelectionPool(name, tier, candidates, appearances), appearances));
}
for (const [title, tier] of tsubasaTeams) {
  squads.push(createSquad("captain-tsubasa", title, tier, tsubasaByTitle.get(title), appearances));
}

const usedCharacterKeys = new Set(squads.flatMap((squad) => squad.players.map((player) => player.characterKey)));
const characterCandidates = [
  ...allBluePlayers.map((player) => ({
    characterKey: `blue-lock-${slug(player.article)}`, name: player.name, article: player.article,
    source: blueDetails.get(player.article)?.source ?? "", wiki: `https://bluelock.fandom.com/wiki/${encodeURIComponent(player.article.replaceAll(" ", "_"))}`,
  })),
  ...allTsubasaPlayers.map((player) => ({
    characterKey: `captain-tsubasa-${slug(player.article)}`, name: player.name, article: player.article,
    source: tsubasaDetails.get(player.article)?.source
      || statsPortraits.get(normalizedName(player.name))
      || statsPortraits.get(normalizedName(player.article))
      || statsPortraits.get(normalizedName(slug(player.article)))
      || "",
    wiki: `https://captaintsubasa.fandom.com/wiki/${encodeURIComponent(player.article.replaceAll(" ", "_"))}`,
  })),
].filter((record) => usedCharacterKeys.has(record.characterKey));
const characters = [...new Map(characterCandidates.map((record) => [record.characterKey, record])).values()];

console.log(`Downloading and normalizing ${characters.length} character portraits...`);
const portraitResult = await downloadPortraits(characters);
await writeFile("shared/crossover-catalog.json", `${JSON.stringify(squads, null, 2)}\n`);
await writeFile("shared/crossover-portraits.json", `${JSON.stringify({
  sources: [blueApi, tsubasaApi, "https://captaintsubasastats.robla.es/players"], generatedAt: new Date().toISOString(), actualPortraits: portraitResult.actual,
  keys: characters.map((record) => record.characterKey).sort(), missing: portraitResult.missing,
  attribution: characters.map(({ characterKey, name, wiki, source }) => ({ characterKey, name, wiki, source })),
}, null, 2)}\n`);

const cards = squads.reduce((total, squad) => total + squad.players.length, 0);
console.log(`Generated ${squads.length} crossover squads and ${cards} cards.`);
console.log(`Blue Lock: ${squads.filter((squad) => squad.season === "blue-lock").length}; Captain Tsubasa: ${squads.filter((squad) => squad.season === "captain-tsubasa").length}`);
console.log(`Actual portraits: ${portraitResult.actual}/${characters.length}; generated fallbacks: ${portraitResult.missing.length}`);

// Regeneration must never bypass the global talent pyramid.
await import("./rebalance-ratings.mjs");
