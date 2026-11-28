"use client";

import { Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setPreferredLocale } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher({ signedIn }: { signedIn: boolean }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const target = locale === "bn" ? "en" : "bn";
  // Each label is written in the language it switches to.
  const label = target === "en" ? "English" : "বাংলা";
  const shortLabel = target === "en" ? "EN" : "বাং";

  function switchLanguage() {
    const search = typeof window !== "undefined" ? window.location.search : "";
    startTransition(async () => {
      if (signedIn) await setPreferredLocale(target);
      router.replace(`${pathname}${search}`, { locale: target });
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={switchLanguage}
      disabled={pending}
    >
      <Languages aria-hidden />
      {/* The visible label is the button's name (F12, WCAG "label in name"):
          "English" or "বাংলা", read in its own language. Phones show a short
          form, and screen readers still hear the full word. */}
      <span lang={target} className={target === "en" ? "font-latin" : "font-bangla"}>
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden" aria-hidden>
          {shortLabel}
        </span>
        <span className="sr-only sm:hidden">{label}</span>
      </span>
    </Button>
  );
}
