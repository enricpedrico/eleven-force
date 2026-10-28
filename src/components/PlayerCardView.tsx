import { LockKeyhole, Plus } from "lucide-react";
import { getSquad, positionsFor } from "../../shared/catalog";
import type { PlayerCard } from "../../shared/types";
import { PixelPortrait } from "./PixelPortrait";
import { useI18n } from "../i18n";

interface PlayerCardViewProps {
  player: PlayerCard;
  showRating: boolean;
  disabled?: boolean;
  selected?: boolean;
  reason?: string;
  requiresReassignment?: boolean;
  onPick?: () => void;
}

export function PlayerCardView({ player, showRating, disabled, selected, reason, requiresReassignment, onPick }: PlayerCardViewProps) {
  const { t } = useI18n();
  const elementLabels = { Fire: t("card.fire"), Wind: t("card.wind"), Forest: t("card.forest"), Mountain: t("card.mountain") } as const;
  const squad = getSquad(player.id.slice(0, player.id.lastIndexOf("-")));
  const colors = squad?.colors ?? ["#1a70d8", "#ffd43b"];
  const content = (
    <>
      <div className="player-card__portrait">
        <PixelPortrait cardId={player.id} seed={player.seed} characterKey={player.characterKey} name={player.name} element={player.element} colors={colors} />
        <span className={`position-chip position-chip--${player.position.toLowerCase()}`}>{positionsFor(player).join("/")}</span>
      </div>
      <div className="player-card__copy">
        <strong>{player.name}</strong>
        <span>{player.team}</span>
        <small>{elementLabels[player.element]}</small>
      </div>
      <div className="player-card__rating" aria-label={showRating ? t("card.rating", { rating: player.rating }) : t("card.hiddenRating")}>
        <span>{showRating ? player.rating : "??"}</span>
        <small>{t("common.power")}</small>
      </div>
      {onPick && <span className="player-card__action">{disabled ? <LockKeyhole /> : <Plus />}</span>}
      {requiresReassignment && !disabled && <span className="player-card__flex">{t("draft.positionSwitch")}</span>}
      {reason && disabled && <span className="player-card__reason">{reason}</span>}
    </>
  );

  return onPick ? (
    <button type="button" className={`player-card${selected ? " is-selected" : ""}`} disabled={disabled} onClick={onPick}>
      {content}
    </button>
  ) : (
    <div className={`player-card${selected ? " is-selected" : ""}`}>{content}</div>
  );
}
