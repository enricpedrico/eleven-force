import { ArrowRight, Check, RefreshCw, X } from "lucide-react";
import { positionsFor, reassignLineupPlayer, type DraftPlacementPlan } from "../../shared/catalog";
import type { FormationId, PlayerCard, Position } from "../../shared/types";
import { useI18n } from "../i18n";
import { Dialog } from "./Dialog";

export function PositionChangeDialog({
  plan,
  onCancel,
  onConfirm,
  busy = false,
}: {
  plan: DraftPlacementPlan;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Dialog className="position-dialog" title={t("draft.confirmChange")} close={onCancel} busy={busy}>
        <p className="kicker"><RefreshCw /> {t("draft.tacticalChange")}</p>
        <p>{t("draft.confirmChangeHelp", { name: plan.picked.name })}</p>
        <div className="position-change-list">
          {plan.changes.map((change) => (
            <article key={change.playerId}>
              <div><strong>{change.playerName}</strong><span>{t("draft.movesTo")}</span></div>
              <b className={`position-token position-token--${change.from.toLowerCase()}`}>{change.from}</b>
              <ArrowRight />
              <b className={`position-token position-token--${change.to.toLowerCase()}`}>{change.to}</b>
            </article>
          ))}
          <article className="is-signing">
            <div><strong>{plan.picked.name}</strong><span>{t("draft.newSigning")}</span></div>
            <b className={`position-token position-token--${plan.picked.position.toLowerCase()}`}>{plan.picked.position}</b>
          </article>
        </div>
        <div className="position-dialog__actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={onConfirm}><Check /> {busy ? t("draft.applying") : t("draft.confirmSigning")}</button>
        </div>
    </Dialog>
  );
}

export function PositionControls({
  formation,
  lineup,
  disabled = false,
  onChange,
}: {
  formation: FormationId;
  lineup: PlayerCard[];
  disabled?: boolean;
  onChange: (playerId: string, position: Position) => void;
}) {
  const { t } = useI18n();
  const flexible = lineup.filter((player) => positionsFor(player).length > 1);
  if (!flexible.length) return null;
  return (
    <section className="position-controls panel">
      <div><p className="kicker">{t("draft.flexiblePlayers")}</p><span>{t("draft.flexiblePlayersHelp")}</span></div>
      <div className="position-controls__list">
        {flexible.map((player) => (
          <article key={player.id}>
            <strong>{player.name}</strong>
            <div role="group" aria-label={t("draft.positionFor", { name: player.name })}>
              {positionsFor(player).map((position) => {
                const available = Boolean(reassignLineupPlayer(formation, lineup, player.id, position));
                return <button type="button" key={position} className={player.position === position ? "is-active" : ""} aria-pressed={player.position === position} disabled={disabled || player.position === position || !available} onClick={() => onChange(player.id, position)}>{position}</button>;
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
