import { MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatBdPhoneLocal } from "@/lib/phone";
import { Button } from "@/components/ui/button";

/** Call and WhatsApp buttons for a shortlisted seeker's number (F6). */
export function PhoneLinks({ phone }: { phone: string }) {
  const t = useTranslations("AdPage");
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm">
        <a href={`tel:${phone}`}>
          <Phone aria-hidden />
          <span dir="ltr">{formatBdPhoneLocal(phone)}</span>
        </a>
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={`https://wa.me/${phone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden />
          {t("whatsapp")}
        </a>
      </Button>
    </div>
  );
}
