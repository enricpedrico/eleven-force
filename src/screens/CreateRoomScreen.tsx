import { ArrowLeft, Lock, Radio, Swords, Trophy, Users, Zap } from "lucide-react";
import { useState } from "react";
import type { FormationId, RoomMode, RoomState, SeasonId, Tactic } from "../../shared/types";
import { api } from "../api";
import { FormationSelector, RatingToggle, SeasonSelector, TacticSelector, UniqueCharactersToggle } from "../components/SetupControls";
import { translatedError, useI18n } from "../i18n";

export function CreateRoomScreen({ onExit, onCreated }: { onExit: () => void; onCreated: (room: RoomState) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(() => t("room.defaultTitle"));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<RoomMode>("cup");
  const [bracketSize, setBracketSize] = useState<4 | 8 | 16>(4);
  const [seasons, setSeasons] = useState<SeasonId[]>(["original", "go"]);
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [tactic, setTactic] = useState<Tactic>("balanced");
  const [showRatings, setShowRatings] = useState(true);
  const [uniqueCharacters, setUniqueCharacters] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const room = await api.createRoom({ title, name, password, mode, bracketSize, seasons, formation, tactic, showRatings, uniqueCharacters });
      onCreated(room);
    } catch (caught) {
      setError(translatedError(caught, t, "error.createRoom"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup-screen screen-enter">
      <button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.home")}</button>
      <section className="setup-header"><p className="kicker"><Radio /> {t("room.createKicker")}</p><h1>{t("room.createTitle")}</h1><p>{t("room.createLead")}</p></section>
      <form className="room-form panel" onSubmit={submit}>
        <div className="field-row">
          <label><span>{t("room.name")}</span><input value={title} maxLength={32} required onChange={(event) => setTitle(event.target.value)} /></label>
          <label><span>{t("room.yourName")}</span><input value={name} maxLength={20} required autoComplete="nickname" placeholder={t("room.nameExample")} onChange={(event) => setName(event.target.value)} /></label>
        </div>
        <fieldset className="setup-fieldset"><legend>{t("room.format")}</legend><div className="mode-options competition-options">
          <button type="button" className={mode === "final" ? "is-active" : ""} onClick={() => setMode("final")}><Swords /><span><strong>{t("room.directFinal")}</strong><small>{t("room.directFinalHelp")}</small></span></button>
          <button type="button" className={mode === "cup" ? "is-active" : ""} onClick={() => setMode("cup")}><Trophy /><span><strong>{t("room.fullCup")}</strong><small>{t("room.fullCupHelp")}</small></span></button>
        </div></fieldset>
        {mode === "cup" && <fieldset className="setup-fieldset"><legend>{t("room.bracketSize")}</legend><div className="segmented-grid bracket-options">{([4, 8, 16] as const).map((size) => <button type="button" className={bracketSize === size ? "is-active" : ""} onClick={() => setBracketSize(size)} key={size}><Users /> {t("room.teamCount", { count: size })}</button>)}</div></fieldset>}
        <SeasonSelector selected={seasons} onChange={setSeasons} />
        <div className="setup-split"><FormationSelector value={formation} onChange={setFormation} /><TacticSelector value={tactic} onChange={setTactic} /></div>
        <RatingToggle value={showRatings} onChange={setShowRatings} />
        <UniqueCharactersToggle value={uniqueCharacters} onChange={setUniqueCharacters} />
        <label className="password-field"><span><Lock /> {t("room.optionalPassword")}</span><input type="password" value={password} maxLength={64} autoComplete="new-password" placeholder={t("room.passwordEmpty")} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button primary-button--large" disabled={busy || !name.trim() || !title.trim()}>{busy ? <span className="spinner" /> : <Zap />} {t("room.create")}</button>
      </form>
    </main>
  );
}
