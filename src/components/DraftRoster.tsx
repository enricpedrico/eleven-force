import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Users } from "lucide-react";
import { useI18n } from "../i18n";

export function DraftRoster({ children, count, multiplayer = false }: { children: ReactNode; count: number; multiplayer?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  return <aside className={`draft-sidebar${multiplayer ? " multiplayer-sidebar" : ""} compact-roster`}>
    <button type="button" className="roster-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><Users /><span>{t(multiplayer ? "draft.viewTeams" : "solo.myLineup")}</span><b>{count}/11</b><ChevronDown /></button>
    <div id={id} className={`roster-content${open ? " is-expanded" : ""}`}>{children}</div>
  </aside>;
}
