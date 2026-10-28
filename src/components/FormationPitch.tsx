import { FORMATIONS } from "../../shared/catalog";
import type { DraftTeam, FormationId, PlayerCard } from "../../shared/types";
import { PixelPortrait } from "./PixelPortrait";
import { useI18n } from "../i18n";

interface FormationPitchProps {
  formation: FormationId;
  lineup: PlayerCard[];
  compact?: boolean;
  title?: string;
  showRatings?: boolean;
}

const fallbackColors: [string, string] = ["#1674df", "#ffd43b"];

export function FormationPitch({ formation, lineup, compact = false, title, showRatings = true }: FormationPitchProps) {
  const { t } = useI18n();
  const definition = FORMATIONS[formation];
  const consumed = new Set<number>();
  const positionedLines = definition.lines.map((line) => line.map((position) => {
      const index = lineup.findIndex((player, playerIndex) => player.position === position && !consumed.has(playerIndex));
      if (index < 0) return { position };
      consumed.add(index);
      return { position, player: lineup[index] };
    }));

  return (
    <section className={`formation-pitch formation-pitch--${definition.lines.length}-lines${compact ? " formation-pitch--compact" : ""}`}>
      {title && <div className="formation-pitch__title"><span>{t("formation.map")}</span><strong>{title}</strong></div>}
      <div className="pitch-markings" aria-hidden="true"><i /><i /><i /></div>
      {positionedLines.map((line, lineIndex) => (
        <div className="pitch-row" key={`${formation}-${lineIndex}`}>
          {line.map((slot, slotIndex) => (
            <div className={`pitch-slot${slot.player ? " is-filled" : ""}`} key={`${slot.position}-${slotIndex}`}>
              {slot.player ? (
                <>
                  <PixelPortrait cardId={slot.player.id} seed={slot.player.seed} characterKey={slot.player.characterKey} name={slot.player.name} element={slot.player.element} colors={fallbackColors} size="small" />
                  <strong>{slot.player.name.split(" ").at(-1)}</strong>
                  <span aria-label={showRatings ? undefined : t("card.hiddenRating")}>{showRatings ? slot.player.rating : "??"}</span>
                </>
              ) : <b>{slot.position}</b>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export function TeamSummary({ team }: { team: DraftTeam }) {
  return <FormationPitch formation={team.formation} lineup={team.lineup} compact title={team.name} />;
}
