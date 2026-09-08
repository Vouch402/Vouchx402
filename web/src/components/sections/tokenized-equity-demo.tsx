"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { truncateHex } from "@/lib/format";

// Real Base-mainnet holder, independently confirmed (see DECISION_LOG.md,
// 2026-09-08) via a direct balanceOf call immediately before attesting.
const SUBJECT = "0xb5ef91ce939F2C390cff462bb231E74bb228deB4";

const ATTESTATIONS = [
  { ticker: "AAPLc", uid: "0x093833cf14c60de2368c6297865338c52326de60cce9743cdf5091fa262f5449" },
  { ticker: "GOOGLc", uid: "0x08dfcaf1d6f702cbb967df877ef2d43f2eb6af1646dbed6e8a24ccfc0d83ae73" },
  { ticker: "TSLAc", uid: "0xc212f02e39763b20ce1459dc191457ed3296b5b28ba98b834f9c1d8ba5542ffa" },
] as const;

// Deliberately its own section, not a row type inside RecentActivity: that
// feed is real Base-mainnet activity only, by design (see live-stats.tsx /
// DECISION_LOG.md, "Network selector scope for 7c, clarified"). Mixing
// testnet demo rows into it, even clearly labeled, would present
// development noise with the same visual weight as real usage -- exactly
// what that design choice exists to avoid. This block stays visually and
// structurally separate: its own heading, its own muted/dashed container,
// never inside the <ul> RecentActivity renders.
export function TokenizedEquityDemo() {
  const t = useTranslations("tokenizedEquityDemo");

  return (
    <div className="mt-12 rounded-md border border-dashed border-border bg-muted/30 p-5 sm:p-6">
      <Badge variant="outline" className="border-warning/30 text-warning">
        {t("badge")}
      </Badge>
      <h3 className="mt-3 text-lg font-semibold tracking-tight">{t("title")}</h3>
      <p className="prose-column mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>

      <ul className="mt-4 divide-y divide-border">
        {ATTESTATIONS.map((a) => (
          <li key={a.ticker} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
            <span className="data text-sm font-medium text-foreground">{a.ticker}</span>
            <a
              href={`https://base-sepolia.easscan.org/attestation/view/${a.uid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="data inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
            >
              {t("viewOnExplorer")} ({truncateHex(a.uid)})
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>{t("subject")}</span>
        <a
          href={`https://basescan.org/address/${SUBJECT}`}
          target="_blank"
          rel="noopener noreferrer"
          className="data inline-flex items-center gap-1 text-primary hover:underline"
        >
          {truncateHex(SUBJECT)}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}
