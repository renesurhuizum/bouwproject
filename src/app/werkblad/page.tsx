"use client";

// Het werkblad is opgegaan in de documenten-hub, samen met de aanzichten en de
// kostenraming. Deze route blijft bestaan voor oude links en bladwijzers.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function WerkbladPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/documenten");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center text-sm text-ink-500">
      Documenten openen…
    </div>
  );
}
