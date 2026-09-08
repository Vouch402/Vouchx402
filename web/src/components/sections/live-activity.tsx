import { LiveStats } from "./live-stats";
import { RecentActivity } from "./recent-activity";
import { TokenizedEquityDemo } from "./tokenized-equity-demo";

// One nav entry ("Live activity") and one anchor id cover both the Live
// stats and Recent activity feed sections from the IA; they're two
// distinct pieces of content but one destination to jump to.
export function LiveActivity() {
  return (
    <section id="live-activity" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <LiveStats />
        <RecentActivity />
        {/* Deliberately outside RecentActivity's own <ul>/rendering: a
            separate, differently-styled block so a testnet demo can never
            read as another row in the real mainnet feed above it. See
            tokenized-equity-demo.tsx. */}
        <TokenizedEquityDemo />
      </div>
    </section>
  );
}
