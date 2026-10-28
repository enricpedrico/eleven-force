import { describe, expect, it } from "vitest";
import { SQUADS } from "../shared/catalog";
import type { MatchEvent } from "../shared/types";
import { matchEventText, type Translate } from "../src/i18n";
import { ca, en, es, messages, type MessageKey } from "../src/messages";

describe("interface languages", () => {
  it("has the same complete key set in Spanish, Catalan and English", () => {
    const expected = Object.keys(es).sort();
    expect(Object.keys(ca).sort()).toEqual(expected);
    expect(Object.keys(en).sort()).toEqual(expected);
    expect(Object.keys(messages)).toEqual(["es", "ca", "en"]);
  });

  it("translates match narration without changing character names", () => {
    const playerName = SQUADS.flatMap((squad) => squad.players).find((player) => player.name === "Mark Evans")!.name;
    const event: MatchEvent = { minute: 31, type: "goal", side: "home", playerName, text: "legacy text" };
    for (const dictionary of [es, ca, en]) {
      const t: Translate = (key: MessageKey, parameters = {}) => dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => String(parameters[name] ?? match));
      expect(matchEventText(t, event, "Team")).toContain(playerName);
    }
  });
});
