"use client";

// De 3D-weergave zit sinds de werkruimte-omzetting in /plattegrond. Deze route
// blijft bestaan zodat oude links, bladwijzers en de PWA-snelkoppeling blijven
// werken: hij zet de weergave en stuurt door.

import { ViewRedirect } from "@/components/workspace/ViewRedirect";

export default function ThreeDPage() {
  return <ViewRedirect view="3d" label="3D" />;
}
