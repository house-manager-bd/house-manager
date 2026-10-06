// Shown instantly while a dashboard page loads on the server, so a click
// never looks like nothing happened.
export default function DashboardLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-56 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-md rounded-md bg-muted" />
      </div>
      <div className="h-40 rounded-xl border bg-card" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-32 rounded-xl border bg-card" />
        <div className="h-32 rounded-xl border bg-card" />
      </div>
    </div>
  );
}
