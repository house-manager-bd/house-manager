import { z } from "zod";

// F9 notifications: shared by the forms and the server actions.

export const notificationIdSchema = z.uuid("generic");

export const emailNotificationsSchema = z.boolean("generic");
