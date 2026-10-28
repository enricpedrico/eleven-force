import {
  Activity,
  ArrowLeft,
  Database,
  Download,
  Eye,
  EyeOff,
  Gauge,
  Image,
  KeyRound,
  Layers3,
  List,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Fragment, useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import { applyCatalogOverrides, POSITION_IDS, SEASONS, SQUADS, positionsFor, setCardOverride } from "../../shared/catalog";
import type { AdminOverview, AdminPlayerCard, AdminPlayerPage, AdminRoomSummary, AdminSession, CardOverrides, Position, RatingOverrides } from "../../shared/types";
import { api } from "../api";
import { AdminTierBoard } from "../components/AdminTierBoard";
import { PixelPortrait } from "../components/PixelPortrait";
import { translatedError, useI18n } from "../i18n";

type AdminTab = "overview" | "ratings" | "rooms";
type RatingView = "detail" | "tier";

const portraitColors: [string, string] = ["#176ed1", "#ffd43b"];

interface CardDraft {
  rating: string;
  position: Position;
  positions: Position[];
  enabled: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatRemaining(expiresAt: string): string {
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function AdminScreen({ onExit }: { onExit: () => void }) {
  const { t } = useI18n();
  const [session, setSession] = useState<AdminSession>();
  const [checkedSession, setCheckedSession] = useState(false);
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<AdminTab>("overview");
  const [ratingView, setRatingView] = useState<RatingView>("detail");
  const [overview, setOverview] = useState<AdminOverview>();
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [loadedPlayers, setPlayers] = useState<AdminPlayerPage>();
  const [loadedPlayersKey, setLoadedPlayersKey] = useState("");
  const [playersLoading, setPlayersLoading] = useState(false);
  const playersRequest = useRef(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [season, setSeason] = useState("");
  const [team, setTeam] = useState("");
  const [position, setPosition] = useState("");
  const [availability, setAvailability] = useState("");
  const [page, setPage] = useState(1);
  const [draftCards, setDraftCards] = useState<Record<string, CardDraft>>({});
  const [tierDraftRatings, setTierDraftRatings] = useState<Record<string, number>>({});
  const [selectedTierCard, setSelectedTierCard] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const playersKey = JSON.stringify([ratingView, query, season, team, position, availability, page]);
  const players = !playersLoading && loadedPlayersKey === playersKey ? loadedPlayers : undefined;

  const updateCardDraft = (player: AdminPlayerCard, update: (current: CardDraft) => CardDraft) => {
    setDraftCards((values) => {
      const current = values[player.id] ?? {
        rating: String(player.rating),
        position: player.position,
        positions: positionsFor(player),
        enabled: player.enabled,
      };
      return { ...values, [player.id]: update(current) };
    });
  };

  const report = (message: string) => {
    setNotice(message);
    setError("");
  };

  const fail = (caught: unknown) => {
    setError(translatedError(caught, t));
    setNotice("");
  };

  const loadOverview = async () => setOverview(await api.admin.overview());
  const loadRooms = async () => setRooms((await api.admin.rooms()).rooms);
  const loadPlayers = async () => {
    const request = ++playersRequest.current;
    const key = JSON.stringify([ratingView, deferredQuery, season, team, position, availability, page]);
    setPlayersLoading(true);
    try {
      const result = await api.admin.players({ query: deferredQuery, season, team, position, availability, page, pageSize: ratingView === "tier" ? 100 : undefined });
      if (request !== playersRequest.current) return;
      setPlayers(result);
      setLoadedPlayersKey(key);
    } catch (caught) {
      if (request === playersRequest.current) throw caught;
    } finally {
      if (request === playersRequest.current) setPlayersLoading(false);
    }
  };

  useEffect(() => {
    api.admin.session().then(setSession).catch(() => setSession(undefined)).finally(() => setCheckedSession(true));
  }, []);

  useEffect(() => {
    if (!session) return;
    loadOverview().catch(fail);
  }, [session]);

  useEffect(() => {
    if (!session || tab !== "ratings") return;
    loadPlayers().catch(fail);
    return () => { playersRequest.current++; };
  }, [session, tab, ratingView, deferredQuery, season, team, position, availability, page]);

  useEffect(() => {
    if (!session || tab !== "rooms") return;
    loadRooms().catch(fail);
  }, [session, tab]);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSession(await api.admin.login(password));
      setPassword("");
      report(t("notice.adminStarted"));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api.admin.logout(session.csrfToken);
      setSession(undefined);
      setOverview(undefined);
      setPlayers(undefined);
      setRooms([]);
      setDraftCards({});
      setTierDraftRatings({});
      setSelectedTierCard(undefined);
      report(t("notice.adminClosed"));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const saveCard = async (player: AdminPlayerCard, draft: CardDraft) => {
    if (!session) return;
    const rating = Number(draft.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 99) return fail(new Error(t("error.ratingRange")));
    setBusy(true);
    try {
      if (!draft.positions.includes(draft.position)) return fail(new Error(t("error.primaryPosition")));
      const result = await api.admin.saveCard(session.csrfToken, player.id, { rating, position: draft.position, positions: draft.positions, enabled: draft.enabled });
      setCardOverride(player.id, result);
      setDraftCards((values) => { const next = { ...values }; delete next[player.id]; return next; });
      await Promise.all([loadPlayers(), loadOverview()]);
      report(t("notice.cardSaved", { name: player.name }));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const setTierRating = (player: AdminPlayerCard, rating: number) => {
    if (!Number.isInteger(rating) || rating < 1 || rating > 99) return;
    setTierDraftRatings((values) => {
      const next = { ...values };
      if (rating === player.rating) delete next[player.id];
      else next[player.id] = rating;
      return next;
    });
  };

  const saveTierRatings = async () => {
    if (!session || !Object.keys(tierDraftRatings).length) return;
    setBusy(true);
    try {
      const result = await api.admin.saveRatings(session.csrfToken, tierDraftRatings);
      for (const [cardId, override] of Object.entries(result.overrides)) setCardOverride(cardId, override);
      setTierDraftRatings({});
      setSelectedTierCard(undefined);
      await Promise.all([loadPlayers(), loadOverview()]);
      report(t("notice.tierRatingsSaved", { count: result.updated }));
    } catch (caught) {
      fail(caught);
      await loadPlayers().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const confirmDiscardTierChanges = () => !Object.keys(tierDraftRatings).length || window.confirm(t("confirm.discardTierChanges"));

  const changeRatingView = (nextView: RatingView) => {
    if (nextView === ratingView) return;
    const hasPending = ratingView === "tier" ? Object.keys(tierDraftRatings).length : Object.keys(draftCards).length;
    if (hasPending && !window.confirm(t("confirm.discardEditorChanges"))) return;
    setDraftCards({});
    setTierDraftRatings({});
    setSelectedTierCard(undefined);
    setPage(1);
    if (nextView === "tier") {
      const currentTeam = SQUADS.find((squad) => `${squad.season}|${squad.name}` === team);
      const target = currentTeam ?? SQUADS.find((squad) => !season || squad.season === season) ?? SQUADS[0];
      setSeason(target.season);
      setTeam(`${target.season}|${target.name}`);
      setQuery("");
      setPosition("");
      setAvailability("");
    }
    setRatingView(nextView);
  };

  const changeTierSeason = (nextSeason: string) => {
    if (!confirmDiscardTierChanges()) return;
    const target = SQUADS.find((squad) => !nextSeason || squad.season === nextSeason) ?? SQUADS[0];
    setTierDraftRatings({});
    setSelectedTierCard(undefined);
    setSeason(target.season);
    setTeam(`${target.season}|${target.name}`);
    setPage(1);
  };

  const changeTierTeam = (nextTeam: string) => {
    if (!confirmDiscardTierChanges()) return;
    setTierDraftRatings({});
    setSelectedTierCard(undefined);
    setTeam(nextTeam);
    setPage(1);
  };

  const resetCard = async (player: AdminPlayerCard) => {
    if (!session) return;
    setBusy(true);
    try {
      await api.admin.resetCard(session.csrfToken, player.id);
      setCardOverride(player.id);
      setDraftCards((values) => { const next = { ...values }; delete next[player.id]; return next; });
      await Promise.all([loadPlayers(), loadOverview()]);
      report(t("notice.cardRestored", { name: player.name }));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const clearRatings = async () => {
    if (!session || !window.confirm(t("confirm.restoreRatings"))) return;
    setBusy(true);
    try {
      const result = await api.admin.clearRatings(session.csrfToken);
      applyCatalogOverrides({});
      setDraftCards({});
      setTierDraftRatings({});
      setSelectedTierCard(undefined);
      await Promise.all([loadPlayers(), loadOverview()]);
      report(t("notice.ratingsCleared", { count: result.cleared }));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const importRatings = async (file?: File) => {
    if (!session || !file) return;
    setBusy(true);
    try {
      if (file.size > 500_000) throw new Error(t("error.fileLarge"));
      const payload = JSON.parse(await file.text()) as { format?: string; overrides?: CardOverrides; ratings?: RatingOverrides };
      const current = payload.format === "eleven-force-catalog" && payload.overrides && typeof payload.overrides === "object";
      const legacy = payload.format === "eleven-force-ratings" && payload.ratings && typeof payload.ratings === "object";
      if (!current && !legacy) {
        throw new Error(t("error.invalidExport"));
      }
      const result = await api.admin.importCatalog(session.csrfToken, current ? payload.overrides! : payload.ratings!, Boolean(legacy));
      applyCatalogOverrides((await api.catalogConfig()).overrides);
      setDraftCards({});
      setTierDraftRatings({});
      setSelectedTierCard(undefined);
      await Promise.all([loadPlayers(), loadOverview()]);
      report(t("notice.ratingsImported", { count: result.imported }));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async (code: string) => {
    if (!session || !window.confirm(t("confirm.closeRoom", { code }))) return;
    setBusy(true);
    try {
      await api.admin.deleteRoom(session.csrfToken, code);
      await Promise.all([loadRooms(), loadOverview()]);
      report(t("notice.roomClosed", { code }));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const cleanup = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await api.admin.cleanup(session.csrfToken);
      await Promise.all([loadOverview(), loadRooms()]);
      report(t("notice.cleanup"));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  if (!checkedSession) {
    return <main className="admin-loading"><RefreshCw className="spin" /><span>{t("admin.checking")}</span></main>;
  }

  if (!session) {
    return (
      <main className="admin-login screen-enter">
        <button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("admin.back")}</button>
        <form className="admin-login__card" onSubmit={login}>
          <div className="admin-emblem"><ShieldCheck /></div>
          <p className="kicker">{t("admin.restricted")}</p>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.loginLead")}</p>
          <label><span>{t("admin.password")}</span><div className="field-with-icon"><KeyRound /><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></div></label>
          {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
          {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}
          <button type="submit" className="primary-button" disabled={busy}>{busy ? t("admin.authenticating") : t("admin.open")}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-screen screen-enter">
      <section className="admin-hero">
        <div><button type="button" className="back-button" onClick={onExit}><ArrowLeft /> {t("admin.back")}</button><p className="kicker"><ShieldCheck /> {t("admin.secure")}</p><h1>{t("admin.title")}</h1><p>{t("admin.lead")}</p></div>
        <button type="button" className="secondary-button" disabled={busy} onClick={logout}><LogOut /> {t("admin.logout")}</button>
      </section>

      <nav className="admin-tabs" aria-label={t("admin.sections")}>
        <button type="button" className={tab === "overview" ? "is-active" : ""} onClick={() => setTab("overview")}><Gauge /> {t("admin.overview")}</button>
        <button type="button" className={tab === "ratings" ? "is-active" : ""} onClick={() => setTab("ratings")}><Activity /> {t("admin.ratings")}</button>
        <button type="button" className={tab === "rooms" ? "is-active" : ""} onClick={() => setTab("rooms")}><Users /> {t("admin.rooms")}</button>
      </nav>

      {error && <div className="admin-alert admin-alert--error" role="alert">{error}</div>}
      {notice && <div className="admin-alert admin-alert--ok">{notice}</div>}

      {tab === "overview" && overview && (
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p className="kicker">{t("admin.telemetry")}</p><h2>{t("admin.system")}</h2></div><button type="button" className="small-button" onClick={() => loadOverview().catch(fail)}><RefreshCw /> {t("common.update")}</button></div>
          <div className="admin-metrics">
            <article><Users /><strong>{overview.activeRooms}</strong><span>{t("admin.activeRooms")}</span></article>
            <article><Activity /><strong>{overview.activeSessions}</strong><span>{t("admin.gameSessions")}</span></article>
            <article><Gauge /><strong>{overview.cardOverrides}</strong><span>{t("admin.editedRatings")}</span></article>
            <article><EyeOff /><strong>{overview.disabledCards}</strong><span>{t("admin.disabledCards")}</span></article>
            <article><Image /><strong>{overview.portraits}/{overview.characters}</strong><span>{t("admin.portraits")}</span></article>
            <article><Database /><strong>{formatBytes(overview.databaseBytes)}</strong><span>{t("admin.database")}</span></article>
            <article><ShieldCheck /><strong>{Math.floor(overview.uptimeSeconds / 60)} min</strong><span>{t("admin.uptime")}</span></article>
          </div>
          <div className="admin-actions">
            <div><h3>{t("admin.maintenance")}</h3><p>{t("admin.maintenanceHelp")}</p></div>
            <button type="button" className="secondary-button" disabled={busy} onClick={cleanup}><RefreshCw /> {t("admin.cleanup")}</button>
          </div>
          <div className="admin-actions">
            <div><h3>{t("admin.ratingBackup")}</h3><p>{t("admin.ratingBackupHelp")}</p></div>
            <div className="admin-action-buttons"><a className="secondary-button" href="/api/admin/ratings/export"><Download /> {t("admin.export")}</a><label className="secondary-button file-button"><Upload /> {t("admin.import")}<input type="file" accept="application/json,.json" onChange={(event) => { void importRatings(event.target.files?.[0]); event.target.value = ""; }} /></label></div>
          </div>
        </section>
      )}

      {tab === "ratings" && (
        <section className="admin-panel admin-panel--ratings">
          <div className="admin-panel__heading">
            <div><p className="kicker">{t("admin.catalog")}</p><h2>{ratingView === "tier" ? t("admin.tierRatings") : t("admin.cardRatings")}</h2><p>{ratingView === "tier" ? t("admin.tierRatingsHelp") : t("admin.cardRatingsHelp")}</p></div>
            <button type="button" className="danger-button" disabled={busy || !overview?.cardOverrides} onClick={clearRatings}><RotateCcw /> {t("admin.restoreAll")}</button>
          </div>
          <div className="admin-editor-modes" role="group" aria-label={t("admin.editorMode")}>
            <button type="button" className={ratingView === "detail" ? "is-active" : ""} aria-pressed={ratingView === "detail"} onClick={() => changeRatingView("detail")}><List /> <span><strong>{t("admin.detailView")}</strong><small>{t("admin.detailViewHelp")}</small></span></button>
            <button type="button" className={ratingView === "tier" ? "is-active" : ""} aria-pressed={ratingView === "tier"} onClick={() => changeRatingView("tier")}><Layers3 /> <span><strong>{t("admin.tierView")}</strong><small>{t("admin.tierViewHelp")}</small></span></button>
          </div>

          {ratingView === "detail" ? (
            <>
              <div className="admin-filters">
                <label className="admin-search"><Search /><input aria-label={t("admin.search")} placeholder={t("admin.searchPlaceholder")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
                <select aria-label={t("admin.filterSaga")} value={season} onChange={(event) => { setSeason(event.target.value); setTeam(""); setPage(1); }}><option value="">{t("admin.allSagas")}</option>{SEASONS.map((item) => <option value={item.id} key={item.id}>{item.shortLabel}</option>)}</select>
                <select aria-label={t("admin.filterTeam")} value={team} onChange={(event) => { setTeam(event.target.value); setPage(1); }}><option value="">{t("admin.allTeams")}</option>{SQUADS.filter((squad) => !season || squad.season === season).map((squad) => <option value={`${squad.season}|${squad.name}`} key={squad.id}>{SEASONS.find((item) => item.id === squad.season)?.shortLabel} · {squad.name}</option>)}</select>
                <select aria-label={t("admin.filterPosition")} value={position} onChange={(event) => { setPosition(event.target.value); setPage(1); }}><option value="">{t("admin.allPositions")}</option><option>GK</option><option>DF</option><option>MF</option><option>FW</option></select>
                <select aria-label={t("admin.filterAvailability")} value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1); }}><option value="">{t("admin.allAvailability")}</option><option value="enabled">{t("admin.onlyEnabled")}</option><option value="disabled">{t("admin.onlyDisabled")}</option></select>
              </div>
              <div className="admin-results-bar"><span>{t("admin.cardsCount", { count: players?.total ?? 0 })}</span><span>{t("admin.adjustmentsCount", { count: overview?.cardOverrides ?? 0 })}</span></div>
              <div className="admin-player-list">
                {players?.items.map((player, index) => {
                  const currentPositions = positionsFor(player);
                  const draft = draftCards[player.id] ?? { rating: String(player.rating), position: player.position, positions: currentPositions, enabled: player.enabled };
                  const changed = Number(draft.rating) !== player.rating
                    || draft.position !== player.position
                    || draft.positions.join(",") !== currentPositions.join(",")
                    || draft.enabled !== player.enabled;
                  const previous = players.items[index - 1];
                  const startsTeam = !previous || previous.season !== player.season || previous.team !== player.team;
                  return (
                    <Fragment key={player.id}>
                      {startsTeam && <div className="admin-team-heading"><span>{SEASONS.find((item) => item.id === player.season)?.shortLabel}</span><strong>{player.team}</strong></div>}
                      <article className={`admin-player${player.overridden ? " is-overridden" : ""}${player.enabled ? "" : " is-disabled"}`}>
                        <PixelPortrait cardId={player.id} seed={player.seed} characterKey={player.characterKey} name={player.name} element={player.element} colors={portraitColors} size="small" />
                        <div className="admin-player__identity"><strong>{player.name}</strong><span>{player.team}</span><small>{player.season.toUpperCase()} · {t("admin.base")} {player.basePositions.join("/")} / {player.baseRating}</small></div>
                        <label className="position-input"><span>{t("admin.primaryPosition")}</span><select aria-label={t("admin.positionAria", { name: player.name, team: player.team })} value={draft.position} onChange={(event) => { const next = event.target.value as Position; updateCardDraft(player, (current) => ({ ...current, position: next, positions: [next, ...current.positions.filter((item) => item !== next)] })); }}><option>GK</option><option>DF</option><option>MF</option><option>FW</option></select></label>
                        <div className="position-compatibility" role="group" aria-label={t("admin.compatiblePositionsAria", { name: player.name })}><span>{t("admin.compatiblePositions")}</span><div>{POSITION_IDS.map((item) => { const selected = draft.positions.includes(item); const locked = draft.position === item; return <button type="button" key={item} className={selected ? "is-selected" : ""} aria-pressed={selected} disabled={locked} title={locked ? t("admin.primaryCannotRemove") : undefined} onClick={() => updateCardDraft(player, (current) => ({ ...current, positions: current.positions.includes(item) ? current.positions.filter((candidate) => candidate !== item) : POSITION_IDS.filter((candidate) => candidate === current.position || current.positions.includes(candidate) || candidate === item) }))}>{item}</button>; })}</div></div>
                        <label className="rating-input"><span>{t("common.power")}</span><input aria-label={t("admin.ratingAria", { name: player.name, team: player.team })} type="number" min="1" max="99" inputMode="numeric" value={draft.rating} onChange={(event) => { const rating = event.target.value; updateCardDraft(player, (current) => ({ ...current, rating })); }} /></label>
                        <button type="button" role="switch" aria-checked={draft.enabled} className={`availability-toggle${draft.enabled ? " is-enabled" : " is-disabled"}`} onClick={() => updateCardDraft(player, (current) => ({ ...current, enabled: !current.enabled }))}>{draft.enabled ? <Eye /> : <EyeOff />}<span>{draft.enabled ? t("admin.enabled") : t("admin.disabled")}</span></button>
                        <div className="admin-player__buttons"><button type="button" className="save-rating" title={t("admin.saveRating")} disabled={busy || !changed} onClick={() => saveCard(player, draft)}><Save /></button><button type="button" className="reset-rating" title={t("admin.restoreRating")} disabled={busy || !player.overridden} onClick={() => resetCard(player)}><RotateCcw /></button></div>
                      </article>
                    </Fragment>
                  );
                })}
              </div>
              {players && players.pages > 1 && <div className="admin-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{t("common.previous")}</button><span>{t("common.page", { page: players.page, pages: players.pages })}</span><button type="button" disabled={page >= players.pages} onClick={() => setPage((value) => value + 1)}>{t("common.next")}</button></div>}
            </>
          ) : (
            <>
              <div className="admin-filters admin-filters--tier">
                <select aria-label={t("admin.filterSaga")} value={season} onChange={(event) => changeTierSeason(event.target.value)}>{SEASONS.map((item) => <option value={item.id} key={item.id}>{item.shortLabel}</option>)}</select>
                <select aria-label={t("admin.filterTeam")} value={team} onChange={(event) => changeTierTeam(event.target.value)}>{SQUADS.filter((squad) => squad.season === season).map((squad) => <option value={`${squad.season}|${squad.name}`} key={squad.id}>{squad.name}</option>)}</select>
              </div>
              <div className="tier-savebar">
                <div><strong>{t("admin.pendingRatings", { count: Object.keys(tierDraftRatings).length })}</strong><span>{t("admin.tierSaveHelp")}</span></div>
                <button type="button" className="secondary-button" disabled={busy || !Object.keys(tierDraftRatings).length} onClick={() => { setTierDraftRatings({}); setSelectedTierCard(undefined); }}><RotateCcw /> {t("admin.discardTier")}</button>
                <button type="button" className="primary-button" disabled={busy || !Object.keys(tierDraftRatings).length} onClick={saveTierRatings}><Save /> {busy ? t("admin.savingTier") : t("admin.saveTier")}</button>
              </div>
              {!players && <p role="status">{playersLoading ? t("app.loading") : t("app.catalogError")}</p>}
              {players && <AdminTierBoard
                players={players.items}
                draftRatings={tierDraftRatings}
                selectedId={selectedTierCard}
                busy={busy}
                onSelect={setSelectedTierCard}
                onRate={setTierRating}
                text={{
                  selected: t("admin.selectedCard"),
                  base: t("admin.base"),
                  current: t("admin.currentRating"),
                  moveHere: t("admin.moveHere"),
                  empty: t("admin.emptyTier"),
                  dragHelp: t("admin.tierDragHelp"),
                  ratingFor: (name) => t("admin.tierRatingAria", { name }),
                  tierFor: (tierName) => t("admin.moveToTierAria", { tier: tierName }),
                }}
              />}
            </>
          )}
        </section>
      )}

      {tab === "rooms" && (
        <section className="admin-panel">
          <div className="admin-panel__heading"><div><p className="kicker">{t("admin.temporaryGames")}</p><h2>{t("admin.activeRoomsTitle")}</h2><p>{t("admin.activeRoomsHelp")}</p></div><button type="button" className="small-button" onClick={() => loadRooms().catch(fail)}><RefreshCw /> {t("common.update")}</button></div>
          {!rooms.length && <div className="admin-empty"><Users /><strong>{t("admin.noRooms")}</strong><span>{t("admin.noRoomsHelp")}</span></div>}
          <div className="admin-room-list">
            {rooms.map((room) => <article key={room.code}><div className="room-code-mini">{room.code}</div><div><strong>{room.title}</strong><span>{room.members.join(" · ")}</span><small>{room.mode === "cup" ? t("common.cup") : t("common.final")} · {t(`admin.status${room.status[0].toUpperCase()}${room.status.slice(1)}` as "admin.statusLobby")} · {t("admin.expires", { time: formatRemaining(room.expiresAt) })}</small></div><button type="button" className="danger-icon" aria-label={t("admin.closeRoom", { code: room.code })} disabled={busy} onClick={() => deleteRoom(room.code)}><Trash2 /></button></article>)}
          </div>
        </section>
      )}
    </main>
  );
}
