// Nederlandse opmaak van maten, oppervlak en geld.

const euro = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const euroPrecies = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEuro(amount: number, precies = false): string {
  return (precies ? euroPrecies : euro).format(amount);
}

// Lengte in meters → leesbaar (m of cm).
export function formatLength(meters: number): string {
  if (Math.abs(meters) < 1) {
    return `${Math.round(meters * 100)} cm`;
  }
  return `${meters.toFixed(2).replace(".", ",")} m`;
}

export function formatArea(m2: number): string {
  return `${m2.toFixed(1).replace(".", ",")} m²`;
}

export function formatHeight(meters: number): string {
  return `${Math.round(meters * 100)} cm`;
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}
