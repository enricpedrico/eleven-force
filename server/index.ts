import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  FORMATIONS,
  PORTRAIT_COUNT,
  SEASONS,
  SQUADS,
  applyCatalogOverrides,
  baseRatingFor,
  basePositionFor,
  basePositionsFor,
  canDraft,
  getPlayer,
  getSquad,
  hasPortrait,
  isCardEnabled,
  isCharacterUnavailable,
  openPositions,
  planDraftPlacement,
  positionsFor,
  reassignLineupPlayer,
  setCardOverride,
  squadsForSeasons,
} from "../shared/catalog";
import { Random, createCpuTeam, pickBalancedSeason, simulateTournament } from "../shared/game";
import type { AdminPlayerCard, CardOverride, CardOverrides, DraftRoll, DraftTeam, FormationId, Position, RoomMember, RoomState, SeasonId, Tactic } from "../shared/types";
import { RoomStore, verifyPassword } from "./store";

const port = Number(process.env.PORT ?? 3010);
const databasePath = process.env.DATABASE_PATH ?? join(process.cwd(), "data", "eleven-force.sqlite");
const production = process.env.NODE_ENV === "production";
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? "";
const adminEnabled = /^[a-f0-9]{32}:[a-f0-9]{64}$/i.test(adminPasswordHash);
const app = express();
const store = new RoomStore(databasePath);
applyCatalogOverrides(store.cardOverrides());
const streams = new Map<string, Set<Response>>();
const memberStreams = new Map<string, number>();
let streamCount = 0;
const MAX_STREAMS = 256;
const MAX_MEMBER_STREAMS = 4;
const MAX_ACTIVE_ROOMS = 500;
const allCards = SQUADS.flatMap((squad) => squad.players);
const seasonIds = SEASONS.map((season) => season.id) as [SeasonId, ...SeasonId[]];
const formationIds = Object.keys(FORMATIONS) as [FormationId, ...FormationId[]];
const tacticIds = ["defensive", "balanced", "offensive"] as const;
const positionIds = ["GK", "DF", "MF", "FW"] as const;

if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY));
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: production ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "no-referrer" },
}));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api", (_request, response, next) => {
  // API responses can contain room data and CSRF tokens.
  response.set("Cache-Control", "no-store");
  next();
});
app.use("/api", rateLimit({
  windowMs: 15 * 60_000,
  limit: 1_500,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  // Health checks must never mark a healthy upstream down, and SSE stays open
  // instead of representing repeated API work.
  skip: (request) => request.path === "/health" || request.path.endsWith("/events"),
}));

app.use((request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next();
  const origin = request.get("origin");
  if (!origin) return next();
  try {
    if (new URL(origin).host !== request.get("host")) return response.status(403).json({ error: "Origen no permitido." });
  } catch {
    return response.status(403).json({ error: "Origen no permitido." });
  }
  return next();
});

const memberSchema = z.object({
  name: z.string().trim().min(1).max(20).regex(/^[\p{L}\p{N} ._'-]+$/u),
  formation: z.enum(formationIds),
  tactic: z.enum(tacticIds),
});
const roomSchema = memberSchema.extend({
  title: z.string().trim().min(1).max(32),
  mode: z.enum(["final", "cup"]),
  bracketSize: z.union([z.literal(4), z.literal(8), z.literal(16)]),
  seasons: z.array(z.enum(seasonIds)).min(1).max(SEASONS.length),
  showRatings: z.boolean(),
  uniqueCharacters: z.boolean().optional().default(true),
  password: z.string().max(64).optional().default(""),
});
const joinSchema = memberSchema.extend({ password: z.string().max(64).optional().default("") });
const profileSchema = z.object({
  formation: z.enum(formationIds).optional(),
  tactic: z.enum(tacticIds).optional(),
  ready: z.boolean().optional(),
});
const adminLoginSchema = z.object({ password: z.string().min(1).max(128) });
const ratingSchema = z.object({ rating: z.number().int().min(1).max(99) });
const ratingImportSchema = z.object({ ratings: z.record(z.string().min(1).max(160), z.number().int().min(1).max(99)) });
const batchRatingSchema = ratingImportSchema.refine((value) => {
  const count = Object.keys(value.ratings).length;
  return count >= 1 && count <= 100;
});
const cardUpdateSchema = z.object({
  rating: z.number().int().min(1).max(99),
  position: z.enum(positionIds),
  positions: z.array(z.enum(positionIds)).min(1).max(4).refine((values) => new Set(values).size === values.length),
  enabled: z.boolean(),
}).refine((value) => value.positions.includes(value.position));
const cardOverrideSchema = z.object({
  rating: z.number().int().min(1).max(99).optional(),
  position: z.enum(positionIds).optional(),
  positions: z.array(z.enum(positionIds)).min(1).max(4).refine((values) => new Set(values).size === values.length).optional(),
  enabled: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0)
  .refine((value) => !value.position || !value.positions || value.positions.includes(value.position));
const cardImportSchema = z.object({ overrides: z.record(z.string().min(1).max(160), cardOverrideSchema) });

app.use("/api/admin", (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

function code(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const rng = new Random(randomUUID());
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = Array.from({ length: 6 }, () => rng.pick([...alphabet])).join("");
    if (!store.roomExists(value)) return value;
  }
  throw new Error("Could not allocate room code");
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie("ef_session", token, {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    maxAge: 6 * 60 * 60_000,
    path: "/",
  });
}

function setAdminSessionCookie(response: Response, token: string): void {
  response.cookie("ef_admin", token, {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    maxAge: 8 * 60 * 60_000,
    path: "/",
  });
}

function clearAdminSessionCookie(response: Response): void {
  response.clearCookie("ef_admin", { httpOnly: true, secure: production, sameSite: "strict", path: "/" });
}

function sessionFor(request: Request, roomCode?: string) {
  const session = store.loadSession(request.cookies.ef_session);
  return session && (!roomCode || session.roomCode === roomCode) ? session : undefined;
}

function adminSessionFor(request: Request) {
  return store.loadAdminSession(request.cookies.ef_admin);
}

function requireAdmin(request: Request, response: Response) {
  const session = adminSessionFor(request);
  if (!session) response.status(401).json({ error: "La sesión de administración ha caducado." });
  return session;
}

function requireAdminMutation(request: Request, response: Response) {
  const session = requireAdmin(request, response);
  if (!session) return undefined;
  if (request.get("x-csrf-token") !== session.csrfToken) {
    response.status(403).json({ error: "Token de seguridad no válido. Recarga el panel." });
    return undefined;
  }
  return session;
}

function refreshRoomRatings(state: RoomState): void {
  for (const member of state.members) {
    member.lineup = member.lineup.map((card) => {
      const current = getPlayer(card.id);
      return current ? {
        ...card,
        rating: current.rating,
        positions: [...new Set([card.position, ...positionsFor(current)])],
      } : card;
    });
  }
}

function rollHasOptions(state: RoomState, member: RoomMember): boolean {
  if (!state.roll) return false;
  const squad = getSquad(state.roll.squadId);
  if (!squad) return false;
  const used = new Set((state.uniqueCharacters ?? true)
    ? state.members.flatMap((candidate) => candidate.lineup.map((player) => player.characterKey))
    : member.lineup.map((player) => player.characterKey));
  return squad.players.some((player) => canDraft(member.formation, member.lineup, player) && !used.has(player.characterKey));
}

function roomView(state: RoomState, request: Request): RoomState {
  const session = sessionFor(request, state.code);
  const current = structuredClone(state);
  refreshRoomRatings(current);
  const active = current.members.find((member) => member.id === current.currentMemberId);
  if (current.roll && active && !rollHasOptions(current, active)) {
    current.roll = undefined;
    current.rollHistory = [];
  }
  return {
    ...current,
    uniqueCharacters: current.uniqueCharacters ?? true,
    rollHistory: undefined,
    viewerMemberId: session?.memberId,
    csrfToken: session?.csrfToken,
  };
}

function mutationSession(request: Request, response: Response, roomCode: string) {
  const session = sessionFor(request, roomCode);
  if (!session) {
    response.status(401).json({ error: "Vuelve a entrar en la sala." });
    return undefined;
  }
  if (request.get("x-csrf-token") !== session.csrfToken) {
    response.status(403).json({ error: "La sesión ha cambiado. Recarga la página." });
    return undefined;
  }
  return session;
}

function mutateRoom(codeValue: string, update: (state: RoomState) => void): RoomState {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = store.loadRoom(codeValue);
    if (!current) throw new Error("ROOM_NOT_FOUND");
    current.uniqueCharacters ??= true;
    refreshRoomRatings(current);
    const next = structuredClone(current);
    update(next);
    next.version = current.version + 1;
    if (store.saveRoom(next, current.version)) return next;
  }
  throw new Error("ROOM_CONFLICT");
}

function notify(codeValue: string): void {
  for (const response of streams.get(codeValue) ?? []) {
    response.write(`event: room\ndata: ${JSON.stringify({ code: codeValue, at: Date.now() })}\n\n`);
  }
}

function notifyAllRooms(): void {
  for (const codeValue of streams.keys()) notify(codeValue);
}

function normalizeCardOverride(cardId: string, values: CardOverride): CardOverride | undefined {
  const baseRating = baseRatingFor(cardId);
  const basePosition = basePositionFor(cardId);
  const basePositions = basePositionsFor(cardId);
  if (baseRating === undefined || !basePosition || !basePositions) return undefined;
  const override: CardOverride = {};
  if (values.rating !== undefined && values.rating !== baseRating) override.rating = values.rating;
  if (values.position !== undefined && values.position !== basePosition) override.position = values.position;
  if (values.positions !== undefined) {
    const primary = values.position ?? basePosition;
    const normalized = [primary, ...values.positions].filter((position, index, positions) => positions.indexOf(position) === index);
    if (!normalized.includes(primary)) return undefined;
    if (normalized.length !== basePositions.length || normalized.some((position, index) => position !== basePositions[index])) {
      override.positions = normalized;
    }
  }
  if (values.enabled === false) override.enabled = false;
  return override;
}

function persistCardOverride(cardId: string, override: CardOverride): void {
  store.setCardOverride(cardId, override);
  setCardOverride(cardId, override);
  notifyAllRooms();
}

function persistCardOverrides(overrides: CardOverrides): void {
  store.setCardOverrides(overrides);
  for (const [cardId, override] of Object.entries(overrides)) setCardOverride(cardId, override);
  notifyAllRooms();
}

function availableSquads(state: RoomState, member: RoomMember, season: SeasonId) {
  const used = new Set((state.uniqueCharacters ?? true)
    ? state.members.flatMap((candidate) => candidate.lineup.map((player) => player.characterKey))
    : member.lineup.map((player) => player.characterKey));
  return squadsForSeasons([season]).filter((squad) =>
    squad.players.some((player) => canDraft(member.formation, member.lineup, player) && !used.has(player.characterKey)),
  );
}

function newRoll(state: RoomState, member: RoomMember, fixedSeason?: SeasonId, rerollsLeft = 2): DraftRoll {
  const rng = new Random(`${state.code}:${state.version}:${member.id}:${state.rollHistory?.length ?? 0}:${randomUUID()}`);
  const viableSeasons = fixedSeason
    ? [fixedSeason]
    : state.seasons.filter((season) => availableSquads(state, member, season).length > 0);
  if (!viableSeasons.length) throw new Error("NO_OPTIONS");
  const season = pickBalancedSeason(viableSeasons, rng);
  const excluded = new Set(state.rollHistory ?? []);
  const all = availableSquads(state, member, season);
  const fresh = all.filter((squad) => !excluded.has(squad.id));
  const squad = rng.pick(fresh.length ? fresh : all);
  state.rollHistory = [...(state.rollHistory ?? []), squad.id];
  return { season, squadId: squad.id, rerollsLeft };
}

function nextMember(state: RoomState, currentId: string): RoomMember | undefined {
  const currentIndex = state.members.findIndex((member) => member.id === currentId);
  for (let offset = 1; offset <= state.members.length; offset += 1) {
    const member = state.members[(currentIndex + offset) % state.members.length];
    if (member.lineup.length < 11) return member;
  }
  return undefined;
}

function completeCompetition(state: RoomState): void {
  const humanTeams: DraftTeam[] = state.members.map((member) => ({
    name: member.name,
    formation: member.formation,
    tactic: member.tactic,
    lineup: member.lineup,
  }));
  const targetSize = state.mode === "final" ? 2 : state.bracketSize;
  const teams = [...humanTeams];
  const used = new Set((state.uniqueCharacters ?? true) ? teams.flatMap((team) => team.lineup.map((player) => player.characterKey)) : []);
  const cpuNames = ["cpu.lightningInstitute", "cpu.galeAcademy", "cpu.meteorEleven", "cpu.stormCommand", "cpu.auroraClub", "cpu.lightningSelection", "cpu.prismSquad", "cpu.skyGuardians", "cpu.galacticNexus", "cpu.typhoonForce", "cpu.eclipseInstitute", "cpu.thunderEleven", "cpu.phoenixAcademy", "cpu.imperialRay"];
  const formations = Object.keys(FORMATIONS) as FormationId[];
  const tactics: Tactic[] = ["defensive", "balanced", "offensive"];
  while (teams.length < targetSize) {
    const index = teams.length - humanTeams.length;
    const cpu = createCpuTeam(
      cpuNames[index] ?? `CPU ${index + 1}`,
      state.seasons,
      formations[index % formations.length],
      tactics[index % tactics.length],
      `${state.code}:cpu:${index}`,
      (state.uniqueCharacters ?? true) ? used : new Set(),
    );
    if (state.uniqueCharacters ?? true) cpu.lineup.forEach((player) => used.add(player.characterKey));
    teams.push(cpu);
  }
  state.results = simulateTournament(teams, `${state.code}:competition:${state.version}`);
  state.status = "complete";
  state.currentMemberId = undefined;
  state.roll = undefined;
  state.rollHistory = undefined;
}

const publicRoomErrors = new Set([
  "Confirma el cambio de posición antes de fichar.",
  "El draft ya ha empezado.",
  "Esa carta no pertenece a la plantilla actual.",
  "Esa posición ya está completa.",
  "Ese nombre ya está dentro de la sala.",
  "La configuración ya está bloqueada.",
  "La copa necesita al menos dos participantes preparados.",
  "La final necesita exactamente dos participantes preparados.",
  "La sala está completa.",
  "Marca tu equipo como preparado.",
  "Miembro no encontrado.",
  "No es tu turno.",
  "No hay una plaza libre para ese cambio de posición.",
  "Otro participante ya eligió a ese personaje.",
  "Primero debes sortear una plantilla.",
  "Solo el anfitrión puede iniciar la partida.",
  "Ya has usado los dos rerolls de este turno.",
  "Ya tienes una plantilla sobre la mesa."
]);

function handleError(response: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "UNKNOWN";
  const status = message === "ROOM_NOT_FOUND" ? 404 : message === "ROOM_CONFLICT" ? 409 : message === "NO_OPTIONS" ? 422 : publicRoomErrors.has(message) ? 400 : 500;
  const translated = message === "ROOM_NOT_FOUND"
    ? "La sala no existe o ha caducado."
    : message === "ROOM_CONFLICT"
      ? "La sala cambió al mismo tiempo. Inténtalo de nuevo."
      : message === "NO_OPTIONS"
        ? "No quedan cartas válidas para completar esa formación."
        : publicRoomErrors.has(message) ? message : "Error interno del servidor.";
  response.status(status).json({ error: translated });
}

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", activeRooms: store.activeRoomCount(), squads: SQUADS.length });
});

app.get("/api/meta", (_request, response) => {
  response.json({ squads: SQUADS.length, cards: SQUADS.reduce((total, squad) => total + squad.players.length, 0), seasons: SEASONS });
});

app.get("/api/catalog-config", (_request, response) => {
  const overrides = store.cardOverrides();
  const version = createHash("sha256").update(JSON.stringify(overrides)).digest("hex").slice(0, 12);
  response.set("Cache-Control", "no-store").json({ overrides, portraitCount: PORTRAIT_COUNT, version });
});

app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false }), (request, response) => {
  if (!adminEnabled) return response.status(503).json({ error: "El panel todavía no tiene una contraseña configurada." });
  const parsed = adminLoginSchema.safeParse(request.body);
  if (!parsed.success || !verifyPassword(parsed.data.password, adminPasswordHash)) {
    return response.status(401).json({ error: "Contraseña incorrecta." });
  }
  store.deleteAdminSession(request.cookies.ef_admin);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
  const session = store.createAdminSession(expiresAt);
  setAdminSessionCookie(response, session.token);
  return response.json({ authenticated: true, csrfToken: session.csrfToken });
});

app.get("/api/admin/session", (request, response) => {
  const session = requireAdmin(request, response);
  if (!session) return;
  return response.json({ authenticated: true, csrfToken: session.csrfToken });
});

app.post("/api/admin/logout", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  store.deleteAdminSession(request.cookies.ef_admin);
  clearAdminSessionCookie(response);
  return response.json({ ok: true });
});

app.get("/api/admin/overview", (request, response) => {
  if (!requireAdmin(request, response)) return;
  return response.json({
    activeRooms: store.activeRoomCount(),
    activeSessions: store.activeSessionCount(),
    cards: allCards.length,
    characters: new Set(allCards.map((card) => card.characterKey)).size,
    squads: SQUADS.length,
    portraits: PORTRAIT_COUNT,
    ratingOverrides: store.ratingOverrideCount(),
    cardOverrides: store.cardOverrideCount(),
    disabledCards: store.disabledCardCount(),
    databaseBytes: store.databaseBytes(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

app.get("/api/admin/players", (request, response) => {
  if (!requireAdmin(request, response)) return;
  const query = String(request.query.query ?? "").trim().toLocaleLowerCase("es");
  const season = String(request.query.season ?? "");
  const teamKey = String(request.query.team ?? "");
  const [teamSeason, ...teamParts] = teamKey.split("|");
  const team = teamParts.join("|");
  const position = String(request.query.position ?? "");
  const availability = String(request.query.availability ?? "");
  const page = Math.max(1, Number.parseInt(String(request.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(String(request.query.pageSize ?? "40"), 10) || 40));
  const overrides = store.cardOverrides();
  const filtered = allCards
    .filter((card) => !season || card.season === season)
    .filter((card) => !team || (card.season === teamSeason && card.team === team))
    .filter((card) => !position || positionsFor(card).includes(position as Position))
    .filter((card) => availability !== "enabled" || isCardEnabled(card.id))
    .filter((card) => availability !== "disabled" || !isCardEnabled(card.id))
    .filter((card) => !query || `${card.name} ${card.team}`.toLocaleLowerCase("es").includes(query))
    .sort((first, second) => seasonIds.indexOf(first.season) - seasonIds.indexOf(second.season)
      || first.team.localeCompare(second.team, "es")
      || first.position.localeCompare(second.position, "es")
      || first.name.localeCompare(second.name, "es"));
  const start = (page - 1) * pageSize;
  const items: AdminPlayerCard[] = filtered.slice(start, start + pageSize).map((card) => ({
    ...card,
    baseRating: baseRatingFor(card.id) ?? card.rating,
    basePosition: basePositionFor(card.id) ?? card.position,
    basePositions: basePositionsFor(card.id) ?? [card.position],
    enabled: isCardEnabled(card.id),
    overridden: Object.hasOwn(overrides, card.id),
    ratingOverridden: overrides[card.id]?.rating !== undefined,
    positionOverridden: overrides[card.id]?.position !== undefined,
    positionsOverridden: overrides[card.id]?.positions !== undefined,
    hasPortrait: hasPortrait(card.characterKey),
  }));
  return response.json({ items, page, pageSize, total: filtered.length, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) });
});

app.put("/api/admin/players/ratings", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const parsed = batchRatingSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Lote de puntuaciones no válido." });
  const currentOverrides = store.cardOverrides();
  const overrides: CardOverrides = {};
  for (const [cardId, rating] of Object.entries(parsed.data.ratings)) {
    if (!getPlayer(cardId)) return response.status(400).json({ error: "Una de las cartas no existe." });
    const override = normalizeCardOverride(cardId, { ...(currentOverrides[cardId] ?? {}), rating });
    if (!override) return response.status(400).json({ error: "Una de las puntuaciones no es válida." });
    overrides[cardId] = override;
  }
  persistCardOverrides(overrides);
  return response.json({ updated: Object.keys(overrides).length, overrides });
});

app.put("/api/admin/players/:id", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const cardId = String(request.params.id);
  const card = getPlayer(cardId);
  const parsed = cardUpdateSchema.safeParse(request.body);
  if (!card || !parsed.success) return response.status(400).json({ error: "Configuración de carta no válida." });
  const override = normalizeCardOverride(cardId, parsed.data);
  if (!override) return response.status(404).json({ error: "Carta no encontrada." });
  persistCardOverride(cardId, override);
  return response.json({
    id: cardId,
    rating: card.rating,
    position: card.position,
    positions: positionsFor(card),
    enabled: isCardEnabled(cardId),
    overridden: Object.keys(override).length > 0,
  });
});

app.delete("/api/admin/players/:id", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const cardId = String(request.params.id);
  if (!setCardOverride(cardId)) return response.status(404).json({ error: "Carta no encontrada." });
  store.deleteCardOverride(cardId);
  notifyAllRooms();
  const card = getPlayer(cardId)!;
  return response.json({ id: cardId, rating: card.rating, position: card.position, enabled: true, overridden: false });
});

// Compatibility for an administrator tab that was open before this release.
app.put("/api/admin/players/:id/rating", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const cardId = String(request.params.id);
  const card = getPlayer(cardId);
  const parsed = ratingSchema.safeParse(request.body);
  if (!card || !parsed.success) return response.status(400).json({ error: "Carta o puntuación no válida." });
  const override = normalizeCardOverride(cardId, { ...(store.cardOverrides()[cardId] ?? {}), rating: parsed.data.rating });
  if (!override) return response.status(404).json({ error: "Carta no encontrada." });
  persistCardOverride(cardId, override);
  return response.json({ id: cardId, rating: card.rating, baseRating: baseRatingFor(cardId), overridden: override.rating !== undefined });
});

app.delete("/api/admin/players/:id/rating", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const cardId = String(request.params.id);
  if (!getPlayer(cardId)) return response.status(404).json({ error: "Carta no encontrada." });
  const override = { ...(store.cardOverrides()[cardId] ?? {}) };
  delete override.rating;
  persistCardOverride(cardId, override);
  return response.json({ id: cardId, rating: getPlayer(cardId)?.rating, overridden: false });
});

app.get("/api/admin/ratings/export", (request, response) => {
  if (!requireAdmin(request, response)) return;
  const payload = { format: "eleven-force-catalog", version: 3, exportedAt: new Date().toISOString(), overrides: store.cardOverrides() };
  response.set("Content-Disposition", `attachment; filename="eleven-force-catalog-${new Date().toISOString().slice(0, 10)}.json"`);
  return response.type("application/json").send(`${JSON.stringify(payload, null, 2)}\n`);
});

app.post("/api/admin/ratings/import", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const parsed = cardImportSchema.safeParse(request.body);
  const legacy = ratingImportSchema.safeParse(request.body);
  if (!parsed.success && !legacy.success) return response.status(400).json({ error: "Archivo de configuración no válido." });
  let incoming: CardOverrides;
  if (parsed.success) incoming = parsed.data.overrides;
  else if (legacy.success) incoming = Object.fromEntries(Object.entries(legacy.data.ratings).map(([cardId, rating]) => [cardId, { rating }]));
  else return response.status(400).json({ error: "Archivo de configuración no válido." });
  if (Object.keys(incoming).length > 2_000) return response.status(400).json({ error: "Archivo de configuración no válido." });
  const normalized: CardOverrides = {};
  for (const [cardId, values] of Object.entries(incoming)) {
    const override = normalizeCardOverride(cardId, values);
    if (!override) return response.status(400).json({ error: `La carta ${cardId} no existe.` });
    if (Object.keys(override).length) normalized[cardId] = override;
  }
  store.replaceCardOverrides(normalized);
  applyCatalogOverrides(normalized);
  notifyAllRooms();
  return response.json({ imported: Object.keys(normalized).length });
});

app.delete("/api/admin/ratings", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const cleared = store.clearCardOverrides();
  applyCatalogOverrides({});
  notifyAllRooms();
  return response.json({ cleared });
});

app.get("/api/admin/rooms", (request, response) => {
  if (!requireAdmin(request, response)) return;
  return response.json({ rooms: store.listActiveRooms() });
});

app.delete("/api/admin/rooms/:code", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  const roomCode = String(request.params.code).toUpperCase();
  notify(roomCode);
  if (!store.deleteRoom(roomCode)) return response.status(404).json({ error: "La sala ya no existe." });
  return response.json({ deleted: roomCode });
});

app.post("/api/admin/maintenance/cleanup", (request, response) => {
  if (!requireAdminMutation(request, response)) return;
  store.cleanup();
  return response.json({ activeRooms: store.activeRoomCount(), activeSessions: store.activeSessionCount() });
});

app.post("/api/rooms", rateLimit({ windowMs: 60 * 60_000, limit: 20 }), (request, response) => {
  const parsed = roomSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Revisa los datos de la sala." });
  if (store.activeRoomCount() >= MAX_ACTIVE_ROOMS) {
    return response.status(503).json({ error: "El servidor tiene demasiadas salas activas. Inténtalo más tarde." });
  }
  const input = parsed.data;
  if (input.mode === "final" && input.bracketSize !== 4) input.bracketSize = 4;
  const roomCode = code();
  const memberId = randomUUID();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  const state: RoomState = {
    code: roomCode,
    title: input.title,
    mode: input.mode,
    bracketSize: input.bracketSize,
    seasons: [...new Set(input.seasons)],
    showRatings: input.showRatings,
    uniqueCharacters: input.uniqueCharacters,
    status: "lobby",
    members: [{ id: memberId, name: input.name, isHost: true, ready: false, formation: input.formation, tactic: input.tactic, lineup: [] }],
    expiresAt,
    version: 1,
  };
  store.createRoom(state, input.password || undefined);
  const session = store.createSession(roomCode, memberId, expiresAt);
  setSessionCookie(response, session.token);
  return response.status(201).json({ ...state, viewerMemberId: memberId, csrfToken: session.csrfToken });
});

app.post("/api/rooms/:code/join", rateLimit({ windowMs: 15 * 60_000, limit: 40 }), (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const parsed = joinSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Escribe un nombre válido." });
  if (!store.verifyRoomPassword(roomCode, parsed.data.password)) return response.status(403).json({ error: "Contraseña incorrecta." });
  try {
    const memberId = randomUUID();
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "lobby") throw new Error("El draft ya ha empezado.");
      if (room.members.length >= room.bracketSize) throw new Error("La sala está completa.");
      if (room.members.some((member) => member.name.localeCompare(parsed.data.name, undefined, { sensitivity: "base" }) === 0)) {
        throw new Error("Ese nombre ya está dentro de la sala.");
      }
      room.members.push({
        id: memberId,
        name: parsed.data.name,
        isHost: false,
        ready: false,
        formation: parsed.data.formation,
        tactic: parsed.data.tactic,
        lineup: [],
      });
    });
    const session = store.createSession(roomCode, memberId, state.expiresAt);
    setSessionCookie(response, session.token);
    notify(roomCode);
    return response.status(201).json({ ...roomView(state, request), viewerMemberId: memberId, csrfToken: session.csrfToken });
  } catch (error) {
    handleError(response, error);
  }
});

app.get("/api/rooms/:code", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  if (!sessionFor(request, roomCode)) return response.status(401).json({ error: "Entra en la sala para ver la partida." });
  const state = store.loadRoom(roomCode);
  if (!state) return response.status(404).json({ error: "La sala no existe o ha caducado." });
  return response.json(roomView(state, request));
});

app.get("/api/rooms/:code/events", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = sessionFor(request, roomCode);
  if (!session) return response.status(401).end();
  const room = store.loadRoom(roomCode);
  if (!room) return response.status(404).end();
  const memberKey = `${roomCode}:${session.memberId}`;
  if (streamCount >= MAX_STREAMS || (memberStreams.get(memberKey) ?? 0) >= MAX_MEMBER_STREAMS) {
    return response.status(429).json({ error: "Demasiadas conexiones abiertas. Cierra otras pestañas e inténtalo de nuevo." });
  }
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  response.write(`event: connected\ndata: ${JSON.stringify({ code: roomCode })}\n\n`);
  const roomStreams = streams.get(roomCode) ?? new Set<Response>();
  roomStreams.add(response);
  streams.set(roomCode, roomStreams);
  streamCount += 1;
  memberStreams.set(memberKey, (memberStreams.get(memberKey) ?? 0) + 1);
  // Release a connection even when its client never closes the tab.
  const expiry = setTimeout(() => response.end(), Math.max(1, Date.parse(room.expiresAt) - Date.now()));
  expiry.unref();
  request.on("close", () => {
    clearTimeout(expiry);
    if (!roomStreams.delete(response)) return;
    streamCount -= 1;
    const count = (memberStreams.get(memberKey) ?? 1) - 1;
    if (count > 0) memberStreams.set(memberKey, count);
    else memberStreams.delete(memberKey);
    if (!roomStreams.size) streams.delete(roomCode);
  });
});

app.post("/api/rooms/:code/profile", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  const parsed = profileSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Configuración inválida." });
  try {
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "lobby") throw new Error("La configuración ya está bloqueada.");
      const member = room.members.find((candidate) => candidate.id === session.memberId);
      if (!member) throw new Error("Miembro no encontrado.");
      if (parsed.data.formation) member.formation = parsed.data.formation;
      if (parsed.data.tactic) member.tactic = parsed.data.tactic;
      if (parsed.data.ready !== undefined) member.ready = parsed.data.ready;
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/rooms/:code/start", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  try {
    const state = mutateRoom(roomCode, (room) => {
      const host = room.members.find((member) => member.id === session.memberId && member.isHost);
      if (!host) throw new Error("Solo el anfitrión puede iniciar la partida.");
      if (!host.ready) throw new Error("Marca tu equipo como preparado.");
      const ready = room.members.filter((member) => member.ready);
      if (room.mode === "final" && ready.length !== 2) throw new Error("La final necesita exactamente dos participantes preparados.");
      if (room.mode === "cup" && ready.length < 2) throw new Error("La copa necesita al menos dos participantes preparados.");
      room.members = ready;
      room.status = "draft";
      room.currentMemberId = ready[0].id;
      room.roll = undefined;
      room.rollHistory = [];
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/rooms/:code/roll", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  try {
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "draft" || room.currentMemberId !== session.memberId) throw new Error("No es tu turno.");
      const member = room.members.find((candidate) => candidate.id === session.memberId);
      if (!member) throw new Error("Miembro no encontrado.");
      if (room.roll && rollHasOptions(room, member)) throw new Error("Ya tienes una plantilla sobre la mesa.");
      room.rollHistory = [];
      room.roll = newRoll(room, member);
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/rooms/:code/reroll", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  try {
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "draft" || room.currentMemberId !== session.memberId) throw new Error("No es tu turno.");
      if (!room.roll || room.roll.rerollsLeft <= 0) throw new Error("Ya has usado los dos rerolls de este turno.");
      const member = room.members.find((candidate) => candidate.id === session.memberId);
      if (!member) throw new Error("Miembro no encontrado.");
      room.roll = newRoll(room, member, room.roll.season, room.roll.rerollsLeft - 1);
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/rooms/:code/pick", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  const parsed = z.object({ playerId: z.string().min(1).max(160), confirmReassignment: z.boolean().optional().default(false) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Carta inválida." });
  try {
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "draft" || room.currentMemberId !== session.memberId) throw new Error("No es tu turno.");
      if (!room.roll) throw new Error("Primero debes sortear una plantilla.");
      const member = room.members.find((candidate) => candidate.id === session.memberId);
      const squad = getSquad(room.roll.squadId);
      const player = getPlayer(parsed.data.playerId);
      if (!member || !squad || !player || !squad.players.some((candidate) => candidate.id === player.id)) throw new Error("Esa carta no pertenece a la plantilla actual.");
      const plan = planDraftPlacement(member.formation, member.lineup, player);
      if (!plan) throw new Error("Esa posición ya está completa.");
      if (isCharacterUnavailable(room.members, member.id, player.characterKey, room.uniqueCharacters ?? true)) {
        throw new Error("Otro participante ya eligió a ese personaje.");
      }
      if (plan.changes.length && !parsed.data.confirmReassignment) {
        throw new Error("Confirma el cambio de posición antes de fichar.");
      }
      member.lineup = plan.lineup;
      const next = nextMember(room, member.id);
      room.roll = undefined;
      room.rollHistory = [];
      if (!next) completeCompetition(room);
      else room.currentMemberId = next.id;
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

app.post("/api/rooms/:code/position", (request, response) => {
  const roomCode = String(request.params.code).toUpperCase();
  const session = mutationSession(request, response, roomCode);
  if (!session) return;
  const parsed = z.object({ playerId: z.string().min(1).max(160), position: z.enum(positionIds) }).safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: "Cambio de posición no válido." });
  try {
    const state = mutateRoom(roomCode, (room) => {
      if (room.status !== "draft") throw new Error("La configuración ya está bloqueada.");
      const member = room.members.find((candidate) => candidate.id === session.memberId);
      if (!member) throw new Error("Miembro no encontrado.");
      const lineup = reassignLineupPlayer(member.formation, member.lineup, parsed.data.playerId, parsed.data.position);
      if (!lineup) throw new Error("No hay una plaza libre para ese cambio de posición.");
      member.lineup = lineup;
    });
    notify(roomCode);
    return response.json(roomView(state, request));
  } catch (error) {
    handleError(response, error);
  }
});

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const staticDirectory = join(currentDirectory, "../dist");
app.use("/assets", express.static(join(staticDirectory, "assets"), { immutable: true, maxAge: "1y" }));
app.use("/portraits", express.static(join(staticDirectory, "portraits"), { immutable: true, maxAge: "30d", fallthrough: false }));
app.use(express.static(staticDirectory, { maxAge: 0, etag: true }));
app.get(/.*/, (_request, response) => response.sendFile(join(staticDirectory, "index.html")));

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) return next(error);
  const status = error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : 500;
  response.set("Cache-Control", "no-store");
  response.status(status).json({ error: status === 413 ? "La petición es demasiado grande." : status === 400 ? "JSON no válido." : "Error interno del servidor." });
};
app.use(errorHandler);

const heartbeat = setInterval(() => {
  for (const responses of streams.values()) for (const response of responses) response.write(": heartbeat\n\n");
}, 25_000);
heartbeat.unref();
const cleanup = setInterval(() => store.cleanup(), 60 * 60_000);
cleanup.unref();
store.cleanup();

if (process.env.NODE_ENV !== "test") {
  app.listen(port, process.env.BIND_ADDRESS ?? "127.0.0.1", () => console.log(`Eleven Force listening on ${port}`));
}

export { app };
