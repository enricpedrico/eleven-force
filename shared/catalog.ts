import rawSquads from "./catalog.json";
import crossoverSquads from "./crossover-catalog.json";
import crossoverPortraitManifest from "./crossover-portraits.json";
import portraitManifest from "./portraits.json";
import portraitVariants from "./portrait-variants.json";
import type { CardOverride, CardOverrides, FormationId, FranchiseId, PlayerCard, Position, RatingOverrides, RoomMember, SeasonId, SeasonMeta, Squad } from "./types";

export const SQUADS = [...rawSquads, ...crossoverSquads] as Squad[];
export const POSITION_IDS: readonly Position[] = ["GK", "DF", "MF", "FW"];

// Roles explicitly played by these characters across the series. The primary
// role still comes from each individual card/team version.
const CURATED_CHARACTER_POSITIONS: Readonly<Record<string, readonly Position[]>> = {
  "byron-love": ["MF", "FW"],
  "darren-lachance": ["GK", "MF"],
  "dave-quagmire": ["GK", "DF", "MF", "FW"],
  "fei-rune": ["FW", "MF"],
  "hector-helio": ["GK", "FW"],
  "jean-pierre-lapin": ["GK", "DF"],
  "mark-evans": ["GK", "DF"],
  "nathan-swift": ["DF", "MF", "FW"],
  "shawn-froste": ["FW", "DF"],
  "sol-daystar": ["FW", "MF"],
  "xavier-foster": ["FW", "MF"],
  "zanark-avalonic": ["FW", "DF"],
};

function normalizePositions(primary: Position, values?: readonly Position[]): Position[] {
  return [primary, ...(values ?? [])].filter((position, index, positions): position is Position =>
    POSITION_IDS.includes(position) && positions.indexOf(position) === index,
  );
}

for (const squad of SQUADS) {
  for (const player of squad.players) {
    player.positions = normalizePositions(player.position, [
      ...(player.positions ?? []),
      ...(CURATED_CHARACTER_POSITIONS[player.characterKey] ?? []),
    ]);
  }
}

export const SEASONS: SeasonMeta[] = [
  { id: "original", label: "Inazuma Eleven Original", shortLabel: "Original", years: "IE 1 · 2 · 3", color: "#ff9f1c" },
  { id: "go", label: "Inazuma Eleven GO", shortLabel: "GO", years: "GO · Chrono Stones · Galaxy", color: "#2ed4ff" },
  { id: "ares", label: "Inazuma Eleven Ares", shortLabel: "Ares", years: "Línea Ares", color: "#ff4f70" },
  { id: "orion", label: "Inazuma Eleven Orion", shortLabel: "Orion", years: "Football Frontier International", color: "#8d7bff" },
  { id: "victory", label: "Inazuma Eleven: Victory Road", shortLabel: "Victory Road", years: "Nueva generación", color: "#9bf22d" },
  { id: "blue-lock", label: "Blue Lock", shortLabel: "Blue Lock", years: "Selecciones · U-20 · Neo Egoist", color: "#19bfff" },
  { id: "captain-tsubasa", label: "Captain Tsubasa", shortLabel: "Captain Tsubasa", years: "Colegios · Mundial juvenil · Olímpicos", color: "#ffcf33" },
];

export function franchiseForSeason(season: SeasonId): FranchiseId {
  if (season === "blue-lock") return "blue-lock";
  if (season === "captain-tsubasa") return "captain-tsubasa";
  return "inazuma";
}

export function seasonsByFranchise(seasons: readonly SeasonId[]): SeasonId[][] {
  const groups = new Map<FranchiseId, SeasonId[]>();
  for (const season of seasons) {
    const franchise = franchiseForSeason(season);
    const group = groups.get(franchise) ?? [];
    if (!group.includes(season)) group.push(season);
    groups.set(franchise, group);
  }
  return [...groups.values()];
}

export interface FormationDefinition {
  label: string;
  positions: PlayerCard["position"][];
  /** Visual lines from attack to goal. */
  lines: PlayerCard["position"][][];
}

export const FORMATIONS: Record<FormationId, FormationDefinition> = {
  "4-3-3": { label: "4 · 3 · 3", positions: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"], lines: [["FW", "FW", "FW"], ["MF", "MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]] },
  "4-4-2": { label: "4 · 4 · 2", positions: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW", "FW"], lines: [["FW", "FW"], ["MF", "MF", "MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]] },
  "3-5-2": { label: "3 · 5 · 2", positions: ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW", "FW"], lines: [["FW", "FW"], ["MF", "MF", "MF"], ["MF", "MF"], ["DF", "DF", "DF"], ["GK"]] },
  "4-2-3-1": { label: "4 · 2 · 3 · 1", positions: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW"], lines: [["FW"], ["MF", "MF", "MF"], ["MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]] },
  "3-4-3": { label: "3 · 4 · 3", positions: ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW", "FW", "FW"], lines: [["FW", "FW", "FW"], ["MF", "MF", "MF", "MF"], ["DF", "DF", "DF"], ["GK"]] },
  "5-3-2": { label: "5 · 3 · 2", positions: ["GK", "DF", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW"], lines: [["FW", "FW"], ["MF", "MF", "MF"], ["DF", "DF", "DF", "DF", "DF"], ["GK"]] },
  "5-2-3": { label: "5 · 2 · 3", positions: ["GK", "DF", "DF", "DF", "DF", "DF", "MF", "MF", "FW", "FW", "FW"], lines: [["FW", "FW", "FW"], ["MF", "MF"], ["DF", "DF", "DF", "DF", "DF"], ["GK"]] },
  "4-3-1-2": { label: "4 · 3 · 1 · 2", positions: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "FW", "FW"], lines: [["FW", "FW"], ["MF"], ["MF", "MF", "MF"], ["DF", "DF", "DF", "DF"], ["GK"]] },
  "3-4-2-1": { label: "3 · 4 · 2 · 1", positions: ["GK", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "MF", "FW"], lines: [["FW"], ["MF", "MF"], ["MF", "MF", "MF", "MF"], ["DF", "DF", "DF"], ["GK"]] },
  "4-1-4-1": { label: "4 · 1 · 4 · 1", positions: ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "MF", "MF", "FW"], lines: [["FW"], ["MF", "MF", "MF", "MF"], ["MF"], ["DF", "DF", "DF", "DF"], ["GK"]] },
};

const squadById = new Map(SQUADS.map((squad) => [squad.id, squad]));
const playerById = new Map(SQUADS.flatMap((squad) => squad.players).map((player) => [player.id, player]));
const baseRatingById = new Map([...playerById].map(([id, player]) => [id, player.rating]));
const basePositionById = new Map([...playerById].map(([id, player]) => [id, player.position]));
const basePositionsById = new Map([...playerById].map(([id, player]) => [id, [...(player.positions ?? [player.position])]]));
const disabledCardIds = new Set<string>();
const portraitKeys = new Set([...portraitManifest.keys, ...crossoverPortraitManifest.keys]);

export function portraitSource(characterKey: string, cardId?: string): string | undefined {
  const variant = cardId ? portraitVariants[cardId as keyof typeof portraitVariants] : undefined;
  if (variant) return `/portraits/${variant.file}.webp`;
  return portraitKeys.has(characterKey) ? `/portraits/${characterKey}.webp` : undefined;
}

export function getSquad(id: string): Squad | undefined {
  const squad = squadById.get(id);
  if (!squad) return undefined;
  const players = squad.players.filter((player) => !disabledCardIds.has(player.id));
  return players.length ? { ...squad, players } : undefined;
}

export function getPlayer(id: string): PlayerCard | undefined {
  return playerById.get(id);
}

export function baseRatingFor(id: string): number | undefined {
  return baseRatingById.get(id);
}

export function basePositionFor(id: string): Position | undefined {
  return basePositionById.get(id);
}

export function basePositionsFor(id: string): Position[] | undefined {
  const positions = basePositionsById.get(id);
  return positions ? [...positions] : undefined;
}

export function positionsFor(player: Pick<PlayerCard, "position" | "positions">): Position[] {
  return normalizePositions(player.position, player.positions);
}

export function applyCatalogOverrides(overrides: CardOverrides): void {
  disabledCardIds.clear();
  for (const [id, player] of playerById) {
    player.rating = baseRatingById.get(id) ?? player.rating;
    player.position = basePositionById.get(id) ?? player.position;
    player.positions = [...(basePositionsById.get(id) ?? [player.position])];
  }
  for (const [id, override] of Object.entries(overrides)) setCardOverride(id, override);
}

export function setCardOverride(id: string, override: CardOverride = {}): boolean {
  const player = playerById.get(id);
  const baseRating = baseRatingById.get(id);
  const basePosition = basePositionById.get(id);
  const basePositions = basePositionsById.get(id);
  if (!player || baseRating === undefined || !basePosition || !basePositions) return false;
  player.rating = Number.isInteger(override.rating) && override.rating! >= 1 && override.rating! <= 99 ? override.rating! : baseRating;
  player.position = override.position && POSITION_IDS.includes(override.position) ? override.position : basePosition;
  player.positions = override.positions
    ? normalizePositions(player.position, override.positions)
    : override.position
      ? [player.position]
      : [...basePositions];
  if (override.enabled === false) disabledCardIds.add(id);
  else disabledCardIds.delete(id);
  return true;
}

export function isCardEnabled(id: string): boolean {
  return playerById.has(id) && !disabledCardIds.has(id);
}

export function applyRatingOverrides(overrides: RatingOverrides): void {
  applyCatalogOverrides(Object.fromEntries(Object.entries(overrides).map(([id, rating]) => [id, { rating }])));
}

export function setRatingOverride(id: string, rating?: number): boolean {
  return setCardOverride(id, rating === undefined ? {} : { rating });
}

export function hasPortrait(characterKey: string): boolean {
  return portraitKeys.has(characterKey);
}

export const PORTRAIT_COUNT = portraitKeys.size;

export function isCharacterUnavailable(
  members: readonly Pick<RoomMember, "id" | "lineup">[],
  memberId: string,
  characterKey: string,
  uniqueCharacters: boolean,
): boolean {
  return members.some((member) =>
    (uniqueCharacters || member.id === memberId)
    && member.lineup.some((player) => player.characterKey === characterKey),
  );
}

export function squadsForSeasons(seasons: readonly SeasonId[]): Squad[] {
  const enabled = new Set(seasons);
  return SQUADS
    .filter((squad) => enabled.has(squad.season))
    .map((squad) => getSquad(squad.id))
    .filter((squad): squad is Squad => Boolean(squad));
}

export function openPositions(formation: FormationId, lineup: readonly PlayerCard[]): PlayerCard["position"][] {
  const needed = [...FORMATIONS[formation].positions];
  for (const player of lineup) {
    const index = needed.indexOf(player.position);
    if (index >= 0) needed.splice(index, 1);
  }
  return needed;
}

export interface PositionChange {
  playerId: string;
  playerName: string;
  from: Position;
  to: Position;
}

export interface DraftPlacementPlan {
  lineup: PlayerCard[];
  picked: PlayerCard;
  changes: PositionChange[];
}

function formationCapacity(formation: FormationId): Record<Position, number> {
  const capacity: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const position of FORMATIONS[formation].positions) capacity[position] += 1;
  return capacity;
}

/** Finds the valid assignment that moves the fewest already drafted players. */
export function planDraftPlacement(
  formation: FormationId,
  lineup: readonly PlayerCard[],
  incoming: PlayerCard,
): DraftPlacementPlan | undefined {
  if (lineup.length >= FORMATIONS[formation].positions.length) return undefined;
  const players = [...lineup, incoming];
  const capacity = formationCapacity(formation);
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  const assignment: Position[] = [];
  let bestAssignment: Position[] | undefined;
  let bestCost = Number.POSITIVE_INFINITY;

  const visit = (index: number, cost: number) => {
    if (cost >= bestCost) return;
    if (index === players.length) {
      bestCost = cost;
      bestAssignment = [...assignment];
      return;
    }
    const player = players[index];
    const isIncoming = index === players.length - 1;
    const compatible = positionsFor(player);
    for (let preference = 0; preference < compatible.length; preference += 1) {
      const position = compatible[preference];
      if (counts[position] >= capacity[position]) continue;
      counts[position] += 1;
      assignment.push(position);
      const moveCost = isIncoming ? preference : position === player.position ? 0 : 100 + preference;
      visit(index + 1, cost + moveCost);
      assignment.pop();
      counts[position] -= 1;
    }
  };
  visit(0, 0);
  if (!bestAssignment) return undefined;

  const assigned = bestAssignment as Position[];
  const nextLineup = players.map((player, index) => ({
    ...player,
    position: assigned[index],
    positions: positionsFor(player),
  }));
  return {
    lineup: nextLineup,
    picked: nextLineup.at(-1)!,
    changes: lineup.flatMap((player, index) => player.position === assigned[index] ? [] : [{
      playerId: player.id,
      playerName: player.name,
      from: player.position,
      to: assigned[index],
    }]),
  };
}

export function reassignLineupPlayer(
  formation: FormationId,
  lineup: readonly PlayerCard[],
  playerId: string,
  position: Position,
): PlayerCard[] | undefined {
  const index = lineup.findIndex((player) => player.id === playerId);
  if (index < 0 || !positionsFor(lineup[index]).includes(position)) return undefined;
  const next = lineup.map((player, playerIndex) => playerIndex === index ? {
    ...player,
    position,
    positions: positionsFor(player),
  } : { ...player, positions: positionsFor(player) });
  const capacity = formationCapacity(formation);
  const counts: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  next.forEach((player) => { counts[player.position] += 1; });
  return POSITION_IDS.every((candidate) => counts[candidate] <= capacity[candidate]) ? next : undefined;
}

export function canDraft(formation: FormationId, lineup: readonly PlayerCard[], player: PlayerCard): boolean {
  return Boolean(planDraftPlacement(formation, lineup, player));
}
