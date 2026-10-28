import { ArrowLeft, Dices, RotateCcw, Sparkles, Zap } from "lucide-react";
import { SEASONS, canDraft, getSquad, openPositions, planDraftPlacement, reassignLineupPlayer, squadsForSeasons, type DraftPlacementPlan } from "../../shared/catalog";
import { Random, createCpuTeam, pickBalancedSeason, simulateTournament } from "../../shared/game";
import type { DraftRoll, DraftTeam, FormationId, PlayerCard, Position, SeasonId, Tactic, TournamentResult } from "../../shared/types";
import { FormationPitch } from "../components/FormationPitch";
import { MatchView } from "../components/MatchView";
import { DraftChoices } from "../components/DraftChoices";
import { DraftRoster } from "../components/DraftRoster";
import { Dialog } from "../components/Dialog";
import { readSoloSession, SOLO_STORAGE_KEY } from "../soloSession";
import { PositionChangeDialog, PositionControls } from "../components/PositionManagement";
import { FormationSelector, RatingToggle, SeasonSelector, TacticSelector, UniqueCharactersToggle } from "../components/SetupControls";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export function SoloScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [saved] = useState(readSoloSession);
  const [phase, setPhase] = useState<"setup" | "draft" | "result">(saved?.phase ?? "setup");
  const [seasons, setSeasons] = useState<SeasonId[]>(saved?.seasons ?? ["original", "go"]);
  const [formation, setFormation] = useState<FormationId>(saved?.formation ?? "4-3-3");
  const [tactic, setTactic] = useState<Tactic>(saved?.tactic ?? "balanced");
  const [showRatings, setShowRatings] = useState(saved?.showRatings ?? true);
  const [uniqueCharacters, setUniqueCharacters] = useState(saved?.uniqueCharacters ?? true);
  const [lineup, setLineup] = useState<PlayerCard[]>(saved?.lineup ?? []);
  const [roll, setRoll] = useState<DraftRoll | undefined>(saved?.roll);
  const [rollHistory, setRollHistory] = useState<string[]>(saved?.rollHistory ?? []);
  const [turn, setTurn] = useState(saved?.turn ?? 0);
  const [seed, setSeed] = useState(saved?.seed ?? "");
  const [results, setResults] = useState<TournamentResult | undefined>(saved?.results);
  const [opponent, setOpponent] = useState<DraftTeam | undefined>(saved?.opponent);
  const [pendingPlan, setPendingPlan] = useState<DraftPlacementPlan>();
  const [restartPrompt, setRestartPrompt] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [draftError, setDraftError] = useState(false);

  useEffect(() => {
    if (phase === "setup") return;
    try {
      localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify({ version: 1, phase, seasons, formation, tactic, showRatings, uniqueCharacters, lineup, roll, rollHistory, turn, seed, results, opponent }));
      setSaveFailed(false);
    } catch { setSaveFailed(true); }
  }, [phase, seasons, formation, tactic, showRatings, uniqueCharacters, lineup, roll, rollHistory, turn, seed, results, opponent]);

  const start = () => {
    setSeed(crypto.randomUUID());
    setLineup([]);
    setRoll(undefined);
    setRollHistory([]);
    setTurn(0);
    setResults(undefined);
    setOpponent(undefined);
    setDraftError(false);
    setPhase("draft");
  };

  const draw = (fixedSeason?: SeasonId, rerollsLeft = 2) => {
    const rng = new Random(`${seed}:${turn}:${rollHistory.length}:${fixedSeason ?? "new"}`);
    const used = new Set(lineup.map((player) => player.characterKey));
    const viableSeasons = (fixedSeason ? [fixedSeason] : seasons).filter((season) =>
      squadsForSeasons([season]).some((squad) => squad.players.some((player) => canDraft(formation, lineup, player) && !used.has(player.characterKey))),
    );
    if (!viableSeasons.length) { setDraftError(true); return; }
    setDraftError(false);
    const season = pickBalancedSeason(viableSeasons, rng);
    const candidates = squadsForSeasons([season]).filter((squad) =>
      !rollHistory.includes(squad.id) && squad.players.some((player) => canDraft(formation, lineup, player) && !used.has(player.characterKey)),
    );
    const fallback = squadsForSeasons([season]).filter((squad) => squad.players.some((player) => canDraft(formation, lineup, player) && !used.has(player.characterKey)));
    const squad = rng.pick(candidates.length ? candidates : fallback);
    setRollHistory((history) => [...history, squad.id]);
    setRoll({ season, squadId: squad.id, rerollsLeft });
  };

  const pick = (player: PlayerCard, confirmed = false) => {
    const plan = planDraftPlacement(formation, lineup, player);
    if (!plan || lineup.some((chosen) => chosen.characterKey === player.characterKey)) return;
    if (plan.changes.length && !confirmed) {
      setPendingPlan(plan);
      return;
    }
    const nextLineup = plan.lineup;
    setPendingPlan(undefined);
    setLineup(nextLineup);
    setRoll(undefined);
    setRollHistory([]);
    setTurn((current) => current + 1);
    if (nextLineup.length === 11) {
      const unavailable = uniqueCharacters ? new Set(nextLineup.map((chosen) => chosen.characterKey)) : new Set<string>();
      const cpu = createCpuTeam(t("solo.cpuTeam"), seasons, formation, "balanced", `${seed}:cpu`, unavailable);
      const viewer: DraftTeam = { name: t("solo.myEleven"), formation, tactic, lineup: nextLineup };
      setOpponent(cpu);
      setResults(simulateTournament([viewer, cpu], `${seed}:final`));
      setPhase("result");
    }
  };

  if (phase === "result" && results) {
    const viewerTeam: DraftTeam = { name: results.teams?.[0]?.name ?? results.rounds[0][0].homeName, formation, tactic, lineup };
    return <MatchView results={results} viewerTeam={viewerTeam} fallbackTeams={opponent ? [viewerTeam, opponent] : [viewerTeam]} onExit={onExit} onReplay={start} onConfigure={() => setPhase("setup")} />;
  }

  if (phase === "setup") {
    return (
      <main className="setup-screen screen-enter">
        <button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.home")}</button>
        <section className="setup-header"><p className="kicker">{t("solo.mode")}</p><h1>{t("solo.setupTitle")}</h1><p>{t("solo.setupLead")}</p></section>
        <div className="setup-layout">
          <div className="setup-form panel">
            <SeasonSelector selected={seasons} onChange={setSeasons} />
            <FormationSelector value={formation} onChange={setFormation} />
            <TacticSelector value={tactic} onChange={setTactic} />
            <RatingToggle value={showRatings} onChange={setShowRatings} />
            <UniqueCharactersToggle value={uniqueCharacters} onChange={setUniqueCharacters} />
            <button type="button" className="primary-button primary-button--large" onClick={start}><Zap /> {t("solo.start")}</button>
          </div>
          <FormationPitch formation={formation} lineup={[]} title={t("solo.nextEleven")} />
        </div>
      </main>
    );
  }

  const squad = roll ? getSquad(roll.squadId) : undefined;
  const used = new Set(lineup.map((player) => player.characterKey));
  const seasonMeta = SEASONS.find((season) => season.id === roll?.season);
  return (
    <main className="draft-screen screen-enter">
      <header className="draft-header">
        <button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("common.leave")}</button>
        <div><p className="kicker">{t("solo.draft")}</p><h1>{t("solo.myEleven")}</h1></div>
        <div className="draft-counter"><span>{t("solo.signings")}</span><strong>{lineup.length}<small>/11</small></strong></div>
      </header>
      <div className="solo-session-bar"><span role="status">{t(saveFailed ? "solo.saveFailed" : "solo.saved")}</span><button type="button" onClick={() => setRestartPrompt(true)}><RotateCcw />{t("solo.newDraft")}</button></div>
      <div className="draft-layout">
        <section className="draft-console panel">
          {draftError && <p className="form-error" role="alert">{t("error.noOptions")}</p>}
          {!roll || !squad ? (
            <div className="roll-idle">
              <div className="dice-orbit"><Dices /><i /><i /></div>
              <p>{t("solo.turn", { turn: lineup.length + 1 })}</p><h2>{t("solo.waiting")}</h2>
              <button type="button" className="primary-button primary-button--large" onClick={() => draw()}><Dices /> {t("solo.roll")}</button>
            </div>
          ) : (
            <>
              <div className="roll-result" style={{ "--team-primary": squad.colors[0], "--team-secondary": squad.colors[1] } as React.CSSProperties}>
                <div><p className="kicker"><Sparkles /> {t("solo.lockedSaga")}</p><span>{seasonMeta?.shortLabel}</span><h2>{squad.name}</h2><small>{t("solo.availableCards", { count: squad.players.length })}</small></div>
                <button type="button" className="reroll-button" disabled={roll.rerollsLeft === 0} onClick={() => draw(roll.season, roll.rerollsLeft - 1)}><RotateCcw /><strong>{t("common.reroll")}</strong><span>{t("common.remaining", { count: roll.rerollsLeft })}</span></button>
              </div>
              <div className="reroll-rule"><Zap /> {t("solo.rerollRule")}</div>
              <DraftChoices key={`${turn}:${rollHistory.length}`} needs={openPositions(formation, lineup)} showRatings={showRatings} onPick={pick} choices={squad.players.map((player) => {
                  const duplicate = used.has(player.characterKey);
                  const plan = planDraftPlacement(formation, lineup, player);
                  return { player, unavailable: duplicate || !plan, reason: duplicate ? t("solo.alreadySigned") : !plan ? t("solo.positionFull") : undefined, adjustment: Boolean(plan?.changes.length) };
                })} />
            </>
          )}
        </section>
        <DraftRoster count={lineup.length}>
          <FormationPitch formation={formation} lineup={lineup} compact title={t("solo.myLineup")} showRatings={showRatings} />
          <PositionControls formation={formation} lineup={lineup} onChange={(playerId: string, position: Position) => { const next = reassignLineupPlayer(formation, lineup, playerId, position); if (next) setLineup(next); }} />
          <div className="needs-panel panel"><span>{t("solo.openPositions")}</span><div>{Object.entries(openPositions(formation, lineup).reduce<Record<string, number>>((counts, position) => { counts[position] = (counts[position] ?? 0) + 1; return counts; }, {})).map(([position, count]) => <b key={position}>{position} × {count}</b>)}</div></div>
          {opponent && <span className="sr-only">{opponent.name}</span>}
        </DraftRoster>
      </div>
      {pendingPlan && <PositionChangeDialog plan={pendingPlan} onCancel={() => setPendingPlan(undefined)} onConfirm={() => pick(pendingPlan.picked, true)} />}
      {restartPrompt && <Dialog title={t("solo.restartTitle")} close={() => setRestartPrompt(false)}><p>{t("solo.restartHelp")}</p><div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setRestartPrompt(false)}>{t("common.cancel")}</button><button type="button" className="primary-button" onClick={() => { try { localStorage.removeItem(SOLO_STORAGE_KEY); } catch {} setRestartPrompt(false); setPhase("setup"); }}>{t("solo.newDraft")}</button></div></Dialog>}
    </main>
  );
}
