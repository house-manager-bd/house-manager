"use client";

import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { revealContact } from "@/lib/actions/contact";
import type { ErrorKey } from "@/lib/actions/result";
import { formatBdPhoneLocal } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/auth/form-alert";

type Contact = { phone: string | null; whatsapp: string | null };

/** WhatsApp chat link for +8801XXXXXXXXX. */
function waLink(e164: string) {
  return `https://wa.me/${e164.replace(/^\+/, "")}`;
}

/**
 * "Show phone number" for logged-in members. The poster and building
 * managers get their own numbers straight away (initial).
 */
export function RevealPhone({ listingId, initial }: { listingId: string; initial: Contact | null }) {
  const t = useTranslations("AdPage");
  const [contact, setContact] = useState<Contact | null>(initial);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealContact(listingId);
      if (!result.ok) return setError(result.error);
      setContact({ phone: result.data.phone, whatsapp: result.data.whatsapp });
      setRemaining(result.data.remaining);
    });
  }

  if (!contact) {
    return (
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" onClick={reveal} disabled={pending}>
          <Phone aria-hidden />
          {pending ? t("revealing") : t("showPhone")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("revealHint")}</p>
        <FormError error={error} />
      </div>
    );
  }

  const whatsapp = contact.whatsapp ?? contact.phone;
  return (
    <div className="flex flex-col gap-2">
      {contact.phone && (
        <Button asChild size="lg" className="w-full">
          <a href={`tel:${contact.phone}`}>
            <Phone aria-hidden />
            <span dir="ltr">{formatBdPhoneLocal(contact.phone)}</span>
          </a>
        </Button>
      )}
      {whatsapp && (
        <Button asChild variant="outline" className="w-full">
          <a href={waLink(whatsapp)} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden />
            {t("whatsapp")}
            {contact.whatsapp && contact.whatsapp !== contact.phone && (
              <span dir="ltr" className="text-muted-foreground">
                {formatBdPhoneLocal(contact.whatsapp)}
              </span>
            )}
          </a>
        </Button>
      )}
      {remaining !== null && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t("revealsLeft", { count: remaining })}
        </p>
      )}
    </div>
  );
}
