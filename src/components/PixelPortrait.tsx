import { useEffect, useState } from "react";
import { portraitSource } from "../../shared/catalog";
import { useI18n } from "../i18n";
import type { Element } from "../../shared/types";

interface PixelPortraitProps {
  seed: number;
  characterKey: string;
  cardId?: string;
  name: string;
  element: Element;
  colors: [string, string];
  size?: "small" | "medium" | "large";
}

const elementColors: Record<Element, string> = {
  Fire: "#ff5b3f",
  Wind: "#65e9ff",
  Forest: "#7be44b",
  Mountain: "#ffd45b",
};

export function PixelPortrait({ seed, characterKey, cardId, name, element, colors, size = "medium" }: PixelPortraitProps) {
  const { t } = useI18n();
  const source = portraitSource(characterKey, cardId);
  const [imageFailed, setImageFailed] = useState(false);
  const hair = seed % 6;
  const skin = ["#f4b183", "#d98b62", "#8e513b", "#f5c6a5", "#b9684e"][seed % 5];
  const hairColor = ["#17365d", "#5a2418", "#f2d24b", "#f4f7ff", "#3e955d", "#8c4bd8"][Math.floor(seed / 7) % 6];
  const eyeColor = ["#10233c", "#18668c", "#4c2673", "#26734d"][Math.floor(seed / 13) % 4];
  const accent = elementColors[element];

  useEffect(() => setImageFailed(false), [source]);

  if (source && !imageFailed) {
    return (
      <div className={`pixel-portrait pixel-portrait--${size} pixel-portrait--official`} role="img" aria-label={t("card.portrait", { name })}>
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`pixel-portrait pixel-portrait--${size}`} role="img" aria-label={t("card.portraitFallback", { name })}>
      <svg viewBox="0 0 96 96" shapeRendering="crispEdges" aria-hidden="true">
        <rect width="96" height="96" rx="8" fill="#071d3b" />
        <path d="M8 70 30 48h36l22 22v26H8Z" fill={colors[0]} />
        <path d="m31 51 17 16 17-16 9 8-10 37H32L22 59Z" fill={colors[1]} />
        <path d="M43 61h10l5 35H38Z" fill={accent} opacity=".86" />
        <rect x="31" y="25" width="34" height="34" fill={skin} />
        <rect x="27" y="33" width="6" height="17" fill={skin} />
        <rect x="63" y="33" width="6" height="17" fill={skin} />
        {hair === 0 && <path d="M25 31V17h8V9h9v8h8V5h9v12h12v22h-8V27H34v8Z" fill={hairColor} />}
        {hair === 1 && <path d="M23 35V15h10V7h28v7h10v23h-8V25H33v10Z" fill={hairColor} />}
        {hair === 2 && <path d="m22 34 7-23 12 8 8-16 8 16 15-8 2 25-12-10H33Z" fill={hairColor} />}
        {hair === 3 && <path d="M25 37V14h9V6h29v8h8v23h-8V25l-9 8-8-8-13 10V25Z" fill={hairColor} />}
        {hair === 4 && <path d="M21 33 31 7l11 11L53 4l5 16 17-9-7 27-8-11H34l-7 10Z" fill={hairColor} />}
        {hair === 5 && <path d="M24 37V18h8V8h32v7h8v22h-9V25H33v12Z" fill={hairColor} />}
        <rect x="36" y="37" width="8" height="7" fill="#fff" />
        <rect x="53" y="37" width="8" height="7" fill="#fff" />
        <rect x="39" y="39" width="4" height="5" fill={eyeColor} />
        <rect x="54" y="39" width="4" height="5" fill={eyeColor} />
        <rect x="43" y="52" width="11" height="3" fill="#7f3c39" />
        <path d="M4 20 20 4h12L4 32ZM92 67 67 92h14l11-11Z" fill={accent} opacity=".55" />
        <rect x="3" y="3" width="90" height="90" rx="7" fill="none" stroke={accent} strokeWidth="3" />
      </svg>
    </div>
  );
}
