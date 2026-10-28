import Database from "better-sqlite3";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import type { AdminRoomSummary, CardOverride, CardOverrides, Position, RoomState } from "../shared/types";

interface SessionRecord {
  roomCode: string;
  memberId: string;
  csrfToken: string;
}

interface AdminSessionRecord {
  csrfToken: string;
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (stored === null) return true;
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/i.test(stored)) return false;
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export class RoomStore {
  private readonly database: Database.Database;
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.database = new Database(path);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        password_hash TEXT,
        expires_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
        member_id TEXT NOT NULL,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_room_idx ON sessions(room_code);
      CREATE INDEX IF NOT EXISTS rooms_expiry_idx ON rooms(expires_at);
      CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT PRIMARY KEY,
        csrf_token TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);
      CREATE TABLE IF NOT EXISTS rating_overrides (
        card_id TEXT PRIMARY KEY,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 99),
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS card_overrides (
        card_id TEXT PRIMARY KEY,
        rating INTEGER CHECK (rating BETWEEN 1 AND 99),
        position TEXT CHECK (position IN ('GK', 'DF', 'MF', 'FW')),
        positions TEXT CHECK (positions IS NULL OR json_valid(positions)),
        enabled INTEGER CHECK (enabled IN (0, 1)),
        updated_at TEXT NOT NULL,
        CHECK (rating IS NOT NULL OR position IS NOT NULL OR positions IS NOT NULL OR enabled IS NOT NULL)
      );
    `);
    const migrated = this.database.prepare("SELECT 1 FROM schema_meta WHERE key = 'card_overrides_v1'").get();
    if (!migrated) {
      this.database.transaction(() => {
        this.database.prepare(`
          INSERT INTO card_overrides (card_id, rating, position, enabled, updated_at)
          SELECT card_id, rating, NULL, NULL, updated_at FROM rating_overrides
          WHERE true
          ON CONFLICT(card_id) DO NOTHING
        `).run();
        this.database.prepare("INSERT INTO schema_meta (key, value) VALUES ('card_overrides_v1', ?)").run(new Date().toISOString());
      })();
    }
    const overrideColumns = this.database.pragma("table_info(card_overrides)") as Array<{ name: string }>;
    if (!overrideColumns.some((column) => column.name === "positions")) {
      this.database.transaction(() => {
        this.database.exec(`
          ALTER TABLE card_overrides RENAME TO card_overrides_legacy;
          CREATE TABLE card_overrides (
            card_id TEXT PRIMARY KEY,
            rating INTEGER CHECK (rating BETWEEN 1 AND 99),
            position TEXT CHECK (position IN ('GK', 'DF', 'MF', 'FW')),
            positions TEXT CHECK (positions IS NULL OR json_valid(positions)),
            enabled INTEGER CHECK (enabled IN (0, 1)),
            updated_at TEXT NOT NULL,
            CHECK (rating IS NOT NULL OR position IS NOT NULL OR positions IS NOT NULL OR enabled IS NOT NULL)
          );
          INSERT INTO card_overrides (card_id, rating, position, positions, enabled, updated_at)
          SELECT card_id, rating, position, NULL, enabled, updated_at FROM card_overrides_legacy;
          DROP TABLE card_overrides_legacy;
        `);
        this.database.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('card_overrides_v2', ?)").run(new Date().toISOString());
      })();
    }
  }

  createRoom(state: RoomState, password?: string): void {
    this.database.prepare(
      "INSERT INTO rooms (code, state_json, password_hash, expires_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run(
      state.code,
      JSON.stringify(state),
      password ? hashPassword(password) : null,
      state.expiresAt,
      new Date().toISOString(),
    );
  }

  roomExists(code: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM rooms WHERE code = ?").get(code));
  }

  loadRoom(code: string): RoomState | undefined {
    const row = this.database.prepare(
      "SELECT state_json FROM rooms WHERE code = ? AND expires_at > ?",
    ).get(code, new Date().toISOString()) as { state_json: string } | undefined;
    return row ? JSON.parse(row.state_json) as RoomState : undefined;
  }

  saveRoom(state: RoomState, expectedVersion: number): boolean {
    const result = this.database.prepare(`
      UPDATE rooms
      SET state_json = ?, updated_at = ?
      WHERE code = ? AND json_extract(state_json, '$.version') = ? AND expires_at > ?
    `).run(
      JSON.stringify(state),
      new Date().toISOString(),
      state.code,
      expectedVersion,
      new Date().toISOString(),
    );
    return result.changes === 1;
  }

  verifyRoomPassword(code: string, password: string): boolean {
    const row = this.database.prepare("SELECT password_hash FROM rooms WHERE code = ? AND expires_at > ?").get(code, new Date().toISOString()) as
      | { password_hash: string | null }
      | undefined;
    return Boolean(row && verifyPassword(password, row.password_hash));
  }

  createSession(roomCode: string, memberId: string, expiresAt: string): { token: string; csrfToken: string } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    this.database.prepare(
      "INSERT INTO sessions (token_hash, room_code, member_id, csrf_token, expires_at) VALUES (?, ?, ?, ?, ?)",
    ).run(tokenHash(token), roomCode, memberId, csrfToken, expiresAt);
    return { token, csrfToken };
  }

  loadSession(token: unknown): SessionRecord | undefined {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return this.database.prepare(`
      SELECT room_code AS roomCode, member_id AS memberId, csrf_token AS csrfToken
      FROM sessions WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash(token), new Date().toISOString()) as SessionRecord | undefined;
  }

  createAdminSession(expiresAt: string): { token: string; csrfToken: string } {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(24).toString("base64url");
    this.database.prepare(
      "INSERT INTO admin_sessions (token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?)",
    ).run(tokenHash(token), csrfToken, expiresAt, new Date().toISOString());
    return { token, csrfToken };
  }

  loadAdminSession(token: unknown): AdminSessionRecord | undefined {
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    return this.database.prepare(`
      SELECT csrf_token AS csrfToken
      FROM admin_sessions WHERE token_hash = ? AND expires_at > ?
    `).get(tokenHash(token), new Date().toISOString()) as AdminSessionRecord | undefined;
  }

  deleteAdminSession(token: unknown): void {
    if (typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token)) this.database.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash(token));
  }

  cardOverrides(): CardOverrides {
    const rows = this.database.prepare(`
      SELECT card_id AS cardId, rating, position, positions, enabled FROM card_overrides
    `).all() as Array<{ cardId: string; rating: number | null; position: Position | null; positions: string | null; enabled: 0 | 1 | null }>;
    return Object.fromEntries(rows.map((row) => {
      const override: CardOverride = {};
      if (row.rating !== null) override.rating = row.rating;
      if (row.position !== null) override.position = row.position;
      if (row.positions !== null) override.positions = JSON.parse(row.positions) as Position[];
      if (row.enabled !== null) override.enabled = row.enabled === 1;
      return [row.cardId, override];
    }));
  }

  setCardOverride(cardId: string, override: CardOverride): void {
    this.setCardOverrides({ [cardId]: override });
  }

  setCardOverrides(overrides: CardOverrides): void {
    const upsert = this.database.prepare(`
      INSERT INTO card_overrides (card_id, rating, position, positions, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(card_id) DO UPDATE SET
        rating = excluded.rating,
        position = excluded.position,
        positions = excluded.positions,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `);
    const remove = this.database.prepare("DELETE FROM card_overrides WHERE card_id = ?");
    this.database.transaction(() => {
      const now = new Date().toISOString();
      for (const [cardId, override] of Object.entries(overrides)) {
        const rating = override.rating ?? null;
        const position = override.position ?? null;
        const positions = override.positions ? JSON.stringify(override.positions) : null;
        const enabled = override.enabled === undefined ? null : Number(override.enabled);
        if (rating === null && position === null && positions === null && enabled === null) remove.run(cardId);
        else upsert.run(cardId, rating, position, positions, enabled, now);
      }
    })();
  }

  deleteCardOverride(cardId: string): void {
    this.database.prepare("DELETE FROM card_overrides WHERE card_id = ?").run(cardId);
  }

  clearCardOverrides(): number {
    return this.database.prepare("DELETE FROM card_overrides").run().changes;
  }

  replaceCardOverrides(overrides: CardOverrides): void {
    const insert = this.database.prepare(`
      INSERT INTO card_overrides (card_id, rating, position, positions, enabled, updated_at) VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM card_overrides").run();
      const now = new Date().toISOString();
      for (const [cardId, override] of Object.entries(overrides)) {
        insert.run(cardId, override.rating ?? null, override.position ?? null, override.positions ? JSON.stringify(override.positions) : null, override.enabled === undefined ? null : Number(override.enabled), now);
      }
    })();
  }

  ratingOverrideCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM card_overrides WHERE rating IS NOT NULL").get() as { count: number };
    return row.count;
  }

  cardOverrideCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM card_overrides").get() as { count: number };
    return row.count;
  }

  disabledCardCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM card_overrides WHERE enabled = 0").get() as { count: number };
    return row.count;
  }

  listActiveRooms(): AdminRoomSummary[] {
    const rows = this.database.prepare(`
      SELECT code, state_json AS stateJson, updated_at AS updatedAt
      FROM rooms WHERE expires_at > ? ORDER BY updated_at DESC
    `).all(new Date().toISOString()) as Array<{ code: string; stateJson: string; updatedAt: string }>;
    return rows.map((row) => {
      const state = JSON.parse(row.stateJson) as RoomState;
      return {
        code: row.code,
        title: state.title,
        mode: state.mode,
        status: state.status,
        members: state.members.map((member) => member.name),
        expiresAt: state.expiresAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  deleteRoom(code: string): boolean {
    return this.database.prepare("DELETE FROM rooms WHERE code = ?").run(code).changes === 1;
  }

  cleanup(): void {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      this.database.prepare("DELETE FROM rooms WHERE expires_at <= ?").run(now);
      this.database.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
    })();
  }

  activeRoomCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM rooms WHERE expires_at > ?").get(new Date().toISOString()) as { count: number };
    return row.count;
  }

  activeSessionCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE expires_at > ?").get(new Date().toISOString()) as { count: number };
    return row.count;
  }

  databaseBytes(): number {
    return [this.path, `${this.path}-wal`, `${this.path}-shm`].reduce((total, path) => {
      try {
        return total + statSync(path).size;
      } catch {
        return total;
      }
    }, 0);
  }
}
