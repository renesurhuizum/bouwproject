"use client"; // Error boundaries moeten Client Components zijn

// Route-level foutvangnet: voorkomt een witte pagina bij runtime-fouten
// en geeft de gebruiker een uitweg (opnieuw proberen / herladen).

import { useEffect } from "react";
import { TriangleAlert, RotateCcw } from "lucide-react";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlert size={40} className="text-danger" />
      <div>
        <h1 className="text-lg font-bold text-ink-900">Er ging iets mis</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-500">
          Je projectdata staat veilig op dit apparaat. Probeer het opnieuw of
          herlaad de app.
        </p>
        {error.digest && (
          <p className="mt-2 text-[11px] text-ink-400">Foutcode: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => unstable_retry()}
          className="flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2.5 text-sm font-medium text-paper-raised"
        >
          <RotateCcw size={16} /> Opnieuw proberen
        </button>
        <button
          onClick={() => location.reload()}
          className="rounded-lg border border-line bg-paper-raised px-4 py-2.5 text-sm font-medium text-ink-700"
        >
          Herlaad de app
        </button>
      </div>
    </div>
  );
}
