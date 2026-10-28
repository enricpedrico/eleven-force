import { FORMATIONS, positionsFor, seasonsByFranchise, squadsForSeasons } from "./catalog";
import type {
  DraftRoll,
  DraftTeam,
  FormationId,
  MatchEvent,
  MatchResult,
  PlayerCard,
  SeasonId,
  Tactic,
  TournamentResult,
} from "./types";

export class Random {
  private state: number;

  constructor(seed: string | number) {
    const value = String(seed);
    let hash = 2166136261;
    for (const character of value) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    this.state = hash >>> 0 || 1;
  }

  next(): number {
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  int(minimum: number, maximum: number): number {
    return Math.floor(this.next() * (maximum - minimum + 1)) + minimum;
  }

  pick<T>(values: readonly T[]): T {
    if (!values.length) throw new Error("Cannot pick from an empty collection");
    return values[this.int(0, values.length - 1)];
  }

  shuffle<T>(values: readonly T[]): T[] {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = this.int(0, index);
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }
}

/** Gives every selected franchise the same chance, then balances its eras. */
export function pickBalancedSeason(seasons: readonly SeasonId[], rng: Random): SeasonId {
  const franchises = seasonsByFranchise(seasons);
  if (!franchises.length) throw new Error("At least one season is required");
  return rng.pick(rng.pick(franchises));
}

export function createRoll(
  seasons: readonly SeasonId[],
  seed: string,
  fixedSeason?: SeasonId,
  excludedSquadIds: readonly string[] = [],
  rerollsLeft = 2,
): DraftRoll {
  if (!seasons.length) throw new Error("At least one season is required");
  const rng = new Random(seed);
  const season = fixedSeason ?? pickBalancedSeason(seasons, rng);
  const excluded = new Set(excludedSquadIds);
  const candidates = squadsForSeasons([season]).filter((squad) => !excluded.has(squad.id));
  const fallback = squadsForSeasons([season]);
  return { season, squadId: rng.pick(candidates.length ? candidates : fallback).id, rerollsLeft };
}

export function validateLineup(formation: FormationId, lineup: readonly PlayerCard[]): boolean {
  if (lineup.length !== 11 || new Set(lineup.map((player) => player.characterKey)).size !== 11) return false;
  const expected = FORMATIONS[formation].positions.reduce<Record<string, number>>((counts, position) => {
    counts[position] = (counts[position] ?? 0) + 1;
    return counts;
  }, {});
  const actual = lineup.reduce<Record<string, number>>((counts, player) => {
    counts[player.position] = (counts[player.position] ?? 0) + 1;
    return counts;
  }, {});
  return Object.entries(expected).every(([position, count]) => actual[position] === count);
}

function average(players: readonly PlayerCard[]): number {
  return players.reduce((total, player) => total + player.rating, 0) / Math.max(1, players.length);
}

export function teamRatingAverages(team: DraftTeam) {
  const roundedAverage = (players: readonly PlayerCard[]) => Math.round(average(players) * 10) / 10;
  const byPosition = (position: PlayerCard["position"]) => team.lineup.filter((player) => player.position === position);
  return {
    goalkeeper: roundedAverage(byPosition("GK")),
    defence: roundedAverage(byPosition("DF")),
    midfield: roundedAverage(byPosition("MF")),
    attack: roundedAverage(byPosition("FW")),
    overall: roundedAverage(team.lineup),
  };
}

export function teamMetrics(team: DraftTeam) {
  const byPosition = (position: PlayerCard["position"]) => team.lineup.filter((player) => player.position === position);
  const goalkeeper = average(byPosition("GK"));
  const defence = average(byPosition("DF"));
  const midfield = average(byPosition("MF"));
  const attack = average(byPosition("FW"));
  const sameTeamGroups = new Map<string, number>();
  team.lineup.forEach((player) => sameTeamGroups.set(player.team, (sameTeamGroups.get(player.team) ?? 0) + 1));
  const links = [...sameTeamGroups.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
  const elementVariety = new Set(team.lineup.map((player) => player.element)).size;
  const chemistry = Math.min(10, links * 0.75 + elementVariety * 0.8);
  const tacticAttack = team.tactic === "offensive" ? 3 : team.tactic === "defensive" ? -2 : 0;
  const tacticDefence = team.tactic === "defensive" ? 3 : team.tactic === "offensive" ? -2 : 0;
  const attackPower = attack * 0.58 + midfield * 0.32 + chemistry + tacticAttack;
  const defencePower = goalkeeper * 0.34 + defence * 0.46 + midfield * 0.12 + chemistry + tacticDefence;
  const overall = attackPower * 0.42 + defencePower * 0.42 + midfield * 0.16;
  return {
    overall: Math.round(overall),
    attack: Math.round(attackPower),
    defence: Math.round(defencePower),
    midfield: Math.round(midfield),
    chemistry: Math.round(chemistry),
  };
}

function poisson(lambda: number, rng: Random): number {
  const threshold = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  do {
    count += 1;
    product *= rng.next();
  } while (product > threshold && count < 9);
  return count - 1;
}

function scorer(team: DraftTeam, rng: Random): PlayerCard {
  const weighted = team.lineup.flatMap((player) =>
    Array.from({ length: player.position === "FW" ? 5 : player.position === "MF" ? 3 : 1 }, () => player),
  );
  return rng.pick(weighted);
}

function eventText(type: MatchEvent["type"], player: PlayerCard | undefined, sideName: string): string {
  if (type === "goal") return `${player?.name ?? sideName} rompe la defensa con una supertécnica y marca.`;
  if (type === "save") return `${player?.name ?? sideName} detiene un disparo imposible y cambia el ritmo.`;
  if (type === "technique") return `${player?.name ?? sideName} activa una jugada especial que sacude el campo.`;
  return `${player?.name ?? sideName} enlaza pases y recupera el control del partido.`;
}

export function simulateMatch(home: DraftTeam, away: DraftTeam, seed: string): MatchResult {
  if (!validateLineup(home.formation, home.lineup) || !validateLineup(away.formation, away.lineup)) {
    throw new Error("Both teams need a valid eleven");
  }
  const rng = new Random(seed);
  const homeMetrics = teamMetrics(home);
  const awayMetrics = teamMetrics(away);
  const homeExpected = Math.max(0.35, Math.min(4.3, 1.35 + (homeMetrics.attack - awayMetrics.defence) / 15 + 0.15));
  const awayExpected = Math.max(0.35, Math.min(4.3, 1.35 + (awayMetrics.attack - homeMetrics.defence) / 15));
  let homeScore = poisson(homeExpected, rng);
  let awayScore = poisson(awayExpected, rng);
  const events: MatchEvent[] = [];

  for (let index = 0; index < homeScore; index += 1) {
    const player = scorer(home, rng);
    events.push({ minute: rng.int(5, 89), type: "goal", side: "home", playerName: player.name, text: eventText("goal", player, home.name) });
  }
  for (let index = 0; index < awayScore; index += 1) {
    const player = scorer(away, rng);
    events.push({ minute: rng.int(5, 89), type: "goal", side: "away", playerName: player.name, text: eventText("goal", player, away.name) });
  }
  for (const side of ["home", "away"] as const) {
    const team = side === "home" ? home : away;
    const goalkeeper = team.lineup.find((player) => player.position === "GK");
    events.push({ minute: rng.int(12, 78), type: "save", side, playerName: goalkeeper?.name, text: eventText("save", goalkeeper, team.name) });
    const specialist = rng.pick(team.lineup);
    events.push({ minute: rng.int(8, 82), type: "technique", side, playerName: specialist.name, text: eventText("technique", specialist, team.name) });
    const creators = team.lineup.filter((player) => player.position === "MF" || player.position === "FW");
    for (let index = 0; index < 2; index += 1) {
      const conductor = rng.pick(creators.length ? creators : team.lineup);
      events.push({ minute: rng.int(index === 0 ? 3 : 48, index === 0 ? 44 : 88), type: "momentum", side, playerName: conductor.name, text: eventText("momentum", conductor, team.name) });
    }
  }

  if (homeScore === awayScore) {
    const homeChance = homeMetrics.overall / (homeMetrics.overall + awayMetrics.overall);
    const winner = rng.next() < homeChance ? "home" : "away";
    const team = winner === "home" ? home : away;
    const player = scorer(team, rng);
    if (winner === "home") homeScore += 1;
    else awayScore += 1;
    events.push({ minute: rng.int(103, 119), type: "goal", side: winner, playerName: player.name, text: `${player.name} decide la prórroga con una técnica definitiva.` });
  }

  events.sort((first, second) => first.minute - second.minute);
  return {
    id: `${seed}:${home.name}:${away.name}`,
    homeName: home.name,
    awayName: away.name,
    homeScore,
    awayScore,
    winnerName: homeScore > awayScore ? home.name : away.name,
    homePower: homeMetrics.overall,
    awayPower: awayMetrics.overall,
    events,
  };
}

export function createCpuTeam(
  name: string,
  seasons: readonly SeasonId[],
  formation: FormationId,
  tactic: Tactic,
  seed: string,
  unavailable: ReadonlySet<string> = new Set(),
): DraftTeam {
  const rng = new Random(seed);
  const pool = squadsForSeasons(seasons).flatMap((squad) => squad.players);
  const lineup = [];
  const used = new Set(unavailable);
  for (const position of FORMATIONS[formation].positions) {
    const candidates = pool.filter((player) => positionsFor(player).includes(position) && !used.has(player.characterKey));
    const shortlist = rng.shuffle(candidates).sort((first, second) => second.rating - first.rating).slice(0, Math.max(5, Math.floor(candidates.length * 0.18)));
    const player = rng.pick(shortlist);
    lineup.push({ ...player, position, positions: positionsFor(player) });
    used.add(player.characterKey);
  }
  return { name, formation, tactic, lineup };
}

export function simulateTournament(teams: readonly DraftTeam[], seed: string): TournamentResult {
  if (![2, 4, 8, 16].includes(teams.length)) throw new Error("Tournament size must be 2, 4, 8 or 16");
  const rng = new Random(seed);
  let active = rng.shuffle(teams);
  const rounds: MatchResult[][] = [];
  let round = 0;
  while (active.length > 1) {
    const matches = [];
    const winners = [];
    for (let index = 0; index < active.length; index += 2) {
      const result = simulateMatch(active[index], active[index + 1], `${seed}:r${round}:m${index / 2}`);
      matches.push(result);
      winners.push(result.winnerName === active[index].name ? active[index] : active[index + 1]);
    }
    rounds.push(matches);
    active = winners;
    round += 1;
  }
  return {
    champion: active[0].name,
    rounds,
    teams: teams.map((team) => ({ ...team, lineup: [...team.lineup] })),
  };
}
