import type { ReactNode } from "react";
import type { ResourceId } from "../../game/content/defs";

/**
 * UI-RESET-51: SVG-only glyphs. Every icon is aria-hidden and carries no <text>,
 * so it contributes nothing to textContent (the i18n and resting-screen censuses
 * read text, not markup) and never becomes a color-only cue: the shape itself is
 * the identity, and color is a redundant second channel. `currentColor` lets the
 * chip CSS tint each glyph from the palette without a per-icon style prop.
 */

interface GlyphProps {
  className?: string;
  size?: number;
}

function Svg({ className, size = 12, children }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** A distinct silhouette per resource so shapes, not hues, carry identity. */
export function ResourceGlyph({ id, className, size }: GlyphProps & { id: ResourceId | string }) {
  return (
    <Svg className={className} size={size}>
      {resourceShape(id)}
    </Svg>
  );
}

function resourceShape(id: ResourceId | string) {
  switch (id) {
    case "scrap":
      return <path d="M8 2 14 13H2Z" />;
    case "ferrous":
      return <rect x="3" y="3" width="10" height="10" />;
    case "nonferrous":
      return <path d="M8 1 15 8 8 15 1 8Z" />;
    case "residue":
      return <circle cx="8" cy="8" r="4" />;
    case "steel":
      return <path d="M8 1 14 4.5v7L8 15 2 11.5v-7Z" />;
    case "copper":
      return <circle cx="8" cy="8" r="6" />;
    case "polymer":
      return <rect x="2" y="4" width="12" height="8" rx="3" />;
    case "wire":
      return <rect x="1" y="7" width="14" height="2" />;
    case "plates":
      return <path d="M2 4h12v3H2Zm0 5h12v3H2Z" />;
    case "circuits":
      return <path fillRule="evenodd" d="M3 3h10v10H3Zm3 3v4h4V6Z" />;
    case "data":
      return <path d="M3 8h2v4H3Zm4-4h2v8H7Zm4 2h2v6h-2Z" />;
    case "motors":
      return (
        <path
          fillRule="evenodd"
          d="M8 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
        />
      );
    case "battery":
      return <path d="M2 5h10v6H2Zm11 2h2v2h-2Z" />;
    case "alloy":
      return <path d="M8 1 15 6l-2.5 8h-9L1 6Z" />;
    case "chassis":
      return <path d="M3 4h10l2 8H1Z" />;
    default:
      return <circle cx="8" cy="8" r="5" />;
  }
}

export function CoinIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path
        fillRule="evenodd"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z"
      />
    </Svg>
  );
}

export function BoxIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M8 1 15 5v6l-7 4-7-4V5Z" />
    </Svg>
  );
}

export function WarnIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path
        fillRule="evenodd"
        d="M8 1 15 14H1Zm-1 5v4h2V6Zm0 5v2h2v-2Z"
      />
    </Svg>
  );
}

export function BoltIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M9 1 3 9h4l-1 6 7-9H8Z" />
    </Svg>
  );
}

export function GearIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <circle cx="8" cy="8" r="3" />
      <path
        d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </Svg>
  );
}

export function GridIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M2 2h5v5H2Zm7 0h5v5H9ZM2 9h5v5H2Zm7 0h5v5H9Z" />
    </Svg>
  );
}

export function ChevronUpIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M3 10 8 5l5 5" fill="none" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}

export function ChevronDownIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}

export function CloseIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path d="M3 3l10 10M13 3 3 13" fill="none" stroke="currentColor" strokeWidth="2" />
    </Svg>
  );
}

export function EyeIcon({ className, size }: GlyphProps) {
  return (
    <Svg className={className} size={size}>
      <path
        fillRule="evenodd"
        d="M8 3C4 3 1.5 8 1.5 8S4 13 8 13s6.5-5 6.5-5S12 3 8 3Zm0 2.5A2.5 2.5 0 1 1 8 10.5 2.5 2.5 0 0 1 8 5.5Z"
      />
    </Svg>
  );
}