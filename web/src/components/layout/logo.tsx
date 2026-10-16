"use client";

import Link from "next/link";
import { useId } from "react";

// The "V" (Vouch) mark: two bold strokes meeting at a single circular
// aperture — the on-chain attestation seal this product actually stamps
// on every fulfilled request (x402-SAP), not a generic checkmark/shield.
// Full derivation, benchmarking, and clearance-check notes:
// /branding-vouch402 (this exact path data is icon.svg in that pack).
function VouchMark({ size = 28 }: { size?: number }) {
  const maskId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          <circle cx="51.0" cy="84.0" r="4.21" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`} fill="#0052FF">
        <path d="M 7.85 19.35 L 43.09 88.30 L 58.91 79.70 L 20.15 12.65 Z" />
        <path d="M 80.45 11.89 L 41.86 79.03 L 60.14 88.97 L 95.55 20.11 Z" />
        <circle cx="51.0" cy="84.0" r="9.568" />
        <circle cx="14.0" cy="16.0" r="7.0" />
        <circle cx="88.0" cy="16.0" r="8.6" />
      </g>
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <VouchMark />
      <span className="flex items-baseline gap-1">
        <span>Vouch</span>
        <span className="font-mono text-[0.8em] font-bold text-primary">402</span>
      </span>
    </Link>
  );
}

export { VouchMark };
