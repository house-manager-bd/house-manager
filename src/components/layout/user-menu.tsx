"use client";

import { ArrowLeftRight, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { logout } from "@/lib/actions/auth";
import { setMode } from "@/lib/actions/profile";
import type { AppMode } from "@/types/database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  fullName: string;
  email: string;
  avatarUrl: string | null;
  mode: AppMode | null;
};

export function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function UserMenu({ fullName, email, avatarUrl, mode }: Props) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextMode: AppMode = mode === "host" ? "seek" : "host";

  function switchMode() {
    startTransition(async () => {
      const result = await setMode(nextMode);
      if (result.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={t("openMenu")}
      >
        <Avatar className="size-9 border">
          {avatarUrl && <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initials(fullName, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{fullName || email}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {mode === "host" ? t("modeHost") : t("modeSeek")}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard">
            <LayoutDashboard aria-hidden />
            {t("dashboard")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">
            <UserRound aria-hidden />
            {t("profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={pending} onSelect={switchMode}>
          <ArrowLeftRight aria-hidden />
          {nextMode === "host" ? t("switchToHost") : t("switchToSeek")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => startTransition(() => logout())}
        >
          <LogOut aria-hidden />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
