"use client";

import dynamic from "next/dynamic";

// F12: the request form brings the validation library (zod) with it. Only
// signed-in members who can ask for the home see it, so it loads as its own
// file instead of with the ad page for every visitor. It is still rendered
// on the server, so members see it at once.
export const RequestFormLazy = dynamic(() => import("./request-form").then((m) => m.RequestForm));
