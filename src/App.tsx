import { Info, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { applyCatalogOverrides } from "../shared/catalog";
import type { RoomState } from "../shared/types";
import { api } from "./api";
import { LanguageSelector, useI18n } from "./i18n";
import { AdminScreen } from "./screens/AdminScreen";
import { CreateRoomScreen } from "./screens/CreateRoomScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { JoinRoomScreen } from "./screens/JoinRoomScreen";
import { RoomScreen } from "./screens/RoomScreen";
import { SoloScreen } from "./screens/SoloScreen";
import { Dialog } from "./components/Dialog";

type View = "home" | "solo" | "create" | "join" | "room" | "admin";

export function App() {
  const { t } = useI18n();
  const queryCode = new URLSearchParams(location.search).get("room")?.toUpperCase() ?? "";
  const adminPath = location.pathname === "/admin";
  const [view, setView] = useState<View>(adminPath ? "admin" : queryCode ? "join" : "home");
  const [room, setRoom] = useState<RoomState>();
  const [joinCode, setJoinCode] = useState(queryCode);
  const [about, setAbout] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setCatalogError(false);
    api.catalogConfig().then((config) => {
      if (!active) return;
      applyCatalogOverrides(config.overrides);
      setCatalogReady(true);
    }).catch(() => { if (active) setCatalogError(true); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!queryCode) return;
    api.room(queryCode).then((loaded) => {
      if (loaded.viewerMemberId) {
        setRoom(loaded);
        setView("room");
      } else {
        setJoinCode(queryCode);
        setView("join");
      }
    }).catch(() => {
      setJoinCode(queryCode);
      setView("join");
    });
  }, [queryCode]);

  const home = () => {
    history.replaceState({}, "", "/");
    setRoom(undefined);
    setJoinCode("");
    setView("home");
  };
  const enterRoom = (nextRoom: RoomState) => {
    history.replaceState({}, "", `/?room=${nextRoom.code}`);
    setRoom(nextRoom);
    setView("room");
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <button type="button" className="brand" onClick={home} aria-label={t("app.homeAria")}><span><i /></span><div><strong>ELEVEN FORCE</strong><small>FAN DRAFT SYSTEM</small></div></button>
        <div className="header-status"><Radio /><strong>{t(catalogError ? "app.connectionError" : catalogReady ? "app.catalogReady" : "app.sync")}</strong></div>
        <LanguageSelector />
        <button type="button" className="icon-button" onClick={() => setAbout(true)} aria-label={t("app.infoAria")}><Info /></button>
      </header>

      <div className="page-shell">
        {!catalogReady && view !== "admin" && <main className="catalog-loading" role="status"><span>{t("app.sync")}</span><strong>{t(catalogError ? "app.catalogError" : "app.loading")}</strong>{catalogError && <button type="button" className="primary-button" onClick={() => setRetry((value) => value + 1)}>{t("room.retryConnection")}</button>}</main>}
        {catalogReady && view === "home" && <HomeScreen onSolo={() => setView("solo")} onCreate={() => setView("create")} onJoin={() => setView("join")} />}
        {catalogReady && view === "solo" && <SoloScreen onExit={home} />}
        {catalogReady && view === "create" && <CreateRoomScreen onExit={home} onCreated={enterRoom} />}
        {catalogReady && view === "join" && <JoinRoomScreen initialCode={joinCode} onExit={home} onJoined={enterRoom} />}
        {catalogReady && view === "room" && room && <RoomScreen initialRoom={room} onExit={home} />}
        {view === "admin" && <AdminScreen onExit={home} />}
      </div>

      <footer>{t("app.footer")}</footer>

      {about && <Dialog className="info-modal" title={t("info.title")} close={() => setAbout(false)}><p className="kicker">{t("info.kicker")}</p><p>{t("info.p1")}</p><p>{t("info.p2")}</p><p>{t("info.p3")}</p></Dialog>}
    </div>
  );
}
