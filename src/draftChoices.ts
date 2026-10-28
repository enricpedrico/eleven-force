import { positionsFor } from "../shared/catalog";
import type { PlayerCard, Position } from "../shared/types";

export interface DraftChoice { player: PlayerCard; unavailable: boolean; reason?: string; adjustment: boolean }
export function filterDraftChoices(choices: DraftChoice[], query: string, position: Position | "all", availableOnly: boolean): DraftChoice[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
  const search = normalize(query.trim());
  return choices.filter(({ player, unavailable }) => (!availableOnly || !unavailable)
    && (position === "all" || positionsFor(player).includes(position))
    && (!search || normalize(player.name).includes(search)))
    .sort((left, right) => Number(left.unavailable) - Number(right.unavailable));
}
