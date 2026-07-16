"use client"; // Error boundaries moeten Client Components zijn

// Vangnet voor fouten in de root layout zelf. Vervangt de hele pagina en
// moet daarom eigen <html>/<body> en styles meebrengen.

import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="nl">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-lg font-bold text-ink-900">Er ging iets mis</h1>
        <p className="max-w-sm text-sm text-ink-500">
          De app kon niet worden geladen. Je projectdata staat veilig op dit
          apparaat.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => unstable_retry()}
            className="rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-medium text-paper-raised"
          >
            Opnieuw proberen
          </button>
          <button
            onClick={() => location.reload()}
            className="rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink-700"
          >
            Herlaad de app
          </button>
        </div>
      </body>
    </html>
  );
}
