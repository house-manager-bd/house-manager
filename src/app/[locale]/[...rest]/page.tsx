import { notFound } from "next/navigation";

// Sends unknown paths such as /bn/abc to src/app/[locale]/not-found.tsx,
// so the 404 page has the header, footer and the right language.
export default function CatchAll() {
  notFound();
}
