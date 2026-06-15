// Dak-mesh generatie. Pure berekening op basis van de bounding box van de
// dakvoet (W = breedte langs X, D = diepte langs Z). Geeft losse driehoeken
// terug (positions + indices); normalen worden door three berekend, materiaal
// rendert dubbelzijdig zodat winding er niet toe doet.
//
// Coördinaten: gecentreerd op de oorsprong, y=0 op de dakvoet (eaves),
// +y omhoog. De nok loopt langs de X-as (ridgeDirection draait het geheel
// in de 3D-scene).

import type { RoofType } from "./domain/types";

export interface RoofMesh {
  positions: number[];
  indices: number[];
  ridgeHeight: number;
}

function builder() {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    return positions.length / 3 - 1;
  };
  const tri = (a: number, b: number, c: number) => indices.push(a, b, c);
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  return { positions, indices, v, tri, quad };
}

export function buildRoof(
  type: RoofType,
  W: number,
  D: number,
  pitchDeg: number,
  overhang: number,
): RoofMesh {
  const b = builder();
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const pitch = (pitchDeg * Math.PI) / 180;

  if (type === "flat") {
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, 0, hd);
    const e = b.v(-hw, 0, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, ridgeHeight: 0 };
  }

  if (type === "shed") {
    const h = Math.tan(pitch) * (2 * hd);
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, h, hd);
    const e = b.v(-hw, h, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, ridgeHeight: h };
  }

  if (type === "hip") {
    const h = Math.tan(pitch) * (D / 2);
    const rx = Math.max(0, hw - hd); // 45° heupen
    const r0 = b.v(-rx, h, 0);
    const r1 = b.v(rx, h, 0);
    const A = b.v(-hw, 0, -hd);
    const B = b.v(hw, 0, -hd);
    const C = b.v(hw, 0, hd);
    const Dd = b.v(-hw, 0, hd);
    b.quad(A, B, r1, r0); // lange schuine vlak (z-)
    b.quad(Dd, r0, r1, C); // lange schuine vlak (z+)
    b.tri(A, r0, Dd); // heupvlak x-
    b.tri(B, C, r1); // heupvlak x+
    return { positions: b.positions, indices: b.indices, ridgeHeight: h };
  }

  // gable (zadeldak) + mansard (benaderd als steil zadeldak)
  const h = Math.tan(pitch) * hd;
  const r0 = b.v(-hw, h, 0);
  const r1 = b.v(hw, h, 0);
  const A = b.v(-hw, 0, -hd);
  const B = b.v(hw, 0, -hd);
  const C = b.v(hw, 0, hd);
  const Dd = b.v(-hw, 0, hd);
  b.quad(A, B, r1, r0); // schuin vlak z-
  b.quad(Dd, r0, r1, C); // schuin vlak z+
  b.tri(A, r0, Dd); // topgevel x-
  b.tri(B, C, r1); // topgevel x+
  return { positions: b.positions, indices: b.indices, ridgeHeight: h };
}
