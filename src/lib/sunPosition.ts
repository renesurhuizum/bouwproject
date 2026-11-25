// Zonnestand-berekening (NOAA / SunCalc-algoritme, pure functie, geen lib).
// Geeft azimut (graden vanaf noord, met de klok mee) en elevatie (graden boven
// de horizon) plus een genormaliseerde richtingsvector voor de 3D-scene.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

function toDays(date: Date): number {
  return date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
}
function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}
function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion van de aarde
  return M + C + P + Math.PI;
}
function declination(l: number): number {
  return Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));
}
function rightAscension(l: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));
}
function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

export function sunAzimuthElevation(
  date: Date,
  lat: number,
  lng: number,
): { azimuth: number; elevation: number } {
  const lw = RAD * -lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const ra = rightAscension(L);
  const H = siderealTime(d, lw) - ra;

  const elevation = Math.asin(
    Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H),
  );
  // Azimut vanaf het zuiden (met de klok mee); +180 → vanaf het noorden.
  const azSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const azimuth = (((azSouth + Math.PI) / RAD) % 360 + 360) % 360;
  return { azimuth, elevation: elevation / RAD };
}

// Richtingsvector naar de zon in scene-coördinaten (x oost, y omhoog, z zuid).
// azimut 0 = noord (−z), 90 = oost (+x).
export function sunDirection(date: Date, lat: number, lng: number): [number, number, number] {
  const { azimuth, elevation } = sunAzimuthElevation(date, lat, lng);
  const az = azimuth * RAD;
  const el = elevation * RAD;
  const h = Math.cos(el);
  return [h * Math.sin(az), Math.sin(el), -h * Math.cos(az)];
}
