import { GripVertical, Minus, Plus } from "lucide-react";
import { useState, type CSSProperties, type DragEvent } from "react";
import type { AdminPlayerCard } from "../../shared/types";
import { PixelPortrait } from "./PixelPortrait";
import { RATING_TIERS, ratingForTierMove, ratingTierFor } from "../ratingTiers";

const portraitColors: [string, string] = ["#176ed1", "#ffd43b"];

interface AdminTierBoardProps {
  players: AdminPlayerCard[];
  draftRatings: Record<string, number>;
  selectedId?: string;
  busy: boolean;
  onSelect: (playerId?: string) => void;
  onRate: (player: AdminPlayerCard, rating: number) => void;
  text: {
    selected: string;
    base: string;
    current: string;
    moveHere: string;
    empty: string;
    dragHelp: string;
    ratingFor: (name: string) => string;
    tierFor: (tier: string) => string;
  };
}

export function AdminTierBoard({ players, draftRatings, selectedId, busy, onSelect, onRate, text }: AdminTierBoardProps) {
  const [draggedId, setDraggedId] = useState<string>();
  const selected = players.find((player) => player.id === selectedId);
  const effectiveRating = (player: AdminPlayerCard) => draftRatings[player.id] ?? player.rating;

  const setRating = (player: AdminPlayerCard, value: number) => {
    if (!Number.isFinite(value)) return;
    onRate(player, Math.max(1, Math.min(99, Math.round(value))));
  };

  const dropOnTier = (event: DragEvent<HTMLElement>, tierId: string) => {
    event.preventDefault();
    const playerId = event.dataTransfer.getData("text/plain") || draggedId;
    const player = players.find((candidate) => candidate.id === playerId);
    const tier = RATING_TIERS.find((candidate) => candidate.id === tierId);
    setDraggedId(undefined);
    if (player && tier) {
      setRating(player, ratingForTierMove(effectiveRating(player), tier));
      onSelect(player.id);
    }
  };

  return (
    <div className="tier-editor">
      <p className="tier-editor__help"><GripVertical /> {text.dragHelp}</p>

      {selected && (
        <section className="tier-workbench" aria-live="polite">
          <PixelPortrait cardId={selected.id} seed={selected.seed} characterKey={selected.characterKey} name={selected.name} element={selected.element} colors={portraitColors} size="small" />
          <div className="tier-workbench__identity">
            <span>{text.selected}</span>
            <strong>{selected.name}</strong>
            <small>{selected.position} · {text.base} {selected.baseRating}</small>
          </div>
          <div className="tier-stepper">
            <button type="button" aria-label={`-1 ${selected.name}`} disabled={busy || effectiveRating(selected) <= 1} onClick={() => setRating(selected, effectiveRating(selected) - 1)}><Minus /></button>
            <label>
              <span>{text.current}</span>
              <input aria-label={text.ratingFor(selected.name)} type="number" min="1" max="99" inputMode="numeric" value={effectiveRating(selected)} disabled={busy} onChange={(event) => setRating(selected, Number(event.target.value))} />
            </label>
            <button type="button" aria-label={`+1 ${selected.name}`} disabled={busy || effectiveRating(selected) >= 99} onClick={() => setRating(selected, effectiveRating(selected) + 1)}><Plus /></button>
          </div>
        </section>
      )}

      <div className="tier-board">
        {RATING_TIERS.map((tier) => {
          const tierPlayers = players
            .filter((player) => ratingTierFor(effectiveRating(player)).id === tier.id)
            .sort((first, second) => effectiveRating(second) - effectiveRating(first) || first.name.localeCompare(second.name, "es"));
          const canMoveSelected = selected && ratingTierFor(effectiveRating(selected)).id !== tier.id;
          return (
            <section
              className={`tier-lane tier-lane--${tier.id}${draggedId ? " is-dragging" : ""}`}
              style={{ "--tier-color": tier.color } as CSSProperties}
              key={tier.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropOnTier(event, tier.id)}
            >
              <header>
                <strong>{tier.label}</strong>
                <span>{tier.min === tier.max ? tier.min : `${tier.min}–${tier.max}`}</span>
                {canMoveSelected && <button type="button" disabled={busy} aria-label={text.tierFor(tier.label)} onClick={() => setRating(selected, ratingForTierMove(effectiveRating(selected), tier))}>{text.moveHere}</button>}
              </header>
              <div className="tier-lane__cards">
                {tierPlayers.map((player) => {
                  const rating = effectiveRating(player);
                  const changed = draftRatings[player.id] !== undefined;
                  return (
                    <button
                      type="button"
                      className={`tier-card${selectedId === player.id ? " is-selected" : ""}${changed ? " is-changed" : ""}${player.enabled ? "" : " is-disabled"}`}
                      key={player.id}
                      data-card-id={player.id}
                      draggable={!busy}
                      aria-pressed={selectedId === player.id}
                      onClick={() => onSelect(selectedId === player.id ? undefined : player.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", player.id);
                        setDraggedId(player.id);
                        onSelect(player.id);
                      }}
                      onDragEnd={() => setDraggedId(undefined)}
                    >
                      <GripVertical className="tier-card__grip" aria-hidden="true" />
                      <PixelPortrait cardId={player.id} seed={player.seed} characterKey={player.characterKey} name={player.name} element={player.element} colors={portraitColors} size="small" />
                      <span><strong>{player.name}</strong><small>{player.position}{player.enabled ? "" : " · OFF"}</small></span>
                      <b>{rating}</b>
                    </button>
                  );
                })}
                {!tierPlayers.length && <span className="tier-lane__empty">{text.empty}</span>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
