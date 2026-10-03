import type { ReactNode } from "react";

// The real root layout, with <html> and <body>, is src/app/[locale]/layout.tsx.
// This file only exists so that src/app/not-found.tsx has a parent.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
