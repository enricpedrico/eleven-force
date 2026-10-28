import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SQUADS, portraitSource } from "../shared/catalog";
import { createCpuTeam, simulateTournament } from "../shared/game";
import { FormationPitch } from "../src/components/FormationPitch";
import { PlayerCardView } from "../src/components/PlayerCardView";
import { I18nProvider } from "../src/i18n";
import { filterDraftChoices } from "../src/draftChoices";
import { parseSoloSession, type SoloSnapshot } from "../src/soloSession";
import { ca, en } from "../src/messages";

const squad = SQUADS.find((s) => s.season === "original")!;
const player = squad.players[0];
const base: SoloSnapshot = { version: 1, phase: "draft", seed: "test-save", seasons: ["original", "go"], formation: "4-3-3", tactic: "balanced", showRatings: false, uniqueCharacters: true, lineup: [], turn: 0, roll: { season: "original", squadId: squad.id, rerollsLeft: 0 }, rollHistory: [squad.id, squad.id, squad.id] };

describe("product regression coverage", () => {
  it("uses the correct Ares timeline portrait without changing original Xavier", () => {
    expect(portraitSource("xavier-schiller", "ares-alia-academy-4556")).toBe("/portraits/xavier-schiller-ares.webp");
    expect(portraitSource("xavier-schiller", "orion-inazuma-national-4556")).toBe("/portraits/xavier-schiller-ares.webp");
    expect(portraitSource("xavier-foster", "original-inazuma-national-1774")).toBe("/portraits/xavier-foster.webp");
    expect(portraitSource("xavier-schiller")).toBe("/portraits/xavier-schiller.webp");
  });
  it("hides ratings both on cards and on the pitch in memory mode", () => {
    const masked = renderToStaticMarkup(<I18nProvider><FormationPitch formation="4-3-3" lineup={[player]} showRatings={false}/><PlayerCardView player={player} showRating={false}/></I18nProvider>);
    expect(masked).toContain("??");
    expect(masked).not.toContain(`>${player.rating}<`);
    const revealed = renderToStaticMarkup(<I18nProvider><FormationPitch formation="4-3-3" lineup={[player]}/></I18nProvider>);
    expect(revealed).toContain(`>${player.rating}<`);
  });
  it("filters secondary positions, accents and unavailable cards without leaking ranking", () => {
    const first = { player: { ...player, name: "Féi Rune", position: "FW" as const, positions: ["FW", "MF"] as ("FW" | "MF")[], rating: 61 }, unavailable: false, adjustment: true };
    const second = { ...first, player: { ...first.player, name: "Fei Other", rating: 99 } };
    const locked = { ...first, unavailable: true };
    expect(filterDraftChoices([first, second, locked], "fei", "MF", true)).toEqual([first, second]);
    expect(filterDraftChoices([locked, first], "FÉI RUNE", "all", false)).toEqual([first, locked]);
    expect(filterDraftChoices([first], "absent", "all", false)).toEqual([]);
    expect(filterDraftChoices([first], "", "GK", false)).toEqual([]);
  });
  it("keeps new labels translated instead of overwriting them with Spanish defaults", () => {
    expect(ca["solo.resume"]).toBe("Continua el draft");
    expect(en["draft.search"]).toBe("Search players");
  });
});

describe("solo autosave", () => {
  it("preserves consumed rerolls, seed and drafted manual ratings", () => {
    const value = { ...base, lineup: [{ ...player, rating: 42 }], turn: 1 };
    expect(parseSoloSession(JSON.stringify(value))).toEqual(value);
  });
  it("roundtrips a complete simulated final with both teams and timeline", () => {
    const home = createCpuTeam("Maria", ["original"], "4-3-3", "balanced", "save-home");
    const opponent = createCpuTeam("Jorge", ["go"], "4-3-3", "balanced", "save-away", new Set(home.lineup.map((p) => p.characterKey)));
    const results = simulateTournament([home, opponent], "save-final");
    const value = { ...base, phase: "result", lineup: home.lineup, turn: 11, roll: undefined, rollHistory: [], opponent, results };
    expect(parseSoloSession(JSON.stringify(value))).toEqual(value);
  });
  it("rejects corrupt, oversized, unknown, duplicate and inconsistent saves safely", () => {
    for (const value of [null, "{", "x".repeat(1_000_001), JSON.stringify({ ...base, version: 2 }), JSON.stringify({ ...base, turn: 10 }), JSON.stringify({ ...base, lineup: [player, player], turn: 2 }), JSON.stringify({ ...base, lineup: [{ ...player, id: "nonexistent" }], turn: 1 }), JSON.stringify({ ...base, roll: { ...base.roll, rerollsLeft: 3 } }), JSON.stringify({ ...base, phase: "result" })]) expect(parseSoloSession(value)).toBeUndefined();
  });
});
