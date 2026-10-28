import type {
  AdminOverview,
  AdminPlayerPage,
  AdminRoomSummary,
  AdminSession,
  CardOverrides,
  CatalogConfig,
  FormationId,
  Position,
  RatingOverrides,
  RoomMode,
  RoomState,
  SeasonId,
  Tactic,
} from "../shared/types";

interface MemberInput {
  name: string;
  formation: FormationId;
  tactic: Tactic;
}

export interface CreateRoomInput extends MemberInput {
  title: string;
  mode: RoomMode;
  bracketSize: 4 | 8 | 16;
  seasons: SeasonId[];
  showRatings: boolean;
  uniqueCharacters: boolean;
  password: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "No se pudo contactar con el servidor.");
  return body as T;
}

export const api = {
  catalogConfig: () => request<CatalogConfig>("/api/catalog-config"),
  createRoom: (input: CreateRoomInput) => request<RoomState>("/api/rooms", { method: "POST", body: JSON.stringify(input) }),
  joinRoom: (code: string, input: MemberInput & { password: string }) =>
    request<RoomState>(`/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify(input) }),
  room: (code: string) => request<RoomState>(`/api/rooms/${code}`),
  mutate: (room: RoomState, action: string, body: unknown = {}) =>
    request<RoomState>(`/api/rooms/${room.code}/${action}`, {
      method: "POST",
      headers: { "X-CSRF-Token": room.csrfToken ?? "" },
      body: JSON.stringify(body),
    }),
  admin: {
    login: (password: string) => request<AdminSession>("/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
    session: () => request<AdminSession>("/api/admin/session"),
    logout: (csrfToken: string) => request<{ ok: true }>("/api/admin/logout", { method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: "{}" }),
    overview: () => request<AdminOverview>("/api/admin/overview"),
    players: (filters: { query?: string; season?: string; team?: string; position?: string; availability?: string; page?: number; pageSize?: number }) => {
      const search = new URLSearchParams();
      if (filters.query) search.set("query", filters.query);
      if (filters.season) search.set("season", filters.season);
      if (filters.team) search.set("team", filters.team);
      if (filters.position) search.set("position", filters.position);
      if (filters.availability) search.set("availability", filters.availability);
      if (filters.page) search.set("page", String(filters.page));
      if (filters.pageSize) search.set("pageSize", String(filters.pageSize));
      return request<AdminPlayerPage>(`/api/admin/players?${search}`);
    },
    saveCard: (csrfToken: string, cardId: string, values: { rating: number; position: Position; positions: Position[]; enabled: boolean }) => request<{ rating: number; position: Position; positions: Position[]; enabled: boolean; overridden: boolean }>(
      `/api/admin/players/${encodeURIComponent(cardId)}`,
      { method: "PUT", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify(values) },
    ),
    saveRatings: (csrfToken: string, ratings: RatingOverrides) => request<{ updated: number; overrides: CardOverrides }>(
      "/api/admin/players/ratings",
      { method: "PUT", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify({ ratings }) },
    ),
    resetCard: (csrfToken: string, cardId: string) => request<{ rating: number; position: Position; enabled: true; overridden: false }>(
      `/api/admin/players/${encodeURIComponent(cardId)}`,
      { method: "DELETE", headers: { "X-CSRF-Token": csrfToken }, body: "{}" },
    ),
    clearRatings: (csrfToken: string) => request<{ cleared: number }>("/api/admin/ratings", {
      method: "DELETE", headers: { "X-CSRF-Token": csrfToken }, body: "{}",
    }),
    importCatalog: (csrfToken: string, overrides: CardOverrides | RatingOverrides, legacy = false) => request<{ imported: number }>("/api/admin/ratings/import", {
      method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: JSON.stringify(legacy ? { ratings: overrides } : { overrides }),
    }),
    rooms: () => request<{ rooms: AdminRoomSummary[] }>("/api/admin/rooms"),
    deleteRoom: (csrfToken: string, code: string) => request<{ deleted: string }>(`/api/admin/rooms/${code}`, {
      method: "DELETE", headers: { "X-CSRF-Token": csrfToken }, body: "{}",
    }),
    cleanup: (csrfToken: string) => request<{ activeRooms: number; activeSessions: number }>("/api/admin/maintenance/cleanup", {
      method: "POST", headers: { "X-CSRF-Token": csrfToken }, body: "{}",
    }),
  },
};
