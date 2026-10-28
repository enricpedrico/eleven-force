import { ArrowLeft, KeyRound, Radio, Zap } from "lucide-react";
import { useState } from "react";
import type { FormationId, RoomState, Tactic } from "../../shared/types";
import { api } from "../api";
import { FormationSelector, TacticSelector } from "../components/SetupControls";
import { translatedError, useI18n } from "../i18n";

export function JoinRoomScreen({ initialCode = "", onExit, onJoined }: { initialCode?: string; onExit: () => void; onJoined: (room: RoomState) => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const directInvite = /^[A-Z0-9]{6}$/.test(initialCode.toUpperCase());
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formation, setFormation] = useState<FormationId>("4-3-3");
  const [tactic, setTactic] = useState<Tactic>("balanced");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onJoined(await api.joinRoom(code, { name, password, formation, tactic }));
    } catch (caught) {
      setError(translatedError(caught, t, "error.joinRoom"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="setup-screen join-screen screen-enter">
      <button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.home")}</button>
      <section className="setup-header"><p className="kicker"><Radio /> {t("room.joinKicker")}</p><h1>{t("room.joinTitle")}</h1><p>{t("room.joinLead")}</p></section>
      <form className="join-form panel" onSubmit={submit}>
        {directInvite ? <div className="direct-room-invite"><Radio /><div><strong>{t("room.directInvite")}</strong><span>{t("room.directInviteHelp")}</span></div><b>{code}</b></div> : <label className="code-field"><span>{t("room.code")}</span><input value={code} minLength={6} maxLength={6} required autoCapitalize="characters" placeholder="A7K9P2" onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} /></label>}
        <label><span>{t("room.yourName")}</span><input value={name} maxLength={20} required autoFocus={directInvite} autoComplete="nickname" onChange={(event) => setName(event.target.value)} /></label>
        <label><span><KeyRound /> {t("room.passwordIfAny")}</span><input value={password} type="password" maxLength={64} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} /></label>
        <FormationSelector value={formation} onChange={setFormation} />
        <TacticSelector value={tactic} onChange={setTactic} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button primary-button--large" disabled={busy || code.length !== 6 || !name.trim()}>{busy ? <span className="spinner" /> : <Zap />} {t("room.enter")}</button>
      </form>
    </main>
  );
}
