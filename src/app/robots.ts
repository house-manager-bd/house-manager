import type { MetadataRoute } from "next";
import { deploymentUrl, isLiveDeployment } from "@/lib/site";

// F12: search engines may read public pages (home, search, ads, rights,
// terms, privacy) but not members' pages, which redirect to the login page
// anyway. Preview deployments are closed.
export default function robots(): MetadataRoute.Robots {
  if (!isLiveDeployment()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  const base = deploymentUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/*/dashboard",
        "/*/admin",
        "/*/post",
        "/*/onboarding",
      ],
      // Login and password pages stay crawlable: they carry "noindex", which
      // a crawler can only see if it may read them.
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
