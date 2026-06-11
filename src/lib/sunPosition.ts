// NOAA-gebaseerde zonnestand berekening.
// Geeft azimut (0=Noord, 90=Oost) en elevatie (graden boven horizon) terug.

export interface SunPosition {
  azimuth: number;   // graden, 0=Noord, 90=Oost, 180=Zuid, 270=West
  elevation: number; // graden boven horizon (negatief = onder horizon)
}

function toRad(deg: number) { return (deg * Math.PI) / 180; }
function toDeg(rad: number) { return (rad * 180) / Math.PI; }

export function sunAzimuthElevation(date: Date, lat: number, lng: number): SunPosition {
  // Juliaans daggetal
  const JD = date.getTime() / 86400000 + 2440587.5;
  const JC = (JD - 2451545.0) / 36525;

  // Geometrische middellange lengtegraad zon (graden)
  const L0 = (280.46646 + JC * (36000.76983 + JC * 0.0003032)) % 360;
  // Middellange anomalie zon (graden)
  const M = 357.52911 + JC * (35999.05029 - JC * 0.0001537);
  // Middelpuntsvergelijking
  const C =
    Math.sin(toRad(M)) * (1.914602 - JC * (0.004817 + 0.000014 * JC)) +
    Math.sin(toRad(2 * M)) * (0.019993 - 0.000101 * JC) +
    Math.sin(toRad(3 * M)) * 0.000289;
  // Ware zonnelengte
  const sunLon = L0 + C;
  // Obliquiteit van de ecliptica
  const epsilon = 23.439291111 - JC * (0.013004167 + JC * (0.0000001639 - JC * 0.0000005036));
  // Rechte klimming en declinatie
  const lambda = toRad(sunLon);
  const decl = toDeg(Math.asin(Math.sin(toRad(epsilon)) * Math.sin(lambda)));

  // Gemiddelde tijdgelijkingsterm
  const e0 = toRad(epsilon);
  const y = Math.tan(e0 / 2) ** 2;
  const l0r = toRad(L0);
  const Mrad = toRad(M);
  const EqT =
    toDeg(
      y * Math.sin(2 * l0r)
      - 2 * 0.016708634 * Math.sin(Mrad)
      + 4 * 0.016708634 * y * Math.sin(Mrad) * Math.cos(2 * l0r)
      - 0.5 * y * y * Math.sin(4 * l0r)
      - 1.25 * 0.016708634 ** 2 * Math.sin(2 * Mrad)
    ) * 4;

  // Zonnetijd
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolarMinutes = utcMinutes + EqT + 4 * lng;
  const hourAngle = trueSolarMinutes / 4 - 180; // graden

  // Zonne-hoogte
  const latR = toRad(lat);
  const declR = toRad(decl);
  const sinElev = Math.sin(latR) * Math.sin(declR) + Math.cos(latR) * Math.cos(declR) * Math.cos(toRad(hourAngle));
  const elevation = toDeg(Math.asin(Math.max(-1, Math.min(1, sinElev))));

  // Azimut
  const cosAz = (Math.sin(declR) - Math.sin(latR) * sinElev) / (Math.cos(latR) * Math.cos(toRad(elevation)));
  let azimuth = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (hourAngle > 0) azimuth = 360 - azimuth;

  return { azimuth, elevation };
}

// Converteer azimut + elevatie naar een Three.js directional light richting (genormaliseerd vector).
export function sunToLightDir(az: number, elev: number): [number, number, number] {
  const azRad = toRad(az);
  const elevRad = toRad(Math.max(0.1, elev)); // nooit onder horizon voor lichtbrekening
  const x = Math.sin(azRad) * Math.cos(elevRad);
  const y = Math.sin(elevRad);
  const z = -Math.cos(azRad) * Math.cos(elevRad);
  return [x, y, z];
}
