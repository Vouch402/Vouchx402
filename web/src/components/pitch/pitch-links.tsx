"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PitchSlide } from "./pitch-slide";

const TEAM = [
  { key: "eras256", avatar: "/team/eras256.webp", github: "https://github.com/Eras256" },
  { key: "monsxx", avatar: "/team/m0nsxx.webp", github: "https://github.com/M0nsxx" },
] as const;

export function PitchLinks() {
  const t = useTranslations("pitch.links");

  // Repo went public 2026-09-07 (github.com/Vouch402/Vouchx402); the
  // earlier "no GitHub link, repo is private" rule is reversed -- see
  // AGENTS.md and DECISION_LOG.md.
  const externalLinks = [
    { key: "github", href: "https://github.com/Vouch402/Vouchx402" },
    { key: "tryIt", href: "https://www.vouch402.xyz/#try-it" },
    { key: "sdk", href: "https://www.npmjs.com/package/vouch402-sdk" },
    { key: "cli", href: "https://www.npmjs.com/package/vouch402" },
    { key: "mcpServer", href: "https://www.npmjs.com/package/vouch402-mcp-server" },
    { key: "contact", href: "https://t.me/Vaiosx" },
  ] as const;

  return (
    <PitchSlide id="links" eyebrow={t("eyebrow")} index={8}>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h2>

      <h3 className="mt-10 font-medium">{t("team.title")}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {TEAM.map((member) => (
          <a
            key={member.key}
            href={member.github}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-4 rounded-xl border border-border bg-muted/50 p-4 transition-colors hover:border-primary/40 sm:p-5"
          >
            <Image
              src={member.avatar}
              alt={t(`team.${member.key}.name`)}
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium text-foreground">
                {t(`team.${member.key}.name`)}
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden="true"
                />
              </span>
              <p className="mt-1 text-sm text-muted-foreground">{t(`team.${member.key}.role`)}</p>
            </div>
          </a>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm">
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
