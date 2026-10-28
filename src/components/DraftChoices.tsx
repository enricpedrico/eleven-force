import { useId, useState } from "react";
import { Search, X } from "lucide-react";
import type { PlayerCard, Position } from "../../shared/types";
import { POSITION_IDS } from "../../shared/catalog";
import { useI18n } from "../i18n";
import { filterDraftChoices, type DraftChoice } from "../draftChoices";
import { PlayerCardView } from "./PlayerCardView";

export function DraftChoices({ choices, needs, showRatings, locked = false, onPick }: { choices: DraftChoice[]; needs: Position[]; showRatings: boolean; locked?: boolean; onPick: (player: PlayerCard) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "all">("all");
  const [availableOnly, setAvailableOnly] = useState(true);
  const visible = filterDraftChoices(choices, query, position, availableOnly);
  const available = choices.filter((choice) => !choice.unavailable).length;
  const reset = () => { setQuery(""); setPosition("all"); setAvailableOnly(true); };
  return <div className="draft-picker">
    <div className="picker-toolbar">
      <div className="picker-search"><Search /><label className="sr-only" htmlFor={id}>{t("draft.search")}</label><input id={id} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("draft.search")} />{query && <button type="button" aria-label={t("draft.clearSearch")} onClick={() => setQuery("")}><X /></button>}</div>
      <div className="picker-positions" role="group" aria-label={t("draft.filterPosition")}>{(["all", ...POSITION_IDS] as const).map((role) => <button type="button" key={role} aria-label={role === "all" ? t("draft.allPositions") : t("draft.positionFilter", { position: role, count: needs.filter((p) => p === role).length })} aria-pressed={position === role} onClick={() => setPosition(role)}>{role === "all" ? t("draft.allPositions") : <>{role}<small>{needs.filter((p) => p === role).length}</small></>}</button>)}</div>
      <div className="picker-meta"><label><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} />{t("draft.availableOnly")}</label><span aria-live="polite">{t("draft.availableCount", { count: available, total: choices.length })}</span></div>
    </div>
    {visible.length ? <div className="cards-grid">{visible.map(({ player, unavailable, reason, adjustment }) => <PlayerCardView key={player.id} player={player} showRating={showRatings} disabled={locked || unavailable} reason={reason} requiresReassignment={adjustment} onPick={() => onPick(player)} />)}</div>
      : <div className="picker-empty"><Search /><strong>{t("draft.noMatches")}</strong><p>{t("draft.noMatchesHelp")}</p><button type="button" className="secondary-button" onClick={reset}>{t("draft.resetFilters")}</button></div>}
  </div>;
}
