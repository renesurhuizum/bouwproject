// 404-pagina met een route terug naar het dashboard.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-bold text-ink-900">Pagina niet gevonden</h1>
      <p className="max-w-sm text-sm text-ink-500">
        Deze pagina bestaat niet (meer). Ga terug naar het dashboard.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-medium text-paper-raised"
      >
        Naar dashboard
      </Link>
    </div>
  );
}
