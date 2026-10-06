import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentPrivateProfile, getCurrentProfile, getCurrentUser } from "@/lib/auth";
import { formatBdPhoneLocal } from "@/lib/phone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { ProfileForm } from "@/components/profile/profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Profile");
  return { title: t("title"), robots: { index: false } };
}

export default async function ProfilePage({ params }: PageProps<"/[locale]/dashboard/profile">) {
  const { locale } = await params;
  const t = await getTranslations("Profile");
  // Run the three lookups at the same time instead of one after another.
  const [user, profile, privateProfile] = await Promise.all([
    getCurrentUser(),
    getCurrentProfile(),
    getCurrentPrivateProfile(),
  ]);
  if (!user || !profile?.default_mode) return null; // The layout redirects first.

  const signedInWithGoogle = user.provider === "google";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("photo")}</CardTitle>
        </CardHeader>
        <CardContent>
          <AvatarUpload
            userId={user.id}
            avatarUrl={profile.avatar_url}
            fullName={profile.full_name}
            email={user.email}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("accountSection")}</CardTitle>
          <CardDescription>
            {signedInWithGoogle ? t("signedInWithGoogle") : t("signedInWithEmail")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            email={user.email}
            defaultValues={{
              fullName: profile.full_name,
              phone: formatBdPhoneLocal(privateProfile?.phone),
              locale: (profile.preferred_locale ?? locale) as "bn" | "en",
              mode: profile.default_mode,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
