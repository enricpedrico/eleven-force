import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { MatchEvent, Tactic } from "../shared/types";
import { messages, type MessageKey } from "./messages";

export type Language = keyof typeof messages;
type Parameters = Record<string, string | number>;
export type Translate = (key: MessageKey, parameters?: Parameters) => string;

const storageKey = "eleven-force-language";
const languages: Language[] = ["es", "ca", "en"];

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(storageKey);
    return languages.includes(stored as Language) ? stored as Language : "es";
  } catch { return "es"; }
}

function interpolate(message: string, parameters: Parameters = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, key: string) => String(parameters[key] ?? match));
}

interface I18nValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Translate;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const setLanguage = (next: Language) => {
    try { localStorage.setItem(storageKey, next); } catch { /* The interface still works when browser storage is unavailable. */ }
    setLanguageState(next);
  };
  const t: Translate = (key, parameters) => interpolate(messages[language][key], parameters);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <I18nContext value={{ language, setLanguage, t }}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className="language-selector" role="group" aria-label={t("language.label")}>
      {languages.map((item) => (
        <button
          type="button"
          key={item}
          className={language === item ? "is-active" : ""}
          aria-pressed={language === item}
          title={t(`language.${item}` as MessageKey)}
          onClick={() => setLanguage(item)}
        >
          {item === "ca" ? "CAT" : item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function tacticLabel(t: Translate, tactic: Tactic): string {
  return t(`setup.${tactic}` as MessageKey);
}

export function matchEventText(t: Translate, event: MatchEvent, sideName: string): string {
  const name = event.playerName ?? sideName;
  if (event.type === "goal" && event.minute > 90) return t("match.eventOvertime", { name });
  const key = event.type === "goal"
    ? "match.eventGoal"
    : event.type === "save"
      ? "match.eventSave"
      : event.type === "technique"
        ? "match.eventTechnique"
        : "match.eventMomentum";
  return t(key, { name });
}

export function teamDisplayName(t: Translate, name: string): string {
  return name.startsWith("cpu.") && name in messages.es ? t(name as MessageKey) : name;
}

const serverErrors = new Map<string, MessageKey>([
  ["Origen no permitido.", "error.origin"], ["La sesión de administración ha caducado.", "error.adminExpired"],
  ["Token de seguridad no válido. Recarga el panel.", "error.securityToken"], ["Vuelve a entrar en la sala.", "error.rejoin"],
  ["La sesión ha cambiado. Recarga la página.", "error.sessionChanged"], ["La sala no existe o ha caducado.", "error.roomMissing"],
  ["La sala cambió al mismo tiempo. Inténtalo de nuevo.", "error.roomConflict"], ["No quedan cartas válidas para completar esa formación.", "error.noOptions"],
  ["El panel todavía no tiene una contraseña configurada.", "error.adminDisabled"], ["Contraseña incorrecta.", "error.wrongPassword"],
  ["Carta o puntuación no válida.", "error.invalidCardRating"], ["Carta no encontrada.", "error.cardMissing"],
  ["Configuración de carta no válida.", "error.invalidCardRating"], ["Archivo de valoraciones no válido.", "error.invalidRatingsFile"],
  ["Archivo de configuración no válido.", "error.invalidRatingsFile"], ["La sala ya no existe.", "error.roomAlreadyMissing"],
  ["Revisa los datos de la sala.", "error.invalidRoom"], ["Escribe un nombre válido.", "error.invalidName"],
  ["El draft ya ha empezado.", "error.draftStarted"], ["La sala está completa.", "error.roomFull"],
  ["Ese nombre ya está dentro de la sala.", "error.nameTaken"], ["Entra en la sala para ver la partida.", "error.enterRoom"],
  ["Configuración inválida.", "error.invalidConfig"], ["La configuración ya está bloqueada.", "error.configLocked"],
  ["Miembro no encontrado.", "error.memberMissing"], ["Solo el anfitrión puede iniciar la partida.", "error.hostOnly"],
  ["Marca tu equipo como preparado.", "error.hostReady"], ["La final necesita exactamente dos participantes preparados.", "error.finalNeedsTwo"],
  ["La copa necesita al menos dos participantes preparados.", "error.cupNeedsTwo"], ["No es tu turno.", "error.notTurn"],
  ["Ya tienes una plantilla sobre la mesa.", "error.rollExists"], ["Ya has usado los dos rerolls de este turno.", "error.noRerolls"],
  ["Carta inválida.", "error.invalidCard"], ["Primero debes sortear una plantilla.", "error.rollFirst"],
    ["Esa carta no pertenece a la plantilla actual.", "error.wrongSquad"], ["Esa posición ya está completa.", "error.positionFull"],
    ["Confirma el cambio de posición antes de fichar.", "error.confirmPosition"], ["No hay una plaza libre para ese cambio de posición.", "error.noPositionSlot"],
  ["Otro participante ya eligió a ese personaje.", "error.characterTaken"], ["No se pudo contactar con el servidor.", "error.server"],
]);

export function translatedError(caught: unknown, t: Translate, fallback: MessageKey = "error.generic"): string {
  if (!(caught instanceof Error)) return t(fallback);
  const key = serverErrors.get(caught.message);
  return key ? t(key) : caught.message || t(fallback);
}
