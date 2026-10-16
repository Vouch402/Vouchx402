"use client";

import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Sun, Moon, Monitor } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("selectors");
  const hydrated = useHydrated();
  // `theme` is only meaningful once next-themes has read localStorage
  // client-side. Gating on `hydrated` (useSyncExternalStore, not a
  // useState+useEffect pair) keeps the first client render identical to
  // the server's — real bug found 2026-09-18: without this, a returning
  // visitor with an explicit light/dark choice saved renders a different
  // icon than SSR did, and React discards+rebuilds the whole subtree
  // (a real console error, not just noise). See DECISION_LOG.md.
  const current = (hydrated ? (theme ?? "system") : "system") as keyof typeof ICONS;
  const Icon = ICONS[current] ?? Monitor;

  const options: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: t("light") },
    { value: "dark", label: t("dark") },
    { value: "system", label: t("system") },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label={t("theme")} className="gap-1.5 px-2">
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align={compact ? "start" : "end"}>
        {options.map((opt) => {
          const OptIcon = ICONS[opt.value];
          return (
            <DropdownMenuItem
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              aria-current={opt.value === current ? "true" : undefined}
              className="gap-2"
            >
              <OptIcon className="size-4" aria-hidden="true" />
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
