export interface RatingTier {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
}

export const RATING_TIERS: readonly RatingTier[] = [
  { id: "legend", label: "LEGEND", min: 97, max: 99, color: "#ffcf33" },
  { id: "s-plus", label: "S+", min: 94, max: 96, color: "#ff704d" },
  { id: "s", label: "S", min: 90, max: 93, color: "#ff4f85" },
  { id: "a", label: "A", min: 86, max: 89, color: "#b980ff" },
  { id: "b", label: "B", min: 82, max: 85, color: "#4fd8ff" },
  { id: "c", label: "C", min: 78, max: 81, color: "#63ecb5" },
  { id: "d", label: "D", min: 74, max: 77, color: "#a7f52b" },
  { id: "e", label: "E", min: 60, max: 73, color: "#c2cfdf" },
  { id: "f", label: "F", min: 1, max: 59, color: "#71859d" },
];

export function ratingTierFor(rating: number): RatingTier {
  return RATING_TIERS.find((tier) => rating >= tier.min && rating <= tier.max) ?? RATING_TIERS[RATING_TIERS.length - 1];
}

/** Keeps the current score when possible and otherwise moves it to the closest edge. */
export function ratingForTierMove(rating: number, tier: RatingTier): number {
  return Math.max(tier.min, Math.min(tier.max, rating));
}
