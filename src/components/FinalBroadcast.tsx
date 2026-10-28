import { FastForward, Pause, Play, Radio, Shield, Sparkles, Trophy, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { DraftTeam, MatchEvent, MatchResult } from "../../shared/types";
import { matchEventText, tacticLabel, teamDisplayName, useI18n } from "../i18n";
import { PixelPortrait } from "./PixelPortrait";

interface FinalBroadcastProps {
  match: MatchResult;
  teams: DraftTeam[];
  onComplete: () => void;
}

const fallbackColors: [string, string] = ["#1674df", "#ffd43b"];

function teamInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function eventIcon(event: MatchEvent) {
  if (event.type === "goal") return <Sparkles />;
  if (event.type === "save") return <Shield />;
  if (event.type === "technique") return <Zap />;
  return <Radio />;
}

export function FinalBroadcast({ match, teams, onComplete }: FinalBroadcastProps) {
  const { t } = useI18n();
  const [minute, setMinute] = useState(0);
  const [paused, setPaused] = useState(false);
  const finalMinute = match.events.some((event) => event.minute > 90) ? 120 : 90;
  const finished = minute >= finalMinute;
  const home = teams.find((team) => team.name === match.homeName);
  const away = teams.find((team) => team.name === match.awayName);
  const revealedEvents = match.events.filter((event) => event.minute <= minute);
  const currentEvent = revealedEvents.at(-1);
  const homeScore = revealedEvents.filter((event) => event.type === "goal" && event.side === "home").length;
  const awayScore = revealedEvents.filter((event) => event.type === "goal" && event.side === "away").length;
  const activeTeam = currentEvent?.side === "home" ? home : currentEvent?.side === "away" ? away : undefined;
  const activePlayer = currentEvent?.playerName ? activeTeam?.lineup.find((player) => player.name === currentEvent.playerName) : undefined;
  const activeSideName = currentEvent?.side === "home" ? match.homeName : match.awayName;
  const phase = finished
    ? t("match.fullTime")
    : minute > 90
      ? t("match.extraTime")
      : minute >= 45
        ? t("match.secondHalf")
        : t("match.firstHalf");

  useEffect(() => {
    if (paused || finished) return undefined;
    const timer = window.setInterval(() => setMinute((current) => Math.min(finalMinute, current + 1)), 115);
    return () => window.clearInterval(timer);
  }, [finalMinute, finished, paused]);

  useEffect(() => {
    if (!finished) return undefined;
    const timer = window.setTimeout(onComplete, 1_800);
    return () => window.clearTimeout(timer);
  }, [finished, onComplete]);

  const eventTypeLabel = currentEvent
    ? t(currentEvent.type === "goal"
      ? "match.goal"
      : currentEvent.type === "save"
        ? "match.save"
        : currentEvent.type === "technique"
          ? "match.specialPlay"
          : "match.pressure")
    : t("match.kickoff");

  return (
    <div className="final-broadcast screen-enter">
      <section className={`final-broadcast__stage${finished ? " is-finished" : ""}`}>
        <header className="final-broadcast__header">
          <div>
            <p className="kicker"><Radio /> {t("match.finalKicker")}</p>
            <h1>{t("match.liveTitle")}</h1>
          </div>
          <button type="button" className="broadcast-skip" onClick={onComplete}>
            <FastForward /> {t("match.skipResult")}
          </button>
        </header>

        <div className="broadcast-scoreboard" aria-label={t("match.liveScoreAria", { home: teamDisplayName(t, match.homeName), away: teamDisplayName(t, match.awayName) })}>
          <article className={currentEvent?.side === "home" ? "is-active" : ""}>
            <i>{teamInitials(teamDisplayName(t, match.homeName))}</i>
            <div><strong>{teamDisplayName(t, match.homeName)}</strong><span>{home ? `${home.formation} · ${tacticLabel(t, home.tactic)}` : ""}</span></div>
          </article>
          <div className="broadcast-score">
            <span>{phase}</span>
            <strong><b>{homeScore}</b><em>:</em><b>{awayScore}</b></strong>
            <time>{String(minute).padStart(2, "0")}'</time>
          </div>
          <article className={currentEvent?.side === "away" ? "is-active" : ""}>
            <i>{teamInitials(teamDisplayName(t, match.awayName))}</i>
            <div><strong>{teamDisplayName(t, match.awayName)}</strong><span>{away ? `${away.formation} · ${tacticLabel(t, away.tactic)}` : ""}</span></div>
          </article>
        </div>

        <div className="broadcast-arena" aria-hidden="true">
          <div className={`broadcast-ball${currentEvent ? ` is-${currentEvent.side}` : ""}`} />
          <i /><i /><i /><i />
        </div>

        <section className={`broadcast-event${currentEvent?.type === "goal" ? " is-goal" : ""}`} aria-live="polite" aria-atomic="true">
          <div className="broadcast-event__portrait">
            {activePlayer
              ? <PixelPortrait cardId={activePlayer.id} seed={activePlayer.seed} characterKey={activePlayer.characterKey} name={activePlayer.name} element={activePlayer.element} colors={fallbackColors} size="large" />
              : <span><Trophy /></span>}
          </div>
          <div className="broadcast-event__copy">
            <p><span>{currentEvent ? `${currentEvent.minute}'` : "00'"}</span>{eventIcon(currentEvent ?? { minute: 0, type: "momentum", side: "home", text: "" })}<strong>{eventTypeLabel}</strong></p>
            <h2>{currentEvent ? matchEventText(t, currentEvent, teamDisplayName(t, activeSideName)) : t("match.kickoffPending")}</h2>
            {activePlayer && <small>{activePlayer.name} · {activePlayer.team}</small>}
          </div>
        </section>

        <div className="broadcast-lower">
          <div className="broadcast-feed" aria-label={t("match.recentEvents")}>
            {revealedEvents.slice(-3).reverse().map((event, index) => (
              <article key={`${event.minute}-${event.type}-${index}`}>
                <time>{event.minute}'</time>
                <span>{matchEventText(t, event, teamDisplayName(t, event.side === "home" ? match.homeName : match.awayName))}</span>
              </article>
            ))}
            {!revealedEvents.length && <p>{t("match.waitingFirstPlay")}</p>}
          </div>
          <div className="broadcast-controls">
            <div
              className="broadcast-progress"
              role="progressbar"
              aria-label={t("match.progressAria")}
              aria-valuemin={0}
              aria-valuemax={finalMinute}
              aria-valuenow={minute}
            >
              <i style={{ width: `${(minute / finalMinute) * 100}%` }} />
              <span className="broadcast-progress__half" />
            </div>
            {finished ? (
              <button type="button" className="primary-button" onClick={onComplete}>{t("match.viewReport")} <FastForward /></button>
            ) : (
              <button type="button" className="secondary-button" aria-pressed={paused} onClick={() => setPaused((current) => !current)}>
                {paused ? <Play /> : <Pause />} {paused ? t("match.resume") : t("match.pause")}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
