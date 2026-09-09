"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { PitchSlide } from "./pitch-slide";
import { Badge } from "@/components/ui/badge";

const ATTESTATION_URL = "https://base-sepolia.easscan.org/attestation/view/0x88c6ec5aa0fe069ebce61d2a9d69a49e03bee156ad5586998f6949777cfe751c";

// Basescan, not the (private) GitHub repo: the same three tickers named
// in the "shipped" body text, now clickable, real, independently
// verified live (each returned its exact ticker from an on-chain
// symbol() call before being bundled — see DECISION_LOG.md).
const VERIFIED_CONTRACTS = [
  { ticker: "AAPLc", address: "0xb200000000000000000000C2e324d24d7eEcd1fb" },
  { ticker: "TSLAc", address: "0xb2000000000000000000001e800a7f5189430cD0" },
  { ticker: "NVDAc", address: "0xb20000000000000000000078ee7ce2fE4908108C" },
] as const;

export function PitchTokenizedEquities() {
  const t = useTranslations("pitch.tokenizedEquities");

  return (
    <PitchSlide id="tokenized-equities" eyebrow={t("eyebrow")} index={6}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>
      <p className="prose-column mt-3 text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-10 rounded-xl border border-border bg-muted/50 p-5 sm:p-6">
        <Badge variant="outline" className="border-success/30 text-success">
          {t("shipped.label")}
        </Badge>
        <h3 className="mt-3 font-medium">{t("shipped.title")}</h3>
        <p className="prose-column mt-2 text-sm text-muted-foreground">{t("shipped.body")}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {VERIFIED_CONTRACTS.map((c) => (
            <a
              key={c.ticker}
              href={`https://basescan.org/token/${c.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="data inline-flex items-center gap-1 text-primary hover:underline"
            >
              {t("links.contract", { ticker: c.ticker })}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/50 p-5 sm:p-6">
        <Badge variant="outline" className="border-warning/30 text-warning">
          {t("prototype.label")}
        </Badge>
        <h3 className="mt-3 font-medium">{t("prototype.title")}</h3>
        <p className="prose-column mt-2 text-sm text-muted-foreground">{t("prototype.body")}</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a
            href={ATTESTATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("links.attestation")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
          <a
            href="https://www.vouch402.xyz/#live-activity"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("links.moreExamples")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="prose-column mt-6 text-sm text-muted-foreground">{t("closing")}</p>
    </PitchSlide>
  );
}
