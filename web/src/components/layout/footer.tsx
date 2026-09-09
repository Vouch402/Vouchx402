"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

const API_URL = "https://vouch402.fly.dev";
// Repo went public 2026-09-07 (github.com/Vouch402/Vouchx402); restores
// the link removed 2026-08-30 while it was still private. See AGENTS.md
// and DECISION_LOG.md.
const GITHUB_URL = "https://github.com/Vouch402/Vouchx402";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="max-w-md text-sm text-muted-foreground">{t("tagline")}</p>

        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Link href="/docs" className="text-muted-foreground transition-colors hover:text-foreground">
            {t("docs")}
          </Link>
          <Link href="/legal" className="text-muted-foreground transition-colors hover:text-foreground">
            {t("legal")}
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("github")}
          </a>
          <a
            href={API_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="data text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("api")}
          </a>
        </nav>

        <p className="text-xs text-muted-foreground">{t("copyright", { year })}</p>
      </div>
    </footer>
  );
}
