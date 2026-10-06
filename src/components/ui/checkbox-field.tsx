import * as React from "react";
import { cn } from "@/lib/utils";

/** A native checkbox with its label, in a large tap area. */
function CheckboxField({
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        className,
      )}
    >
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" {...props} />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export { CheckboxField };
