import { VouchMark } from "@/components/layout/logo";

// The hero's animated brand mark: the same V-and-seal icon as the navbar
// logo, given real motion for the one place on the site that should feel
// alive. Every layer maps to something Vouch402 actually does, not a
// generic decorative loop:
//  - the two expanding rings = a fulfillment attestation broadcasting
//    on-chain (x402-SAP), staggered so a new ripple starts before the
//    last one fades, like real on-chain activity would.
//  - the dashed rotating ring = continuous verification (reuses the
//    same dashed-ring motif as the brand pack's own "attested" badge).
//  - the breathing glow = the seal "warming up" between attestations.
// Pure CSS (@keyframes in globals.css), matching this codebase's existing
// animation approach (the eyebrow badge's ping dot) rather than adding a
// new animation-library dependency.
export function HeroMark() {
  return (
    <span className="hero-mark" aria-hidden="true">
      <span className="hero-mark__ring" />
      <span className="hero-mark__ring hero-mark__ring--delay" />
      <svg className="hero-mark__dashed" viewBox="0 0 100 100" width="72" height="72">
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.4"
          strokeDasharray="3 5"
          opacity="0.5"
        />
      </svg>
      <span className="hero-mark__panel">
        <VouchMark size={30} />
      </span>
    </span>
  );
}
