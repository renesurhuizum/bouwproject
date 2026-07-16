// Route-level laadstatus, in dezelfde stijl als de Bootstrap-lader.

export default function Loading() {
  return (
    <div className="flex h-dvh items-center justify-center text-ink-500">
      <div className="animate-pulse text-sm tracking-wide">Laden…</div>
    </div>
  );
}
