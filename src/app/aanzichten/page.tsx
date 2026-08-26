"use client";

// Wandaanzichten zitten sinds de werkruimte-omzetting in /plattegrond; de
// volledige printset staat in /documenten. Deze route stuurt door.

import { ViewRedirect } from "@/components/workspace/ViewRedirect";

export default function AanzichtenPage() {
  return <ViewRedirect view="elevation" label="Aanzichten" />;
}
