import { readFile, writeFile } from "node:fs/promises";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/generate-catalog.mjs <codex.json>");

const source = JSON.parse(await readFile(sourcePath, "utf8"));

const seasons = {
  original: {
    games: [
      "Inazuma Eleven",
      "Inazuma Eleven 2: Firestorm / Blizzard",
      "Inazuma Eleven 3: Lightning Bolt / Bomb Blast / Team Ogre Attacks!",
    ],
    teams: [
      ["Raimon", 84], ["Royal Academy", 84], ["Zeus", 85], ["Gemini Storm", 82],
      ["Occult", 74], ["Wild", 75], ["Brainwashing", 78], ["Otaku", 73],
      ["Shuriken", 78], ["Farm", 80], ["Kirkwood", 82],
      ["Epsilon", 83], ["Prominence", 84], ["Diamond Dust", 84], ["Chaos", 87],
      ["Genesis", 88], ["Dark Emperors", 85], ["Alpine", 82], ["Cloister Divinity", 79],
      ["Mary Times", 78], ["Secret Service", 77], ["Royal Academy Redux", 84],
      ["Inazuma National", 90], ["Neo National", 84], ["Desert Lions", 82],
      ["Knights of Queen", 85, "Queen's Knights"], ["Fire Dragon", 86],
      ["Orpheus", 86], ["The Empire", 84], ["Unicorn", 85], ["The Kingdom", 88],
      ["Little Gigantes", 90], ["Team Ogre", 90],
    ],
  },
  go: {
    games: [
      "Inazuma Eleven GO: Light / Shadow",
      "Inazuma Eleven GO Chrono Stones: Wildfire / Thunderflash",
      "Inazuma Eleven GO Galaxy: Big Bang / Supernova",
    ],
    teams: [
      ["Raimon First Squad", 85], ["Royal Academy", 83], ["Universal", 84], ["Mount Olympus", 84],
      ["Dragon Link", 87], ["Team Zero", 89], ["Chrono Storm", 91], ["Protocol Omega", 84],
      ["Protocol Omega 2.0", 85], ["Protocol Omega 3.0", 86], ["Perfect Cascade", 87],
      ["Zanark's Domain", 88], ["Zan", 89], ["Gahl", 89], ["Ragnah", 91],
      ["Earth Eleven", 89], ["Fire Dragon", 82], ["Falam Medius", 88], ["Ixar Fleet", 91],
      ["Space Rankers", 86],
    ],
  },
  ares: {
    games: ["Inazuma Eleven Ares"],
    teams: [
      ["Raimon", 84], ["Polestar Academy", 87], ["Lunar Prime Academy", 88],
      ["Rampart Junior High", 80], ["Everytown", 83], ["Royal Academy", 84],
      ["Zeus", 85], ["Alpine", 84], ["Kirkwood", 82], ["Barcelona Orb", 87],
      ["Alia Academy", 86], ["Backwater Island", 81],
    ],
  },
  orion: {
    games: ["Inazuma Eleven Ares", "Inazuma Eleven Orion"],
    teams: [
      ["Inazuma National", 90], ["Pitch Perfectionists", 88], ["Guardians of the Queen", 87],
      ["Raging Bulls", 84], ["Ace Invaders", 86], ["Orion Eclipse", 89],
      ["Fallen Angels", 85], ["Eternal Dancers", 84], ["Arabian Firebirds", 84],
      ["Avenging Acrobats", 85], ["The Sambassadors", 87], ["Star-Spangled Unicorns", 86],
      ["Los Invencibles", 88],
    ],
  },
  victory: {
    games: ["Inazuma Eleven: Victory Road"],
    teams: [
      ["South Cirrus Junior High", 86], ["Northbright", 82], ["West Manor", 83],
      ["Eastwind", 83], ["Stormridge", 84], ["Raimon", 86], ["Royal Academy", 86],
      ["Solaria-Zeus", 87], ["Twinford", 84], ["Orchid Academy", 84],
      ["Crosswind-Fauxshore", 84], ["Noble Insight", 85], ["Lawcrest", 85],
      ["AI Academy", 88], ["Platos", 89], ["Destroyers", 89],
    ],
  },
};

const stars = {
  "Mark Evans": 96,
  "Axel Blaze": 95,
  "Jude Sharp": 94,
  "Shawn Froste": 94,
  "Xavier Foster": 94,
  "Xavier Schiller": 94,
  "Byron Love": 93,
  "Nathan Swift": 90,
  "Kevin Dragonfly": 89,
  "Caleb Stonewall": 91,
  "Paolo Bianchi": 93,
  "Hector Helio": 96,
  "Edgar Partinus": 92,
  "Arion Sherwind": 96,
  "Victor Blade": 95,
  "Riccardo Di Rigo": 94,
  "Jean-Pierre Lapin": 91,
  "Sol Daystar": 93,
  "Bailong": 95,
  "Tezcat": 94,
  "Fei Rune": 95,
  "Goldie Lemmon": 92,
  "Zanark Avalonic": 96,
  "Simeon Ayp": 97,
  "Falco Flashman": 93,
  "Terry Archibald": 91,
  "Ozrock Boldar": 96,
  "Sonny Wright": 92,
  "Elliot Ember": 95,
  "Heath Moore": 94,
  "Basile Hardy": 89,
  "Philip Star": 91,
  "Lucas Star": 92,
  "Briar Bloomhurst": 94,
  "Cedric Freud": 93,
  "Harper Evans": 93,
  "Destin Billows": 95,
};

const colors = [
  ["#1a70d8", "#ffd43b"], ["#e54034", "#f7f3df"], ["#6e43d6", "#7effe1"],
  ["#078c68", "#ffdf54"], ["#ec7a19", "#102e61"], ["#c61f54", "#f4d8ff"],
  ["#0d879f", "#f6ff7a"], ["#202f77", "#ff674d"],
];

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function slug(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const recordsByName = new Map();
for (const player of source.filter((candidate) => candidate.role === "Player")) {
  const records = recordsByName.get(player.name) ?? [];
  records.push(player);
  recordsByName.set(player.name, records);
}

function ratingFor(player, tier) {
  const records = recordsByName.get(player.name) ?? [player];
  const games = new Set(records.map((record) => record.game)).size;
  const teams = new Set(records.flatMap((record) => record.teams)).size;
  const recurring = Math.min(6, Math.max(0, games - 1) + Math.min(3, Math.max(0, teams - 1)));
  const jitter = (hash(player.name) % 5) - 2;
  const calculated = Math.max(64, Math.min(94, tier - 7 + recurring + jitter));
  return Math.max(calculated, stars[player.name] ?? 0);
}

const squads = [];
for (const [season, config] of Object.entries(seasons)) {
  for (const [team, tier, sourceTeam = team] of config.teams) {
    let candidates = source.filter(
      (player) => player.role === "Player" && config.games.includes(player.game) && player.teams.includes(sourceTeam),
    );
    if (candidates.length < 11) {
      candidates = source.filter((player) => player.role === "Player" && player.teams.includes(sourceTeam));
    }

    const unique = Array.from(new Map(candidates.map((player) => [player.name, player])).values())
      .map((player) => ({ player, rating: ratingFor(player, tier) }))
      .sort((first, second) => second.rating - first.rating || first.player.number - second.player.number);
    const chosen = [];
    for (const position of ["GK", "DF", "MF", "FW"]) {
      const candidate = unique.find((entry) => entry.player.position === position && !chosen.includes(entry));
      if (candidate) chosen.push(candidate);
    }
    for (const candidate of unique) {
      if (chosen.length >= 18) break;
      if (!chosen.includes(candidate)) chosen.push(candidate);
    }

    if (chosen.length < 11 || !["GK", "DF", "MF", "FW"].every((position) => chosen.some(({ player }) => player.position === position))) {
      console.warn(`Skipped ${season}/${team}: incomplete roster (${chosen.length})`);
      continue;
    }

    const squadId = `${season}-${slug(team)}`;
    const palette = colors[hash(squadId) % colors.length];
    squads.push({
      id: squadId,
      name: team,
      season,
      tier,
      colors: palette,
      players: chosen.map(({ player, rating }) => ({
        id: `${squadId}-${player.number}`,
        characterKey: slug(player.name),
        name: player.name,
        team,
        season,
        position: player.position,
        element: player.element,
        rating,
        seed: hash(`${player.name}:${season}:${team}`),
      })),
    });
  }
}

await writeFile("shared/catalog.json", JSON.stringify(squads, null, 2));
const cards = squads.reduce((total, squad) => total + squad.players.length, 0);
console.log(`Generated ${squads.length} squads and ${cards} rated cards.`);
console.log(Object.fromEntries(Object.keys(seasons).map((season) => [season, squads.filter((squad) => squad.season === season).length])));

// Keep regenerated source data inside the same audited rating scale.
await import("./rebalance-ratings.mjs");
