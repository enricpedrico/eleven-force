import { describe, expect, it } from "vitest";
import { RATING_TIERS, ratingForTierMove, ratingTierFor } from "../src/ratingTiers";

describe("rating tier editor", () => {
  it("covers every editable rating exactly once", () => {
    for (let rating = 1; rating <= 99; rating += 1) {
      const matching = RATING_TIERS.filter((tier) => rating >= tier.min && rating <= tier.max);
      expect(matching, `rating ${rating}`).toHaveLength(1);
      expect(ratingTierFor(rating)).toBe(matching[0]);
    }
  });

  it("uses the conservative football rating bands", () => {
    expect(ratingTierFor(97).label).toBe("LEGEND");
    expect(ratingTierFor(94).label).toBe("S+");
    expect(ratingTierFor(90).label).toBe("S");
    expect(ratingTierFor(88).label).toBe("A");
    expect(ratingTierFor(82).label).toBe("B");
    expect(ratingTierFor(60).label).toBe("E");
    expect(ratingTierFor(59).label).toBe("F");
  });

  it("moves a card to the closest edge of the requested tier", () => {
    const elite = RATING_TIERS.find((tier) => tier.id === "s-plus")!;
    const solid = RATING_TIERS.find((tier) => tier.id === "b")!;
    expect(ratingForTierMove(88, elite)).toBe(94);
    expect(ratingForTierMove(97, solid)).toBe(85);
    expect(ratingForTierMove(83, solid)).toBe(83);
  });
});
