import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A styled native <select>. Native pickers are the easiest to use on phones
 * and work with screen readers out of the box.
 */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-10 w-full appearance-none rounded-md border border-input bg-background py-2 pr-9 pl-3 text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export { NativeSelect };
