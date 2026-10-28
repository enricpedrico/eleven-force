import { ArrowRight, Bot, Dice5, Gamepad2, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import { SEASONS, SQUADS } from "../../shared/catalog";
import { useI18n } from "../i18n";
import { readSoloSession } from "../soloSession";

interface HomeScreenProps {
  onSolo: () => void;
  onCreate: () => void;
  onJoin: () => void;
}

export function HomeScreen({ onSolo, onCreate, onJoin }: HomeScreenProps) {
  const { language, t } = useI18n();
  const saved = readSoloSession();
  const cardCount = SQUADS.reduce((total, squad) => total + squad.players.length, 0);
  const formatCount = (value: number) => new Intl.NumberFormat({ es: "es-ES", ca: "ca-ES", en: "en-GB" }[language]).format(value);
  return (
    <main className="home-screen screen-enter">
      <section className="hero-ds">
        <div className="ds-screen ds-screen--top">
          <div className="speed-lines" aria-hidden="true" />
          <div className="hero-badge"><Radio /> {t("home.signal")}</div>
          <div className="hero-copy">
            <p>{t("home.eyebrow")}</p>
            <h1><span>ELEVEN</span><strong>FORCE</strong></h1>
            <h2>{t("home.title")}</h2>
            <p className="hero-lead">{t("home.lead")}</p>
          </div>
          <div className="hero-ball" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <div className="ds-hinge"><span /><i>POWER</i><span /></div>
        <div className="ds-screen ds-screen--bottom">
          <button type="button" className="mode-card mode-card--solo" onClick={onSolo}>
            <span className="mode-card__number">01</span><Gamepad2 /><div><small>{t(saved ? "solo.saved" : "home.quick")}</small><strong>{t(saved ? saved.phase === "result" ? "solo.lastResult" : "solo.resume" : "home.solo")}</strong><p>{saved ? t("solo.resumeProgress", { count: saved.lineup.length }) : t("home.soloDesc")}</p></div><ArrowRight />
          </button>
          <button type="button" className="mode-card mode-card--multi" onClick={onCreate}>
            <span className="mode-card__number">02</span><Users /><div><small>{t("home.live")}</small><strong>{t("home.multi")}</strong><p>{t("home.multiDesc")}</p></div><ArrowRight />
          </button>
          <button type="button" className="join-code-button" onClick={onJoin}><Radio /> {t("home.join")} <ArrowRight /></button>
        </div>
      </section>

      <section className="home-stats" aria-label={t("home.statsAria")}>
        <div><strong>{formatCount(SQUADS.length)}</strong><span>{t("home.teams")}</span></div><i />
        <div><strong>{formatCount(cardCount)}</strong><span>{t("home.cards")}</span></div><i />
        <div><strong>{SEASONS.length}</strong><span>{t("home.sagas")}</span></div><i />
        <div><strong>0</strong><span>{t("home.accounts")}</span></div>
      </section>

      <section className="how-it-works">
        <div className="section-title"><div><p className="kicker"><Sparkles /> {t("home.protocol")}</p><h2>{t("home.stepsTitle")}</h2></div></div>
        <div className="steps-grid">
          <article><span>01</span><Dice5 /><h3>{t("home.roll")}</h3><p>{t("home.rollDesc")}</p></article>
          <article><span>02</span><ShieldCheck /><h3>{t("home.choose")}</h3><p>{t("home.chooseDesc")}</p></article>
          <article><span>03</span><Bot /><h3>{t("home.simulate")}</h3><p>{t("home.simulateDesc")}</p></article>
        </div>
      </section>
    </main>
  );
}
