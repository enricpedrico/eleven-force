import { scryptSync } from "node:crypto";
import { rmSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PORTRAIT_COUNT, SQUADS, canDraft, getSquad, planDraftPlacement } from "../shared/catalog";
import type { RoomState } from "../shared/types";

const databasePath = join("/tmp", `eleven-force-test-${process.pid}.sqlite`);
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
const adminPassword = "admin-test-password";
const adminSalt = Buffer.from("00112233445566778899aabbccddeeff", "hex");
process.env.ADMIN_PASSWORD_HASH = `${adminSalt.toString("hex")}:${scryptSync(adminPassword, adminSalt, 32).toString("hex")}`;

let app: Awaited<typeof import("../server/index")>["app"];

beforeAll(async () => {
  app = (await import("../server/index")).app;
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${databasePath}${suffix}`, { force: true });
});

describe("multiplayer API", () => {
  it("enforces sessions, two same-season rerolls, unique picks and a complete final", async () => {
    const hostAgent = request.agent(app);
    const guestAgent = request.agent(app);
    const created = await hostAgent.post("/api/rooms").send({
      title: "Final E2E",
      name: "Maria",
      password: "secret",
      mode: "final",
      bracketSize: 4,
      seasons: ["original", "go"],
      formation: "4-3-3",
      tactic: "balanced",
      showRatings: true,
    }).expect(201);
    let state = created.body as RoomState;
    const hostId = state.viewerMemberId!;
    const hostCsrf = state.csrfToken!;
    expect(state.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(state.uniqueCharacters).toBe(true);
    await request(app).get(`/api/rooms/${state.code}`).expect(401);

    await request(app).post(`/api/rooms/${state.code}/join`).send({ name: "Intruso", password: "wrong", formation: "4-3-3", tactic: "balanced" }).expect(403);
    const joined = await guestAgent.post(`/api/rooms/${state.code}/join`).send({ name: "Jorge", password: "secret", formation: "4-3-3", tactic: "offensive" }).expect(201);
    state = joined.body as RoomState;
    const guestId = state.viewerMemberId!;
    const guestCsrf = state.csrfToken!;

    await hostAgent.post(`/api/rooms/${state.code}/profile`).set("X-CSRF-Token", hostCsrf).send({ ready: true }).expect(200);
    await guestAgent.post(`/api/rooms/${state.code}/profile`).set("X-CSRF-Token", guestCsrf).send({ ready: true }).expect(200);
    state = (await hostAgent.post(`/api/rooms/${state.code}/start`).set("X-CSRF-Token", hostCsrf).send({}).expect(200)).body as RoomState;
    expect(state.status).toBe("draft");
    expect(state.currentMemberId).toBe(hostId);

    state = (await hostAgent.post(`/api/rooms/${state.code}/roll`).set("X-CSRF-Token", hostCsrf).send({}).expect(200)).body as RoomState;
    const lockedSeason = state.roll!.season;
    state = (await hostAgent.post(`/api/rooms/${state.code}/reroll`).set("X-CSRF-Token", hostCsrf).send({}).expect(200)).body as RoomState;
    expect(state.roll?.season).toBe(lockedSeason);
    state = (await hostAgent.post(`/api/rooms/${state.code}/reroll`).set("X-CSRF-Token", hostCsrf).send({}).expect(200)).body as RoomState;
    expect(state.roll?.season).toBe(lockedSeason);
    expect(state.roll?.rerollsLeft).toBe(0);
    await hostAgent.post(`/api/rooms/${state.code}/reroll`).set("X-CSRF-Token", hostCsrf).send({}).expect(400);

    const agents = new Map([
      [hostId, { agent: hostAgent, csrf: hostCsrf }],
      [guestId, { agent: guestAgent, csrf: guestCsrf }],
    ]);
    while (state.status === "draft") {
      const actor = agents.get(state.currentMemberId!);
      expect(actor).toBeDefined();
      if (!state.roll) {
        state = (await actor!.agent.post(`/api/rooms/${state.code}/roll`).set("X-CSRF-Token", actor!.csrf).send({}).expect(200)).body as RoomState;
      }
      const member = state.members.find((candidate) => candidate.id === state.currentMemberId)!;
      const squad = getSquad(state.roll!.squadId)!;
      const used = new Set(state.members.flatMap((candidate) => candidate.lineup.map((player) => player.characterKey)));
      const valid = squad.players.filter((candidate) => !used.has(candidate.characterKey) && canDraft(member.formation, member.lineup, candidate));
      const player = valid.find((candidate) => planDraftPlacement(member.formation, member.lineup, candidate)?.changes.length) ?? valid[0];
      expect(player).toBeDefined();
      const plan = planDraftPlacement(member.formation, member.lineup, player!);
      if (plan?.changes.length) {
        await actor!.agent.post(`/api/rooms/${state.code}/pick`).set("X-CSRF-Token", actor!.csrf).send({ playerId: player!.id }).expect(400);
      }
      state = (await actor!.agent.post(`/api/rooms/${state.code}/pick`).set("X-CSRF-Token", actor!.csrf).send({ playerId: player!.id, confirmReassignment: Boolean(plan?.changes.length) }).expect(200)).body as RoomState;
    }

    expect(state.status).toBe("complete");
    expect(state.members.every((member) => member.lineup.length === 11)).toBe(true);
    expect(new Set(state.members.flatMap((member) => member.lineup.map((player) => player.characterKey))).size).toBe(22);
    expect(state.results?.rounds).toHaveLength(1);
    expect(state.results?.rounds[0]).toHaveLength(1);
  }, 30_000);
});

describe("admin API", () => {
  it("protects the panel and persists rating overrides", async () => {
    const admin = request.agent(app);
    await request(app).get("/api/admin/overview").expect(401);
    await admin.post("/api/admin/login").send({ password: "incorrect-password" }).expect(401);
    const loggedIn = await admin.post("/api/admin/login").send({ password: adminPassword }).expect(200);
    const csrf = loggedIn.body.csrfToken as string;
    expect(csrf).toHaveLength(32);

    const session = await admin.get("/api/admin/session").expect(200);
    expect(session.body.authenticated).toBe(true);
    const overview = await admin.get("/api/admin/overview").expect(200);
    expect(overview.body.portraits).toBe(PORTRAIT_COUNT);
    expect(overview.body.cards).toBe(SQUADS.reduce((total, squad) => total + squad.players.length, 0));

    const page = await admin.get("/api/admin/players?query=Jude%20Sharp&team=go%7CRoyal%20Academy").expect(200);
    expect(page.body.total).toBe(1);
    const card = page.body.items[0] as { id: string; baseRating: number; basePosition: string; basePositions: string[]; rating: number; position: string; positions: string[]; enabled: boolean };
    expect(card).toMatchObject({ id: "go-royal-academy-3956", basePosition: "MF", basePositions: ["MF"], position: "MF", positions: ["MF"], enabled: true });
    const byTeam = await admin.get("/api/admin/players?team=original%7CRaimon").expect(200);
    expect(byTeam.body.total).toBeGreaterThan(0);
    expect(byTeam.body.items.every((item: { season: string; team: string }) => item.season === "original" && item.team === "Raimon")).toBe(true);
    await admin.put(`/api/admin/players/${card.id}`).send({ rating: 42, position: "FW", positions: ["FW", "MF"], enabled: false }).expect(403);
    await admin.put(`/api/admin/players/${card.id}`).set("X-CSRF-Token", csrf).send({ rating: 42, position: "FW", positions: ["FW", "MF"], enabled: false }).expect(200);
    await admin.put(`/api/admin/players/${card.id}`).set("X-CSRF-Token", csrf).send({ rating: 42, position: "FW", positions: ["MF"], enabled: false }).expect(400);
    const config = await request(app).get("/api/catalog-config").expect(200);
    expect(config.body.overrides[card.id]).toEqual({ rating: 42, position: "FW", positions: ["FW", "MF"], enabled: false });

    const changed = await admin.get("/api/admin/players?availability=disabled").expect(200);
    expect(changed.body.total).toBe(1);
    expect(changed.body.items[0]).toMatchObject({ id: card.id, rating: 42, position: "FW", positions: ["FW", "MF"], enabled: false, overridden: true, positionsOverridden: true });
    expect(getSquad("go-royal-academy")?.players.some((player) => player.id === card.id)).toBe(false);
    expect(getSquad("original-royal-academy")?.players.some((player) => player.name === "Jude Sharp")).toBe(true);

    const exported = await admin.get("/api/admin/ratings/export").expect(200);
    expect(exported.body).toMatchObject({ format: "eleven-force-catalog", version: 3 });
    expect(exported.body.overrides[card.id]).toEqual({ rating: 42, position: "FW", positions: ["FW", "MF"], enabled: false });

    await admin.delete(`/api/admin/players/${card.id}`).set("X-CSRF-Token", csrf).send({}).expect(200);
    const restored = await admin.get(`/api/admin/players?query=Jude%20Sharp&team=go%7CRoyal%20Academy`).expect(200);
    expect(restored.body.items[0]).toMatchObject({ rating: card.baseRating, position: card.basePosition, positions: card.basePositions, enabled: true, overridden: false });

    const tierCard = byTeam.body.items[0] as { id: string; name: string; baseRating: number };
    const tierRatings = { [card.id]: card.baseRating + 1, [tierCard.id]: tierCard.baseRating + 1 };
    await admin.put("/api/admin/players/ratings").send({ ratings: tierRatings }).expect(403);
    await admin.put("/api/admin/players/ratings").set("X-CSRF-Token", csrf).send({ ratings: { ...tierRatings, missing: 80 } }).expect(400);
    const tierSaved = await admin.put("/api/admin/players/ratings").set("X-CSRF-Token", csrf).send({ ratings: tierRatings }).expect(200);
    expect(tierSaved.body.updated).toBe(2);
    expect(tierSaved.body.overrides).toMatchObject({
      [card.id]: { rating: card.baseRating + 1 },
      [tierCard.id]: { rating: tierCard.baseRating + 1 },
    });
    const tierPersisted = await admin.get(`/api/admin/players?team=original%7CRaimon&query=${encodeURIComponent(tierCard.name)}`).expect(200);
    expect(tierPersisted.body.items[0]?.rating).toBe(tierCard.baseRating + 1);
    await admin.put("/api/admin/players/ratings").set("X-CSRF-Token", csrf).send({ ratings: { [card.id]: card.baseRating, [tierCard.id]: tierCard.baseRating } }).expect(200);

    await admin.post("/api/admin/ratings/import").set("X-CSRF-Token", csrf).send({ ratings: { [card.id]: 43 } }).expect(200);
    const legacyImported = await admin.get(`/api/admin/players?query=Jude%20Sharp&team=go%7CRoyal%20Academy`).expect(200);
    expect(legacyImported.body.items[0]).toMatchObject({ rating: 43, position: card.basePosition, enabled: true, ratingOverridden: true });
    await admin.delete(`/api/admin/players/${card.id}`).set("X-CSRF-Token", csrf).send({}).expect(200);

    await admin.post("/api/admin/logout").set("X-CSRF-Token", csrf).send({}).expect(200);
    await admin.get("/api/admin/session").expect(401);
  });
});
