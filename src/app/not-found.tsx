"use client";

import Error from "next/error";

// Shown for requests outside any locale, which the proxy normally redirects.
export default function GlobalNotFound() {
  return (
    <html lang="bn">
      <body>
        <Error statusCode={404} />
      </body>
    </html>
  );
}
