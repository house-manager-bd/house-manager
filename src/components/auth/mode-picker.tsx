"use client";

import { Building2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AppMode } from "@/types/database";

/** The one sign-up question: "Find a home" or "Rent out my property". */
export function ModePicker({
  value,
  onChange,
  name = "mode",
  invalid,
}: {
  value?: AppMode;
  onChange: (mode: AppMode) => void;
  name?: string;
  invalid?: boolean;
}) {
  const t = useTranslations("Auth");
  const options = [
    { value: "seek" as const, icon: Search, title: t("modeSeekTitle"), body: t("modeSeekBody") },
    { value: "host" as const, icon: Building2, title: t("modeHostTitle"), body: t("modeHostBody") },
  ];

  return (
    <div role="radiogroup" aria-invalid={invalid || undefined} className="grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const checked = value === option.value;
        const Icon = option.icon;
        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              checked ? "border-primary bg-primary/5" : "hover:bg-muted",
              invalid && !value && "border-destructive",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-md",
                checked ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{option.title}</span>
              <span className="text-sm text-muted-foreground">{option.body}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
