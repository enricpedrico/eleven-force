import { Check, Eye, EyeOff, Shield, Swords, Zap } from "lucide-react";
import { FORMATIONS, SEASONS } from "../../shared/catalog";
import type { FormationId, SeasonId, Tactic } from "../../shared/types";
import { useI18n } from "../i18n";

export function SeasonSelector({ selected, onChange }: { selected: SeasonId[]; onChange: (seasons: SeasonId[]) => void }) {
  const { t } = useI18n();
  const toggle = (season: SeasonId) => {
    if (selected.includes(season)) {
      if (selected.length > 1) onChange(selected.filter((candidate) => candidate !== season));
    } else onChange([...selected, season]);
  };
  return (
    <fieldset className="setup-fieldset">
      <legend>{t("setup.sagas")}</legend>
      <p>{t("setup.sagasHelp")}</p>
      <div className="season-grid">
        {SEASONS.map((season) => {
          const active = selected.includes(season.id);
          return (
            <button type="button" className={`season-option${active ? " is-active" : ""}`} onClick={() => toggle(season.id)} key={season.id} style={{ "--season-color": season.color } as React.CSSProperties}>
              <i>{active && <Check />}</i><strong>{season.shortLabel}</strong><span>{season.years}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormationSelector({ value, onChange }: { value: FormationId; onChange: (formation: FormationId) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="setup-fieldset">
      <legend>{t("setup.formation")}</legend>
      <div className="segmented-grid formation-options">
        {(Object.keys(FORMATIONS) as FormationId[]).map((formation) => (
          <button type="button" className={formation === value ? "is-active" : ""} onClick={() => onChange(formation)} key={formation}>
            {FORMATIONS[formation].label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function TacticSelector({ value, onChange }: { value: Tactic; onChange: (tactic: Tactic) => void }) {
  const { t } = useI18n();
  const values: { id: Tactic; label: string; icon: typeof Shield }[] = [
    { id: "defensive", label: t("setup.defensive"), icon: Shield },
    { id: "balanced", label: t("setup.balanced"), icon: Zap },
    { id: "offensive", label: t("setup.offensive"), icon: Swords },
  ];
  return (
    <fieldset className="setup-fieldset">
      <legend>{t("setup.gamePlan")}</legend>
      <div className="segmented-grid tactic-options">
        {values.map(({ id, label, icon: Icon }) => (
          <button type="button" className={id === value ? "is-active" : ""} onClick={() => onChange(id)} key={id}><Icon /> {label}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function RatingToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="setup-fieldset">
      <legend>{t("setup.cardInfo")}</legend>
      <div className="mode-options">
        <button type="button" className={value ? "is-active" : ""} onClick={() => onChange(true)}><Eye /><span><strong>{t("setup.tactical")}</strong><small>{t("setup.tacticalHelp")}</small></span></button>
        <button type="button" className={!value ? "is-active" : ""} onClick={() => onChange(false)}><EyeOff /><span><strong>{t("setup.memory")}</strong><small>{t("setup.memoryHelp")}</small></span></button>
      </div>
    </fieldset>
  );
}

export function UniqueCharactersToggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  return (
    <fieldset className="setup-fieldset">
      <legend>{t("setup.unique")}</legend>
      <div className="mode-options">
        <button type="button" className={value ? "is-active" : ""} onClick={() => onChange(true)}><Shield /><span><strong>{t("setup.uniqueOn")}</strong><small>{t("setup.uniqueOnHelp")}</small></span></button>
        <button type="button" className={!value ? "is-active" : ""} onClick={() => onChange(false)}><Swords /><span><strong>{t("setup.uniqueOff")}</strong><small>{t("setup.uniqueOffHelp")}</small></span></button>
      </div>
    </fieldset>
  );
}
