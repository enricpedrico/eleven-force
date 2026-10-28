import { BarChart3, ChevronRight, Crown, Eye, ListTree, Trophy, Users } from "lucide-react";
import { useState } from "react";
import type { DraftTeam, TournamentResult } from "../../shared/types";
import { teamRatingAverages } from "../../shared/game";
import { tacticLabel, teamDisplayName, useI18n } from "../i18n";
import { FinalBroadcast } from "./FinalBroadcast";
import { FormationPitch } from "./FormationPitch";

interface MatchViewProps {
  results: TournamentResult;
  viewerTeam?: DraftTeam;
  fallbackTeams?: DraftTeam[];
  onExit?: () => void;
  onReplay?: () => void;
  onConfigure?: () => void;
}

type ReportTab = "lineups" | "comparison" | "bracket";
const positionOrder = ["GK", "DF", "MF", "FW"] as const;
const watchedFinalKey = "eleven-force-watched-final";

function hasSameLineup(first: DraftTeam, second: DraftTeam): boolean {
  const firstIds = new Set(first.lineup.map((player) => player.id));
  return firstIds.size === second.lineup.length && second.lineup.every((player) => firstIds.has(player.id));
}

export function MatchView({ results, viewerTeam, fallbackTeams = [], onExit, onReplay, onConfigure }: MatchViewProps) {
  const { language, t } = useI18n();
  const final = results.rounds.at(-1)?.[0];
  const teams = results.teams?.length ? results.teams : fallbackTeams.length ? fallbackTeams : viewerTeam ? [viewerTeam] : [];
  const resultViewerTeam = viewerTeam ? teams.find((team) => hasSameLineup(team, viewerTeam)) : undefined;
  const [reportVisible, setReportVisible] = useState(() => {
    try { return !final || localStorage.getItem(watchedFinalKey) === final.id; } catch { return !final; }
  });
  const [activeTab, setActiveTab] = useState<ReportTab>("lineups");
  const [selectedTeamName, setSelectedTeamName] = useState(resultViewerTeam?.name ?? teams[0]?.name ?? "");
  const selectedTeam = teams.find((team) => team.name === selectedTeamName) ?? teams[0];
  const rankedTeams = teams
    .map((team) => ({ team, averages: teamRatingAverages(team) }))
    .sort((first, second) => second.averages.overall - first.averages.overall || first.team.name.localeCompare(second.team.name));
  const ratingKeys = ["goalkeeper", "defence", "midfield", "attack", "overall"] as const;
  const bestRatings = Object.fromEntries(ratingKeys.map((key) => [key, Math.max(...rankedTeams.map((entry) => entry.averages[key]))])) as Record<(typeof ratingKeys)[number], number>;
  const locale = language === "ca" ? "ca-ES" : language === "en" ? "en-GB" : "es-ES";
  const formatRating = (value: number) => value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const isViewer = (team: DraftTeam) => Boolean(resultViewerTeam && hasSameLineup(team, resultViewerTeam));

  if (final && !reportVisible) {
    return <FinalBroadcast match={final} teams={teams} onComplete={() => {
      try { localStorage.setItem(watchedFinalKey, final.id); } catch { /* Playback remains usable without storage. */ }
      setReportVisible(true);
    }} />;
  }

  const tabs: { id: ReportTab; label: string; icon: typeof Users }[] = [
    { id: "lineups", label: t("match.tabLineups"), icon: Users },
    { id: "comparison", label: t("match.tabComparison"), icon: BarChart3 },
    ...(results.rounds.length > 1 ? [{ id: "bracket" as const, label: t("match.tabBracket"), icon: ListTree }] : []),
  ];

  return (
    <div className="results-screen screen-enter">
      <section className="result-hero">
        <div className="result-hero__trophy"><Trophy /></div>
        <div className="result-hero__copy">
          <p>{t("match.finalResult")}</p>
          <h1>{teamDisplayName(t, results.champion)}</h1>
          <span><Crown /> {t("match.champion")}</span>
        </div>
        {final && (
          <div className="result-hero__score">
            <span>{teamDisplayName(t, final.homeName)}</span>
            <strong>{final.homeScore}<em>:</em>{final.awayScore}</strong>
            <span>{teamDisplayName(t, final.awayName)}</span>
          </div>
        )}
      </section>

      <nav className="result-tabs" role="tablist" aria-label={t("match.reportTabs")}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`result-panel-${id}`}
            className={activeTab === id ? "is-active" : ""}
            onClick={() => setActiveTab(id)}
            key={id}
          >
            <Icon /> <span>{label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "lineups" && selectedTeam && (
        <section className="team-browser panel" id="result-panel-lineups" role="tabpanel">
          <div className="section-title"><div><p className="kicker"><Users /> {t("match.lineupsKicker")}</p><h2>{t("match.lineupsTitle")}</h2></div><span>{t("match.teamsCount", { count: rankedTeams.length })}</span></div>
          <div className="team-picker" role="group" aria-label={t("match.chooseTeam")}>
            {rankedTeams.map(({ team, averages }) => (
              <button type="button" key={team.name} aria-pressed={selectedTeam.name === team.name} className={selectedTeam.name === team.name ? "is-active" : ""} onClick={() => setSelectedTeamName(team.name)}>
                <span>{team.name === results.champion ? <Crown /> : <Eye />}</span>
                <strong>{teamDisplayName(t, team.name)}</strong>
                <small>{t("match.averageShort")} {formatRating(averages.overall)}</small>
              </button>
            ))}
          </div>
          <div className="selected-team-layout">
            <FormationPitch formation={selectedTeam.formation} lineup={selectedTeam.lineup} compact title={teamDisplayName(t, selectedTeam.name)} />
            <section className="roster-sheet">
              <header>
                <div><p>{t("match.squadList")}</p><h3>{teamDisplayName(t, selectedTeam.name)}</h3><span>{selectedTeam.formation} · {tacticLabel(t, selectedTeam.tactic)}</span></div>
                <strong><small>{t("match.generalAverage")}</small>{formatRating(teamRatingAverages(selectedTeam).overall)}</strong>
              </header>
              <div className="roster-list">
                {positionOrder.flatMap((position) => selectedTeam.lineup.filter((player) => player.position === position)).map((player) => (
                  <article key={player.id}>
                    <b className={`position-chip position-chip--${player.position.toLowerCase()}`}>{player.position}</b>
                    <div><strong>{player.name}</strong><span>{player.team}</span></div>
                    <em>{player.rating}</em>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === "comparison" && rankedTeams.length > 1 && (
        <section className="team-comparison panel" id="result-panel-comparison" role="tabpanel">
          <div className="section-title"><div><p className="kicker"><BarChart3 /> {t("match.comparisonKicker")}</p><h2>{t("match.comparisonTitle")}</h2></div><span>{t("match.teamsCount", { count: rankedTeams.length })}</span></div>
          <div className="team-comparison-scroll">
            <table className="team-comparison-table">
              <caption className="sr-only">{t("match.comparisonTitle")}</caption>
              <thead><tr><th scope="col">{t("match.team")}</th><th scope="col">{t("match.goalkeeper")}</th><th scope="col">{t("match.defence")}</th><th scope="col">{t("match.midfield")}</th><th scope="col">{t("match.attack")}</th><th scope="col">{t("match.generalAverage")}</th></tr></thead>
              <tbody>
                {rankedTeams.map(({ team, averages }, index) => (
                  <tr key={team.name} className={`${team.name === results.champion ? "is-champion" : ""}${isViewer(team) ? " is-viewer" : ""}`}>
                    <th scope="row"><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{teamDisplayName(t, team.name)}</strong><small>{team.name === results.champion && <b><Crown /> {t("match.championBadge")}</b>}{isViewer(team) && <b>{t("match.youBadge")}</b>}</small></div></th>
                    {ratingKeys.map((key) => <td key={key} className={averages[key] === bestRatings[key] ? "is-best" : ""}>{formatRating(averages[key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="team-comparison-cards">
            {rankedTeams.map(({ team, averages }, index) => (
              <article key={team.name} className={`${team.name === results.champion ? "is-champion" : ""}${isViewer(team) ? " is-viewer" : ""}`}>
                <header>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{teamDisplayName(t, team.name)}</strong><small>{team.name === results.champion && <b><Crown /> {t("match.championBadge")}</b>}{isViewer(team) && <b>{t("match.youBadge")}</b>}</small></div>
                </header>
                <div className="team-comparison-cards__ratings">
                  {ratingKeys.map((key) => (
                    <div key={key} className={averages[key] === bestRatings[key] ? "is-best" : ""}>
                      <span>{key === "goalkeeper" ? t("match.goalkeeper") : key === "overall" ? t("match.generalAverage") : t(`match.${key}`)}</span>
                      <strong>{formatRating(averages[key])}</strong>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "bracket" && (
        <section className="bracket panel" id="result-panel-bracket" role="tabpanel">
          <div className="section-title"><div><p className="kicker"><Trophy /> {t("match.bracket")}</p><h2>{t("match.path")}</h2></div><span>{t("match.rounds", { count: results.rounds.length })}</span></div>
          <div className="bracket-scroll">
            {results.rounds.map((round, roundIndex) => (
              <div className="bracket-round" key={roundIndex}>
                <h3>{roundIndex === results.rounds.length - 1 ? t("common.final") : roundIndex === results.rounds.length - 2 ? t("match.semifinal") : t("match.round", { count: roundIndex + 1 })}</h3>
                {round.map((match) => (
                  <article className="bracket-match" key={match.id}>
                    <div className={match.winnerName === match.homeName ? "is-winner" : ""}><span>{teamDisplayName(t, match.homeName)}</span><strong>{match.homeScore}</strong></div>
                    <div className={match.winnerName === match.awayName ? "is-winner" : ""}><span>{teamDisplayName(t, match.awayName)}</span><strong>{match.awayScore}</strong></div>
                  </article>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="result-actions">
        {final && <button type="button" className="secondary-button" onClick={() => setReportVisible(false)}><Eye />{t("match.watchFinal")}</button>}
        {onReplay && <button type="button" className="primary-button" onClick={onReplay}>{t("match.replay")} <ChevronRight /></button>}
        {onConfigure && <button type="button" className="secondary-button" onClick={onConfigure}>{t("solo.newDraft")}</button>}
        {onExit && <button type="button" className="secondary-button" onClick={onExit}>{t("match.back")}</button>}
      </div>
    </div>
  );
}
