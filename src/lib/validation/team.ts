import { z } from "zod";

/** F10: an owner invites a caretaker by email. */
export const inviteCaretakerSchema = z.object({
  buildingId: z.uuid("generic"),
  email: z.string().trim().toLowerCase().max(254, "emailInvalid").pipe(z.email("emailInvalid")),
});

export type InviteCaretakerInput = z.input<typeof inviteCaretakerSchema>;
