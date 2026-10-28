import { z } from "zod";
import { FORMATIONS, SEASONS, getPlayer } from "../shared/catalog";
import type { DraftRoll, DraftTeam, FormationId, PlayerCard, SeasonId, Tactic, TournamentResult } from "../shared/types";

export const SOLO_STORAGE_KEY = "eleven-force-solo-v1";
const position = z.enum(["GK", "DF", "MF", "FW"]);
const formation = z.string().refine((id) => Object.hasOwn(FORMATIONS, id));
const card = z.object({
  id: z.string().max(160).refine((id) => Boolean(getPlayer(id))), characterKey: z.string().max(160),
  name: z.string().max(160), team: z.string().max(160), season: z.string().optional(),
  position, positions: z.array(position).min(1).max(4).optional(), element: z.enum(["Fire", "Wind", "Forest", "Mountain"]),
  rating: z.number().int().min(1).max(99), seed: z.number().int().nonnegative(),
});
const tactic = z.enum(["defensive", "balanced", "offensive"]);
const team = z.object({ name: z.string().max(100), formation, tactic, lineup: z.array(card).length(11) });
const event = z.object({ minute: z.number().min(0).max(150), type: z.enum(["goal", "save", "technique", "momentum"]), side: z.enum(["home", "away"]), playerName: z.string().max(160).optional(), text: z.string().max(1000) });
const match = z.object({ id: z.string().max(160), homeName: z.string().max(100), awayName: z.string().max(100), homeScore: z.number().int().min(0).max(100), awayScore: z.number().int().min(0).max(100), winnerName: z.string().max(100), homePower: z.number().finite(), awayPower: z.number().finite(), events: z.array(event).max(100) });
const schema = z.object({
  version: z.literal(1), phase: z.enum(["draft", "result"]), seed: z.string().min(1).max(100),
  seasons: z.array(z.string().refine((id) => SEASONS.some((s) => s.id === id))).min(1).max(7),
  formation, tactic, showRatings: z.boolean(), uniqueCharacters: z.boolean(),
  lineup: z.array(card).max(11), turn: z.number().int().min(0).max(11),
  roll: z.object({ season: z.string(), squadId: z.string().max(160), rerollsLeft: z.number().int().min(0).max(2) }).optional(),
  rollHistory: z.array(z.string().max(160)).max(3),
  opponent: team.optional(), results: z.object({ champion: z.string().max(100), rounds: z.array(z.array(match).min(1).max(8)).min(1).max(4), teams: z.array(team).max(16).optional() }).optional(),
}).refine((save) => save.turn === save.lineup.length && new Set(save.lineup.map((p) => p.characterKey)).size === save.lineup.length)
  .refine((save) => !save.roll || (save.seasons.includes(save.roll.season) && save.roll.squadId.startsWith(`${save.roll.season}-`)))
  .refine((save) => save.phase === "result" ? save.lineup.length === 11 && Boolean(save.results && save.opponent) : save.lineup.length < 11)
  .refine((save) => (["GK", "DF", "MF", "FW"] as const).every((p) => save.lineup.filter((c) => c.position === p).length <= FORMATIONS[save.formation as FormationId].positions.filter((slot) => slot === p).length));

export interface SoloSnapshot {
  version: 1; phase: "draft" | "result"; seed: string; seasons: SeasonId[]; formation: FormationId;
  tactic: Tactic; showRatings: boolean; uniqueCharacters: boolean; lineup: PlayerCard[]; turn: number;
  roll?: DraftRoll; rollHistory: string[]; opponent?: DraftTeam; results?: TournamentResult;
}

export function parseSoloSession(raw: string | null): SoloSnapshot | undefined {
  if (!raw || raw.length > 1_000_000) return undefined;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data as SoloSnapshot : undefined;
  } catch { return undefined; }
}

export function readSoloSession(): SoloSnapshot | undefined {
  try { return parseSoloSession(localStorage.getItem(SOLO_STORAGE_KEY)); } catch { return undefined; }
}
