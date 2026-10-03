import { z } from "zod";

// Error messages are translation keys under "Errors" in messages/*.json.

export const emailSchema = z
  .string()
  .trim()
  .min(1, "required")
  .pipe(z.email("emailInvalid"));

export const passwordSchema = z
  .string()
  .min(8, "passwordMin")
  .max(72, "passwordMax");

export const modeSchema = z.enum(["seek", "host"], { error: "modeRequired" });
export const localeSchema = z.enum(["bn", "en"]);

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "nameMin")
  .max(80, "nameMax");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "required"),
});

export const signupSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "required"),
    mode: modeSchema,
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
