"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { PitchSlide } from "./pitch-slide";

const TEAM = [
  {
    key: "eras256",
    avatar: "/team/eras256.webp",
    links: [{ label: "github.com/Eras256", href: "https://github.com/Eras256" }],
  },
  {
    key: "monsxx",
    avatar: "/team/m0nsxx.webp",
    links: [
      { label: "github.com/M0nsxx", href: "https://github.com/M0nsxx" },
      { label: "@smithserrat", href: "https://x.com/smithserrat" },
    ],
  },
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
          <div key={member.key} className="flex items-start gap-4 rounded-xl border border-border bg-muted/50 p-4 sm:p-5">
            <Image
              src={member.avatar}
              alt={t(`team.${member.key}.name`)}
              width={56}
              height={56}
              className="size-14 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{t(`team.${member.key}.name`)}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t(`team.${member.key}.role`)}</p>
              <p className="mt-2 flex flex-wrap gap-x-1.5 text-xs">
                {member.links.map((link, i) => (
                  <span key={link.href} className="flex items-center gap-1.5">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="data text-primary hover:underline"
                    >
                      {link.label}
                    </a>
                    {i < member.links.length - 1 && <span className="text-muted-foreground">·</span>}
                  </span>
                ))}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground sm:p-5">
        {t("team.busFactor")}
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
