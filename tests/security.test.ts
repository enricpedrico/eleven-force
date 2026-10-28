import { get, type ClientRequest, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const directory = mkdtempSync(join(tmpdir(), "eleven-security-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = join(directory, "test.sqlite");
let app: Awaited<typeof import("../server/index")>["app"];
beforeAll(async () => { app = (await import("../server/index")).app; });
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const room = {
  title: "Security test", name: "Host", password: "test-room-password",
  mode: "final", bracketSize: 4, seasons: ["original"], formation: "4-3-3", tactic: "balanced", showRatings: true,
};

describe("public API security boundaries", () => {
  it("treats structured or malformed session cookies as unauthenticated", async () => {
    for (const value of ['j:{}', 'j:[]', 'short', 'a'.repeat(100)]) {
      await request(app).get("/api/admin/session").set("Cookie", `ef_admin=${value}`).expect(401);
      await request(app).get("/api/rooms/ABCDEF").set("Cookie", `ef_session=${value}`).expect(401);
    }
  });

  it("requires room membership and CSRF, blocks foreign origins and prevents caching", async () => {
    const agent = request.agent(app);
    const created = await agent.post("/api/rooms").send(room).expect(201);
    const { code, csrfToken } = created.body;
    expect(created.headers["cache-control"]).toContain("no-store");
    await request(app).get(`/api/rooms/${code}`).expect(401);
    await request(app).get(`/api/rooms/${code}/events`).expect(401);
    const state = await agent.get(`/api/rooms/${code}`).expect(200);
    expect(state.headers["cache-control"]).toContain("no-store");
    await agent.post(`/api/rooms/${code}/profile`).send({ ready: true }).expect(403);
    await agent.post(`/api/rooms/${code}/profile`).set("X-CSRF-Token", csrfToken)
      .set("Origin", "https://other.example").send({ ready: true }).expect(403);
    await agent.post(`/api/rooms/${code}/profile`).set("X-CSRF-Token", csrfToken).send({ ready: true }).expect(200);
  });

  it("returns generic JSON for malformed and oversized JSON bodies", async () => {
    const malformed = await request(app).post("/api/rooms").set("Content-Type", "application/json").send("{broken").expect(400);
    expect(malformed.body.error).toBe("JSON no válido.");
    const oversized = await request(app).post("/api/rooms").send({ payload: "x".repeat(33 * 1024) }).expect(413);
    expect(oversized.body.error).toBe("La petición es demasiado grande.");
    expect(JSON.stringify(oversized.body)).not.toMatch(/stack|server\/|sqlite/i);
  });

  it("rejects invalid password verifiers instead of comparing empty buffers", async () => {
    const { hashPassword, verifyPassword } = await import("../server/store");
    for (const invalid of ["", "aa:bb", "00:xx", ":", "f".repeat(32) + ":"]) {
      expect(verifyPassword("test", invalid)).toBe(false);
    }
    expect(verifyPassword("test", hashPassword("test"))).toBe(true);
    expect(verifyPassword("wrong", hashPassword("test"))).toBe(false);
  });

  it("does not expose storage errors or publish a failed room mutation", async () => {
    const agent = request.agent(app);
    const created = await agent.post("/api/rooms").send(room).expect(201);
    const { default: Database } = await import("better-sqlite3");
    const database = new Database(join(directory, "test.sqlite"));
    database.exec("CREATE TRIGGER reject_security_update BEFORE UPDATE ON rooms BEGIN SELECT RAISE(ABORT, 'private storage details'); END;");
    try {
      const failed = await agent.post(`/api/rooms/${created.body.code}/profile`)
        .set("X-CSRF-Token", created.body.csrfToken).send({ ready: true }).expect(500);
      expect(failed.body).toEqual({ error: "Error interno del servidor." });
      const current = await agent.get(`/api/rooms/${created.body.code}`).expect(200);
      expect(current.body.members[0].ready).toBe(false);
    } finally {
      database.exec("DROP TRIGGER reject_security_update");
      database.close();
    }
  });

  it("bounds real SSE connections and releases their leases when clients close", async () => {
    const created = await request(app).post("/api/rooms").send(room).expect(201);
    const cookie = created.headers["set-cookie"][0].split(";")[0];
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test listener");
    const url = `http://127.0.0.1:${address.port}/api/rooms/${created.body.code}/events`;
    const clients: ClientRequest[] = [];
    const responses: IncomingMessage[] = [];
    const open = () => new Promise<IncomingMessage>((resolve, reject) => {
      const client = get(url, { headers: { Cookie: cookie } }, response => {
        responses.push(response); resolve(response);
      });
      clients.push(client); client.on("error", reject);
    });
    try {
      for (let i = 0; i < 4; i++) expect((await open()).statusCode).toBe(200);
      const refused = await open();
      expect(refused.statusCode).toBe(429); refused.resume();
      for (const response of responses) response.destroy();
      for (const client of clients) client.destroy();
      await new Promise(resolve => setTimeout(resolve, 25));
      expect((await open()).statusCode).toBe(200);
    } finally {
      for (const response of responses) response.destroy();
      for (const client of clients) client.destroy();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
  it("refuses new rooms at the global capacity without deleting existing ones", async () => {
    const { RoomStore } = await import("../server/store");
    const store = new RoomStore(process.env.DATABASE_PATH!);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    for (let i = 0; i < 500; i++) {
      store.createRoom({ code: `capacity-${i}`, title: "Capacity", mode: "final", bracketSize: 4,
        seasons: ["original"], showRatings: true, uniqueCharacters: true,
        status: "lobby", members: [], expiresAt, version: 1 });
    }
    await request(app).post("/api/rooms").send(room).expect(503);
    expect(store.loadRoom("capacity-0")).toBeDefined();
  });

});
