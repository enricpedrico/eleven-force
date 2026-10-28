import { describe, expect, it } from "vitest";
import { FORMATIONS, PORTRAIT_COUNT, SQUADS, applyCatalogOverrides, franchiseForSeason, getPlayer, getSquad, hasPortrait, isCharacterUnavailable, planDraftPlacement, positionsFor, reassignLineupPlayer } from "../shared/catalog";
import { Random, createCpuTeam, createRoll, pickBalancedSeason, simulateMatch, simulateTournament, teamRatingAverages, validateLineup } from "../shared/game";
import type { FormationId, Position, SeasonId } from "../shared/types";

describe("catalogue", () => {
  it("rates every card and keeps every squad draftable", () => {
    expect(SQUADS.length).toBeGreaterThanOrEqual(70);
    expect(SQUADS.reduce((total, squad) => total + squad.players.length, 0)).toBeGreaterThanOrEqual(1_000);
    for (const squad of SQUADS) {
      expect(squad.players.length).toBeGreaterThanOrEqual(11);
      expect(new Set(squad.players.map((player) => player.characterKey)).size).toBe(squad.players.length);
      expect(new Set(squad.players.map((player) => player.position))).toEqual(new Set(["GK", "DF", "MF", "FW"]));
      squad.players.forEach((player) => expect(player.rating).toBeGreaterThanOrEqual(60));
      squad.players.forEach((player) => expect(player.rating).toBeLessThanOrEqual(97));
    }
    const characterKeys = new Set(SQUADS.flatMap((squad) => squad.players.map((player) => player.characterKey)));
    expect(PORTRAIT_COUNT).toBe(characterKeys.size);
    expect([...characterKeys].every(hasPortrait)).toBe(true);
  });

  it("offers every selectable saga", () => {
    const seasons = new Set(SQUADS.map((squad) => squad.season));
    expect(seasons).toEqual(new Set<SeasonId>(["original", "go", "ares", "orion", "victory", "blue-lock", "captain-tsubasa"]));
  });

  it("offers ten valid tactical shapes and maps every slot to a visible line", () => {
    expect(Object.keys(FORMATIONS)).toHaveLength(10);
    for (const [id, definition] of Object.entries(FORMATIONS)) {
      expect(definition.positions, id).toHaveLength(11);
      expect(definition.lines.flat(), id).toHaveLength(11);
      expect([...definition.lines.flat()].sort(), id).toEqual([...definition.positions].sort());
      expect(definition.positions.filter((position) => position === "GK"), id).toHaveLength(1);
    }
  });

  it("includes the expanded Original catalogue and Knights of Queen", () => {
    const originalSquads = SQUADS.filter((squad) => squad.season === "original");
    expect(originalSquads.length).toBeGreaterThanOrEqual(33);
    expect(originalSquads.some((squad) => squad.name === "Knights of Queen")).toBe(true);
  });

  it("adds exactly as many crossover teams as the complete Inazuma catalogue", () => {
    const inazuma = SQUADS.filter((squad) => franchiseForSeason(squad.season) === "inazuma");
    const blueLock = SQUADS.filter((squad) => squad.season === "blue-lock");
    const captainTsubasa = SQUADS.filter((squad) => squad.season === "captain-tsubasa");
    expect(inazuma).toHaveLength(93);
    expect(blueLock).toHaveLength(41);
    expect(captainTsubasa).toHaveLength(52);
    expect(blueLock.length + captainTsubasa.length).toBe(inazuma.length);
    expect(blueLock.map((squad) => squad.name)).toEqual(expect.arrayContaining(["Team Z", "Blue Lock Eleven", "Bastard München", "Ubers", "Paris X Gen"]));
    expect(captainTsubasa.map((squad) => squad.name)).toEqual(expect.arrayContaining(["Nankatsu SC", "All Japan Youth", "FC Barcelona", "Olympic Spain", "Olympic Brazil"]));
  });

  it("keeps canonical identities, calibrated stars and useful secondary positions", () => {
    const cards = SQUADS.flatMap((squad) => squad.players);
    expect(cards.some((player) => /^\[\d+\]/.test(player.name) || /^unknown name$/i.test(player.name))).toBe(false);
    for (const [name, rating] of [["Noel Noa", 97], ["Michael Kaiser", 95], ["Yoichi Isagi", 94], ["Tsubasa Ozora", 97], ["Genzo Wakabayashi", 95], ["Raika Shinohara", 89]] as const) {
      const versions = cards.filter((player) => player.name === name);
      expect(versions.length).toBeGreaterThan(0);
      expect(Math.max(...versions.map((player) => player.rating))).toBe(rating);
    }
    expect(positionsFor(cards.find((player) => player.name === "Gin Gagamaru")!)).toEqual(expect.arrayContaining(["GK", "FW"]));
    expect(positionsFor(cards.find((player) => player.name === "Reo Mikage")!)).toEqual(expect.arrayContaining(["MF", "DF"]));
    expect(positionsFor(cards.find((player) => player.name === "Tsubasa Ozora")!)).toEqual(expect.arrayContaining(["MF", "FW"]));
    expect(positionsFor(cards.find((player) => player.name === "Ken Wakashimazu")!)).toEqual(expect.arrayContaining(["GK", "FW"]));
  });

  it("enforces a conservative talent pyramid in every saga", () => {
    const limits = new Map([[97, 2], [96, 2], [95, 3], [94, 4], [93, 5], [92, 7], [91, 9], [90, 12], [89, 16], [88, 22]]);
    const identity = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    for (const season of new Set(SQUADS.map((squad) => squad.season))) {
      const groups = new Map<string, number>();
      for (const card of SQUADS.filter((squad) => squad.season === season).flatMap((squad) => squad.players)) {
        const key = identity(card.name);
        groups.set(key, Math.max(groups.get(key) ?? 0, card.rating));
      }
      for (const [rating, limit] of limits) {
        expect([...groups.values()].filter((value) => value === rating).length, `${season} identities rated ${rating}`).toBeLessThanOrEqual(limit);
      }
    }
  });

  it("rates different career stages without inflating every version", () => {
    const cards = SQUADS.flatMap((squad) => squad.players);
    const rating = (name: string, team: string, season: SeasonId) => cards.find((card) => card.name === name && card.team === team && card.season === season)?.rating;
    expect(rating("Mark Evans", "Raimon", "original")).toBeLessThan(rating("Mark Evans", "Inazuma National", "original")!);
    expect(rating("Tsubasa Ozora", "Nankatsu Elementary School", "captain-tsubasa")).toBeLessThan(rating("Tsubasa Ozora", "Olympic Japan", "captain-tsubasa")!);
    expect(rating("Genzo Wakabayashi", "Shutetsu Elementary School", "captain-tsubasa")).toBeLessThan(rating("Genzo Wakabayashi", "Olympic Japan", "captain-tsubasa")!);
  });

  it("applies position and availability per card without hiding other versions", () => {
    const goJude = "go-royal-academy-3956";
    try {
      applyCatalogOverrides({ [goJude]: { position: "FW", enabled: false } });
      expect(getPlayer(goJude)?.position).toBe("FW");
      expect(getSquad("go-royal-academy")?.players.some((player) => player.id === goJude)).toBe(false);
      expect(getSquad("original-royal-academy")?.players.some((player) => player.name === "Jude Sharp")).toBe(true);
    } finally {
      applyCatalogOverrides({});
    }
  });

  it("assigns documented secondary positions to the important versatile characters", () => {
    expect(positionsFor(getPlayer("go-chrono-storm-3903")!)).toEqual(["FW", "MF"]); // Fei Rune
    expect(positionsFor(getPlayer("go-universal-3900")!)).toEqual(["FW", "MF"]); // Sol Daystar
    expect(positionsFor(getPlayer("original-raimon-6")!)).toEqual(expect.arrayContaining(["DF", "MF", "FW"])); // Nathan Swift
    expect(positionsFor(getPlayer("original-inazuma-national-1166")!)).toEqual(expect.arrayContaining(["FW", "DF"])); // Shawn Froste
    expect(positionsFor(getPlayer("go-raimon-first-squad-3901")!)).toEqual(["GK", "DF"]); // Jean-Pierre Lapin
  });

  it("persists a per-card compatible-position override and restores its curated base", () => {
    const id = "go-royal-academy-3956";
    try {
      applyCatalogOverrides({ [id]: { position: "FW", positions: ["FW", "MF", "DF"] } });
      expect(getPlayer(id)).toMatchObject({ position: "FW", positions: ["FW", "MF", "DF"] });
    } finally {
      applyCatalogOverrides({});
    }
    expect(getPlayer(id)).toMatchObject({ position: "MF", positions: ["MF"] });
  });
});

describe("draft and simulation", () => {
  const cards = SQUADS.flatMap((squad) => squad.players);
  const uniqueSingle = (position: "GK" | "DF" | "MF" | "FW", excluded: Set<string>) => {
    const player = cards.find((candidate) => candidate.position === position && positionsFor(candidate).length === 1 && !excluded.has(candidate.characterKey));
    if (!player) throw new Error(`Missing ${position} fixture`);
    excluded.add(player.characterKey);
    return { ...player, positions: positionsFor(player) };
  };

  it("moves Fei from forward to midfield to open a full attacking line", () => {
    const used = new Set<string>();
    const first = uniqueSingle("FW", used);
    const second = uniqueSingle("FW", used);
    const fei = { ...getPlayer("go-chrono-storm-3903")!, positions: ["FW", "MF"] as Position[] };
    used.add(fei.characterKey);
    const incoming = uniqueSingle("FW", used);
    const plan = planDraftPlacement("4-3-3", [first, second, fei], incoming);
    expect(plan).toBeDefined();
    expect(plan?.changes).toEqual([{ playerId: fei.id, playerName: "Fei Rune", from: "FW", to: "MF" }]);
    expect(plan?.picked.position).toBe("FW");
    expect(plan?.lineup.filter((player) => player.position === "FW")).toHaveLength(3);
    expect(plan?.lineup.find((player) => player.id === fei.id)?.positions).toEqual(["FW", "MF"]);
  });

  it("solves a two-player chain and always chooses the minimum number of moves", () => {
    const used = new Set<string>();
    const jp = { ...getPlayer("go-raimon-first-squad-3901")!, position: "GK" as const, positions: ["GK", "DF"] as Position[] };
    used.add(jp.characterKey);
    const nathanSource = cards.find((candidate) => candidate.name === "Nathan Swift" && candidate.position === "DF")!;
    const nathan = { ...nathanSource, positions: ["DF", "MF", "FW"] as Position[] };
    used.add(nathan.characterKey);
    const defenders = [nathan, uniqueSingle("DF", used), uniqueSingle("DF", used), uniqueSingle("DF", used)];
    const goalkeeper = uniqueSingle("GK", used);
    const plan = planDraftPlacement("4-3-3", [jp, ...defenders], goalkeeper);
    expect(plan?.changes).toEqual([
      { playerId: jp.id, playerName: jp.name, from: "GK", to: "DF" },
      { playerId: nathan.id, playerName: nathan.name, from: "DF", to: "MF" },
    ]);
    expect(plan?.picked.position).toBe("GK");
  });

  it("supports safe manual changes and rejects moves into a full line", () => {
    const used = new Set<string>();
    const fei = { ...getPlayer("go-chrono-storm-3903")!, positions: ["FW", "MF"] as Position[] };
    used.add(fei.characterKey);
    const moved = reassignLineupPlayer("4-3-3", [fei], fei.id, "MF");
    expect(moved?.[0]).toMatchObject({ position: "MF", positions: ["FW", "MF"] });
    const fullMidfield = [uniqueSingle("MF", used), uniqueSingle("MF", used), uniqueSingle("MF", used), fei];
    expect(reassignLineupPlayer("4-3-3", fullMidfield, fei.id, "MF")).toBeUndefined();
    expect(reassignLineupPlayer("4-3-3", [fei], fei.id, "GK")).toBeUndefined();
  });

  it("never exceeds formation capacities across every curated flexible card and formation", () => {
    const flexible = cards.filter((player) => positionsFor(player).length > 1);
    for (const formation of Object.keys(FORMATIONS) as FormationId[]) {
      for (const incoming of flexible) {
        const plan = planDraftPlacement(formation, [], incoming);
        expect(plan).toBeDefined();
        expect(positionsFor(incoming)).toContain(plan!.picked.position);
      }
    }
  });

  it("completes hundreds of deterministic mixed-position drafts without invalid assignments", () => {
    for (const formation of Object.keys(FORMATIONS) as FormationId[]) {
      const capacity = FORMATIONS[formation].positions.reduce<Record<string, number>>((counts, position) => {
        counts[position] = (counts[position] ?? 0) + 1;
        return counts;
      }, {});
      for (let run = 0; run < 150; run += 1) {
        const rng = new Random(`flex-draft:${formation}:${run}`);
        const pool = rng.shuffle(cards);
        const used = new Set<string>();
        let lineup = [] as typeof cards;
        while (lineup.length < 11) {
          const candidate = pool.find((player) => !used.has(player.characterKey) && planDraftPlacement(formation, lineup, player));
          expect(candidate).toBeDefined();
          const plan = planDraftPlacement(formation, lineup, candidate!)!;
          lineup = plan.lineup;
          used.add(candidate!.characterKey);
          for (const position of ["GK", "DF", "MF", "FW"] as Position[]) {
            expect(lineup.filter((player) => player.position === position).length).toBeLessThanOrEqual(capacity[position]);
          }
          for (const player of lineup) {
            expect(positionsFor(getPlayer(player.id)!)).toContain(player.position);
          }
        }
        expect(validateLineup(formation, lineup)).toBe(true);
      }
    }
  }, 20_000);
  it("blocks every version of a character across teams only when the unique rule is enabled", () => {
    const versions = SQUADS.flatMap((squad) => squad.players).filter((player) => player.name === "Mark Evans");
    expect(versions.length).toBeGreaterThan(1);
    expect(new Set(versions.map((player) => player.characterKey)).size).toBe(1);
    const members = [{ id: "maria", lineup: [versions[0]] }, { id: "jorge", lineup: [] }];
    expect(isCharacterUnavailable(members, "jorge", versions[1].characterKey, true)).toBe(true);
    expect(isCharacterUnavailable(members, "jorge", versions[1].characterKey, false)).toBe(false);
    expect(isCharacterUnavailable(members, "maria", versions[1].characterKey, false)).toBe(true);
  });

  it("keeps rerolls inside the original season", () => {
    const initial = createRoll(["original", "go"], "roll-seed");
    const second = createRoll(["original", "go"], "reroll-1", initial.season, [initial.squadId], 1);
    const third = createRoll(["original", "go"], "reroll-2", initial.season, [initial.squadId, second.squadId], 0);
    expect(second.season).toBe(initial.season);
    expect(third.season).toBe(initial.season);
    expect(new Set([initial.squadId, second.squadId, third.squadId]).size).toBe(3);
    expect(third.rerollsLeft).toBe(0);
  });

  it("balances franchises before eras", () => {
    const inazumaAndTsubasa: Record<SeasonId, number> = { original: 0, go: 0, ares: 0, orion: 0, victory: 0, "blue-lock": 0, "captain-tsubasa": 0 };
    for (let index = 0; index < 30_000; index += 1) {
      inazumaAndTsubasa[pickBalancedSeason(["original", "go", "captain-tsubasa"], new Random(`two-franchises:${index}`))] += 1;
    }
    expect(inazumaAndTsubasa.original / 30_000).toBeCloseTo(0.25, 1);
    expect(inazumaAndTsubasa.go / 30_000).toBeCloseTo(0.25, 1);
    expect(inazumaAndTsubasa["captain-tsubasa"] / 30_000).toBeCloseTo(0.5, 1);

    const franchises = { inazuma: 0, "blue-lock": 0, "captain-tsubasa": 0 };
    const all = ["original", "go", "ares", "orion", "victory", "blue-lock", "captain-tsubasa"] as SeasonId[];
    for (let index = 0; index < 30_000; index += 1) {
      franchises[franchiseForSeason(pickBalancedSeason(all, new Random(`three-franchises:${index}`)))] += 1;
    }
    for (const count of Object.values(franchises)) expect(count / 30_000).toBeCloseTo(1 / 3, 1);
  });

  it("creates valid CPU teams for every formation", () => {
    for (const formation of Object.keys(FORMATIONS) as FormationId[]) {
      const team = createCpuTeam("CPU", ["original", "go"], formation, "balanced", `cpu-${formation}`);
      expect(validateLineup(formation, team.lineup)).toBe(true);
    }
  });

  it("creates valid CPU teams from each crossover series", () => {
    for (const season of ["blue-lock", "captain-tsubasa"] as SeasonId[]) {
      for (const formation of Object.keys(FORMATIONS) as FormationId[]) {
        const team = createCpuTeam(`${season}-${formation}`, [season], formation, "balanced", `${season}:${formation}`);
        expect(validateLineup(formation, team.lineup)).toBe(true);
      }
    }
  });

  it("is deterministic and always resolves a winner", () => {
    const home = createCpuTeam("Raimon Mix", ["original"], "4-3-3", "offensive", "home");
    const used = new Set(home.lineup.map((player) => player.characterKey));
    const away = createCpuTeam("GO Mix", ["go"], "4-4-2", "defensive", "away", used);
    const first = simulateMatch(home, away, "fixed-match");
    const second = simulateMatch(home, away, "fixed-match");
    expect(first).toEqual(second);
    expect(first.homeScore).not.toBe(first.awayScore);
    expect([home.name, away.name]).toContain(first.winnerName);
    expect(first.events.some((event) => event.type === "goal")).toBe(true);
    expect(first.events.length).toBeGreaterThanOrEqual(9);
    expect(first.events.filter((event) => event.type === "goal" && event.side === "home")).toHaveLength(first.homeScore);
    expect(first.events.filter((event) => event.type === "goal" && event.side === "away")).toHaveLength(first.awayScore);
    expect(first.events.filter((event) => event.type === "momentum")).toHaveLength(4);
  });

  it("resolves brackets of 2, 4, 8 and 16 teams", () => {
    for (const size of [2, 4, 8, 16]) {
      const used = new Set<string>();
      const teams = Array.from({ length: size }, (_, index) => {
        const team = createCpuTeam(`Equipo ${index + 1}`, ["original", "go"], "4-3-3", "balanced", `team-${size}-${index}`, used);
        team.lineup.forEach((player) => used.add(player.characterKey));
        return team;
      });
      const result = simulateTournament(teams, `cup-${size}`);
      expect(result.rounds).toHaveLength(Math.log2(size));
      expect(teams.map((team) => team.name)).toContain(result.champion);
      expect(result.teams?.map((team) => team.name)).toEqual(teams.map((team) => team.name));
      expect(result.teams?.every((team) => team.lineup.length === 11)).toBe(true);
    }
  });

  it("calculates transparent positional and overall rating averages", () => {
    const team = createCpuTeam("Average Test", ["original"], "4-3-3", "balanced", "average-test");
    const ratings = teamRatingAverages(team);
    const expectedOverall = Math.round((team.lineup.reduce((total, player) => total + player.rating, 0) / 11) * 10) / 10;
    expect(ratings.overall).toBe(expectedOverall);
    expect(Object.values(ratings).every((rating) => rating >= 60 && rating <= 99)).toBe(true);
  });
});
