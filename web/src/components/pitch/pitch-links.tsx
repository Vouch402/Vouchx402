"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PitchSlide } from "./pitch-slide";

export function PitchLinks() {
  const t = useTranslations("pitch.links");

  // No GitHub link here: the repo is private (a deliberate, unrelated
  // decision for another grant process). See DECISION_LOG.md.
  const externalLinks = [
    { key: "sdk", href: "https://www.npmjs.com/package/vouch402-sdk" },
    { key: "cli", href: "https://www.npmjs.com/package/vouch402" },
    { key: "mcpServer", href: "https://www.npmjs.com/package/vouch402-mcp-server" },
    { key: "contact", href: "https://t.me/Vaiosx" },
  ] as const;

  return (
    <PitchSlide id="links" eyebrow={t("eyebrow")} index={8}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>

      <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <Link href="/docs" className="inline-flex items-center gap-1 text-primary hover:underline">
          {t("docs")}
        </Link>
        {externalLinks.map(({ key, href }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            {t(key)}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        ))}
      </div>
    </PitchSlide>
  );
}
