import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "../i18n";

export function Dialog({ title, children, close, busy = false, className = "" }: { title: string; children: ReactNode; close: () => void; busy?: boolean; className?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      queueMicrotask(() => { if (opener?.isConnected && !document.querySelector("dialog[open]")) opener.focus(); });
    };
  }, []);
  return <dialog ref={ref} className={`product-dialog ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label={t("app.close")} disabled={busy} onClick={close}><X /></button></header>
    <div className="product-dialog-body">{children}</div>
  </dialog>;
}
