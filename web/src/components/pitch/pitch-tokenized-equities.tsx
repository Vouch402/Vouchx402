"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { PitchSlide } from "./pitch-slide";
import { Badge } from "@/components/ui/badge";

const GITHUB_URL = "https://github.com/Eras256/Vouchx402";
const ATTESTATION_URL = "https://base-sepolia.easscan.org/attestation/view/0x88c6ec5aa0fe069ebce61d2a9d69a49e03bee156ad5586998f6949777cfe751c";
const CONTRACT_LIST_URL = `${GITHUB_URL}/blob/master/src/scoring/tokenized-equities.json`;

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
            href={CONTRACT_LIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t("links.contractList")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      <p className="prose-column mt-6 text-sm text-muted-foreground">{t("closing")}</p>
    </PitchSlide>
  );
}
