"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NAV_LINKS } from "./nav-links";
import { LanguageSelector } from "./language-selector";
import { NetworkSelector } from "./network-selector";
import { ThemeSelector } from "./theme-selector";
import { MobileMenu } from "./mobile-menu";

// Repo went public 2026-09-07 (github.com/Vouch402/Vouchx402); restores
// the link removed 2026-08-30 while it was still private. See AGENTS.md
// and DECISION_LOG.md.
const GITHUB_URL = "https://github.com/Vouch402/Vouchx402";

export function Navbar() {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav aria-label={t("home")} className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            // nativeButton={false}: these render as <a>, not <button>, a
            // deliberate choice (they're navigation, not actions), not an
            // oversight. Base UI's Button defaults to expecting a real
            // <button> and warns otherwise; this makes the choice explicit.
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={link.href}>{t(link.labelKey)}</Link>}
            />
          ))}
        </nav>

        <div className="hidden items-center gap-0.5 lg:flex">
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                {t("github")}
              </a>
            }
          />
          <LanguageSelector />
          <NetworkSelector />
          <ThemeSelector />
        </div>

        <div className="lg:hidden">
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
