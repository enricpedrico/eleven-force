export type SeasonId = "original" | "go" | "ares" | "orion" | "victory" | "blue-lock" | "captain-tsubasa";
export type FranchiseId = "inazuma" | "blue-lock" | "captain-tsubasa";
export type Position = "GK" | "DF" | "MF" | "FW";
export type Element = "Fire" | "Wind" | "Forest" | "Mountain";
export type FormationId =
  | "4-3-3"
  | "4-4-2"
  | "3-5-2"
  | "4-2-3-1"
  | "3-4-3"
  | "5-3-2"
  | "5-2-3"
  | "4-3-1-2"
  | "3-4-2-1"
  | "4-1-4-1";
export type Tactic = "defensive" | "balanced" | "offensive";
export type RoomMode = "final" | "cup";
export type RoomStatus = "lobby" | "draft" | "complete";

export interface PlayerCard {
  id: string;
  characterKey: string;
  name: string;
  team: string;
  season: SeasonId;
  /** Position currently assigned in a line-up; primary position in the catalogue. */
  position: Position;
  /** Every position this version may occupy. Older saved rooms omit this field. */
  positions?: Position[];
  element: Element;
  rating: number;
  seed: number;
}

export interface Squad {
  id: string;
  name: string;
  season: SeasonId;
  tier: number;
  colors: [string, string];
  players: PlayerCard[];
}

export interface DraftRoll {
  season: SeasonId;
  squadId: string;
  rerollsLeft: number;
}

export interface DraftTeam {
  name: string;
  formation: FormationId;
  tactic: Tactic;
  lineup: PlayerCard[];
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "save" | "technique" | "momentum";
  side: "home" | "away";
  playerName?: string;
  text: string;
}

export interface MatchResult {
  id: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  winnerName: string;
  homePower: number;
  awayPower: number;
  events: MatchEvent[];
}

export interface TournamentResult {
  champion: string;
  rounds: MatchResult[][];
  teams?: DraftTeam[];
}

export interface RoomMember {
  id: string;
  name: string;
  isHost: boolean;
  ready: boolean;
  formation: FormationId;
  tactic: Tactic;
  lineup: PlayerCard[];
}

export interface RoomState {
  code: string;
  title: string;
  mode: RoomMode;
  bracketSize: 4 | 8 | 16;
  seasons: SeasonId[];
  showRatings: boolean;
  uniqueCharacters: boolean;
  status: RoomStatus;
  members: RoomMember[];
  currentMemberId?: string;
  roll?: DraftRoll;
  rollHistory?: string[];
  results?: TournamentResult;
  expiresAt: string;
  version: number;
  viewerMemberId?: string;
  csrfToken?: string;
}

export interface SeasonMeta {
  id: SeasonId;
  label: string;
  shortLabel: string;
  years: string;
  color: string;
}

export type RatingOverrides = Record<string, number>;

export interface CardOverride {
  rating?: number;
  position?: Position;
  positions?: Position[];
  enabled?: boolean;
}

export type CardOverrides = Record<string, CardOverride>;

export interface CatalogConfig {
  overrides: CardOverrides;
  portraitCount: number;
  version: string;
}

export interface AdminSession {
  authenticated: boolean;
  csrfToken: string;
}

export interface AdminOverview {
  activeRooms: number;
  activeSessions: number;
  cards: number;
  characters: number;
  squads: number;
  portraits: number;
  ratingOverrides: number;
  cardOverrides: number;
  disabledCards: number;
  databaseBytes: number;
  uptimeSeconds: number;
}

export interface AdminPlayerCard extends PlayerCard {
  baseRating: number;
  basePosition: Position;
  basePositions: Position[];
  enabled: boolean;
  overridden: boolean;
  ratingOverridden: boolean;
  positionOverridden: boolean;
  positionsOverridden: boolean;
  hasPortrait: boolean;
}

export interface AdminPlayerPage {
  items: AdminPlayerCard[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
}

export interface AdminRoomSummary {
  code: string;
  title: string;
  mode: RoomMode;
  status: RoomStatus;
  members: string[];
  expiresAt: string;
  updatedAt: string;
}
