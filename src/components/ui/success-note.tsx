import { CircleCheck } from "lucide-react";
import { Alert } from "./alert";

/** A success message for server-rendered pages. */
export function FormSuccessStatic({ title, body }: { title: string; body?: string }) {
  return (
    <Alert variant="success">
      <CircleCheck aria-hidden />
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        {body && <span className="text-foreground">{body}</span>}
      </span>
    </Alert>
  );
}
