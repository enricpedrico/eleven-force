import { ArrowLeft, Check, Clipboard, Clock3, Crown, Dices, Link2, Radio, RotateCcw, ShieldCheck, Sparkles, Users, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SEASONS, applyCatalogOverrides, getSquad, isCharacterUnavailable, openPositions, planDraftPlacement, type DraftPlacementPlan } from "../../shared/catalog";
import type { DraftTeam, PlayerCard, Position, RoomState } from "../../shared/types";
import { api } from "../api";
import { FormationPitch } from "../components/FormationPitch";
import { MatchView } from "../components/MatchView";
import { DraftChoices } from "../components/DraftChoices";
import { DraftRoster } from "../components/DraftRoster";
import { PositionChangeDialog, PositionControls } from "../components/PositionManagement";
import { FormationSelector, TacticSelector } from "../components/SetupControls";
import { tacticLabel, translatedError, useI18n } from "../i18n";

export function RoomScreen({ initialRoom, onExit }: { initialRoom: RoomState; onExit: () => void }) {
  const { t } = useI18n();
  const [room, setRoom] = useState(initialRoom);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState<"" | "code" | "link">("");
  const [error, setError] = useState("");
  const [pendingPlan, setPendingPlan] = useState<DraftPlacementPlan>();
  const [connected, setConnected] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const actionLock = useRef(false);
  const viewer = room.members.find((member) => member.id === room.viewerMemberId);
  const commitRoom = (next: RoomState) => setRoom((current) => next.version >= current.version ? next : current);

  useEffect(() => {
    const stream = new EventSource(`/api/rooms/${room.code}/events`);
    let active = true;
    let serial = 0;
    const refresh = () => {
      const request = ++serial;
      return Promise.all([api.room(room.code), api.catalogConfig()])
      .then(([nextRoom, config]) => {
        if (!active || request !== serial) return;
        applyCatalogOverrides(config.overrides);
        commitRoom(nextRoom);
        setConnected(true);
      })
      .catch(() => { if (active && request === serial) setConnected(false); });
    };
    stream.onopen = refresh;
    stream.onerror = () => { serial++; if (active) setConnected(false); };
    const offline = () => { serial++; setConnected(false); };
    const online = () => setReconnect((value) => value + 1);
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    stream.addEventListener("room", refresh);
    return () => { active = false; stream.close(); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [room.code, reconnect]);

  const action = async (name: string, body: unknown = {}) => {
    if (actionLock.current || !connected) return false;
    actionLock.current = true;
    setBusy(name);
    setError("");
    try {
      commitRoom(await api.mutate(room, name, body));
      return true;
    } catch (caught) {
      setError(translatedError(caught, t, "error.move"));
      return false;
    } finally {
      actionLock.current = false;
      setBusy("");
    }
  };

  const connectionNotice = !connected && <div className="connection-notice" role="status"><Radio /><span>{t("room.reconnecting")}</span><button type="button" onClick={() => setReconnect((value) => value + 1)}>{t("room.retryConnection")}</button></div>;

  const choosePlayer = (player: PlayerCard) => {
    if (!viewer || !isTurn) return;
    const plan = planDraftPlacement(viewer.formation, viewer.lineup, player);
    if (!plan) return;
    if (plan.changes.length) setPendingPlan(plan);
    else void action("pick", { playerId: player.id });
  };

  const copyToClipboard = async (kind: "code" | "link") => {
    const value = kind === "code" ? room.code : `${location.origin}/?room=${encodeURIComponent(room.code)}`;
    setError("");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.readOnly = true;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.append(field);
        field.select();
        const didCopy = document.execCommand("copy");
        field.remove();
        if (!didCopy) throw new Error("Clipboard unavailable");
      }
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? "" : current), 1_500);
    } catch {
      setError(t("error.copy"));
    }
  };

  if (room.status === "complete" && room.results) {
    const memberTeams: DraftTeam[] = room.members.map((member) => ({ name: member.name, formation: member.formation, tactic: member.tactic, lineup: member.lineup }));
    const viewerTeam = memberTeams.find((team) => team.name === viewer?.name);
    return <MatchView results={room.results} viewerTeam={viewerTeam} fallbackTeams={memberTeams} onExit={onExit} />;
  }

  if (room.status === "lobby") {
    return (
      <main className="room-screen screen-enter">
        {connectionNotice}
        <header className="room-header"><button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.leave")}</button><div><p className="kicker"><Radio /> {t("room.live")}</p><h1>{room.title}</h1></div><span className="live-pill"><i /> {t("room.lobby")}</span></header>
        <div className="lobby-layout">
          <section className="room-code-card panel">
            <p>{t("room.code").toUpperCase()}</p><strong>{room.code}</strong>
            <div className="room-share-actions" aria-live="polite">
              <button type="button" className="secondary-button" onClick={() => copyToClipboard("code")}>{copied === "code" ? <Check /> : <Clipboard />} {copied === "code" ? t("room.codeCopied") : t("room.copyCode")}</button>
              <button type="button" className="secondary-button" onClick={() => copyToClipboard("link")}>{copied === "link" ? <Check /> : <Link2 />} {copied === "link" ? t("room.linkCopied") : t("room.copyLink")}</button>
            </div>
            <div className="room-expiry"><Clock3 /> {t("room.expiry")}</div>
            <div className="room-expiry"><ShieldCheck /> {t((room.uniqueCharacters ?? true) ? "room.uniqueRuleOn" : "room.uniqueRuleOff")}</div>
          </section>
          <section className="lobby-members panel">
            <div className="section-title"><div><p className="kicker"><Users /> {t("room.locker")}</p><h2>{t("room.participants", { count: room.members.length })}</h2></div><span>{room.mode === "final" ? `${t("common.final")} / 2` : `${t("common.cup")} / ${room.bracketSize}`}</span></div>
            <div className="member-list">{room.members.map((member, index) => <article key={member.id} className={member.ready ? "is-ready" : ""}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{member.name} {member.isHost && <Crown />}</strong><small>{member.formation} · {tacticLabel(t, member.tactic)}</small></div><b>{member.ready ? t("room.ready") : t("room.adjusting")}</b></article>)}</div>
          </section>
        </div>
        {viewer && <section className="lobby-controls panel"><div className="section-title"><div><p className="kicker">{t("room.myTeam")}</p><h2>{t("room.lastAdjustments")}</h2></div></div><div className="setup-split"><FormationSelector value={viewer.formation} onChange={(formation) => action("profile", { formation })} /><TacticSelector value={viewer.tactic} onChange={(tactic) => action("profile", { tactic })} /></div><div className="lobby-actions"><button type="button" className={viewer.ready ? "ready-button is-ready" : "ready-button"} onClick={() => action("profile", { ready: !viewer.ready })}>{viewer.ready ? <Check /> : <ShieldCheck />} {viewer.ready ? t("room.prepared") : t("room.markPrepared")}</button>{viewer.isHost && <button type="button" className="primary-button" disabled={busy === "start"} onClick={() => action("start")}><Zap /> {t("room.start")}</button>}</div></section>}
        {error && <p className="form-error floating-error" role="alert">{error}</p>}
      </main>
    );
  }

  const active = room.members.find((member) => member.id === room.currentMemberId);
  const isTurn = viewer?.id === active?.id;
  const squad = room.roll ? getSquad(room.roll.squadId) : undefined;
  const season = SEASONS.find((candidate) => candidate.id === room.roll?.season);
  return (
    <main className="draft-screen room-draft screen-enter">
      {connectionNotice}
      <header className="draft-header"><button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.leave")}</button><div><p className="kicker"><Radio /> {room.code} / {t("room.liveTurn")}</p><h1>{room.title}</h1></div><div className="turn-indicator"><span>{t("room.playingNow")}</span><strong>{active?.name}</strong><i className={isTurn ? "is-mine" : ""} /></div></header>
      <div className="draft-layout">
        <section className="draft-console panel">
          {!room.roll || !squad ? (
            <div className="roll-idle"><div className="dice-orbit"><Dices /><i /><i /></div>{isTurn ? <><p>{t("room.yourTurn", { pick: (viewer?.lineup.length ?? 0) + 1 })}</p><h2>{t("room.rollSquad")}</h2><button type="button" className="primary-button primary-button--large" disabled={Boolean(busy) || !connected} onClick={() => action("roll")}><Dices /> {t("solo.roll")}</button></> : <><p>{t("room.waitingSignal")}</p><h2>{t("room.choosing", { name: active?.name ?? "" })}</h2><div className="waiting-pulse"><i /><i /><i /></div></>}</div>
          ) : <>
            <div className="roll-result" style={{ "--team-primary": squad.colors[0], "--team-secondary": squad.colors[1] } as React.CSSProperties}><div><p className="kicker"><Sparkles /> {season?.shortLabel} / {t("room.turnOf", { name: active?.name ?? "" })}</p><h2>{squad.name}</h2><small>{t("room.rollSummary", { cards: squad.players.length, rerolls: room.roll.rerollsLeft })}</small></div>{isTurn && <button type="button" className="reroll-button" disabled={room.roll.rerollsLeft === 0 || Boolean(busy) || !connected} onClick={() => action("reroll")}><RotateCcw /><strong>{t("common.reroll")}</strong><span>{t("common.remaining", { count: room.roll.rerollsLeft })}</span></button>}</div>
            <div className="reroll-rule"><Zap /> {t("room.rerollRule")}</div>
            <DraftChoices key={`${room.currentMemberId}:${room.roll.squadId}:${room.roll.rerollsLeft}`} needs={active ? openPositions(active.formation, active.lineup) : []} showRatings={room.showRatings} locked={Boolean(busy) || !isTurn || !connected} onPick={choosePlayer} choices={squad.players.map((player) => {
              const duplicate = active ? isCharacterUnavailable(room.members, active.id, player.characterKey, room.uniqueCharacters ?? true) : false;
              const plan = active ? planDraftPlacement(active.formation, active.lineup, player) : undefined;
              return { player, unavailable: duplicate || !plan, reason: duplicate ? t("room.alreadyPicked") : !plan ? t("room.positionClosed") : !isTurn ? t("room.turnOf", { name: active?.name ?? "" }) : undefined, adjustment: Boolean(plan?.changes.length) };
            })} />
          </>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>
        <DraftRoster count={viewer?.lineup.length ?? 0} multiplayer>
          {room.members.map((member) => (
            <div className={`member-team-card${member.id === active?.id ? " is-active" : ""}`} key={member.id}>
              <div><strong>{member.name}</strong><span>{member.lineup.length}/11 · {member.formation}</span></div>
              <div className="mini-slots">{Array.from({ length: 11 }, (_, index) => <i className={index < member.lineup.length ? "is-filled" : ""} key={index} />)}</div>
              {member.id === viewer?.id && (
                <>
                  <FormationPitch formation={member.formation} lineup={member.lineup} compact showRatings={room.showRatings} />
                  <PositionControls formation={member.formation} lineup={member.lineup} disabled={Boolean(busy)} onChange={(playerId: string, position: Position) => { void action("position", { playerId, position }); }} />
                </>
              )}
            </div>
          ))}
        </DraftRoster>
      </div>
      {pendingPlan && <PositionChangeDialog plan={pendingPlan} busy={busy === "pick"} onCancel={() => setPendingPlan(undefined)} onConfirm={() => { void action("pick", { playerId: pendingPlan.picked.id, confirmReassignment: true }).then((success) => { if (success) setPendingPlan(undefined); }); }} />}
    </main>
  );
}
