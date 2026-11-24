// BCF 2.1-export: botsingen/aandachtspunten als "issues" die architect,
// constructeur of installateur in hun eigen BIM-software openen (Revit,
// ArchiCAD, Solibri, BIMcollab, Bonsai…). Elk issue heeft een camerastandpunt
// op de plek van het probleem en selecteert de betrokken IFC-elementen —
// dezelfde GUID's als de IFC-export, dus het werkt samen met dat bestand.

import type { ProjectModel } from "../model";
import { findEntity } from "../model";
import { ifcGuid } from "../ifc/step";
import { makeZip, type ZipEntry } from "../zip";
import type { Point } from "../domain/types";

export interface BcfIssue {
  severity: "error" | "warn" | "info";
  category: string;
  message: string;
  levelId: string;
  entityIds: string[];
  at?: Point;
}

const xml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Deterministische UUID (v4-vorm) uit een sleutel, zodat hetzelfde issue dezelfde GUID houdt. */
export function uuidFrom(key: string): string {
  const hex: string[] = [];
  for (let k = 0; k < 4; k++) {
    let h = (0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h ^= h >>> 12;
    hex.push(h.toString(16).padStart(8, "0"));
  }
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${"89ab"[parseInt(s[16], 16) & 3]}${s.slice(17, 20)}-${s.slice(20, 32)}`;
}

/** IFC GlobalId zoals de IFC-export die voor dit element gebruikt. */
function exportedGuid(model: ProjectModel, id: string): string {
  const found = findEntity(model, id);
  if (found && (found.kind === "plumbing" || found.kind === "hvac")) {
    const lm = model.levels.find((l) => l.level.id === found.levelId);
    const item = [...(lm?.plumbing ?? []), ...(lm?.hvac ?? [])].find((x) => x.id === id);
    // Leidingtrajecten worden per segment geëxporteerd; selecteer het eerste.
    if (item?.path && item.path.length >= 2) return ifcGuid(`${id}:0`);
  }
  return ifcGuid(id);
}

const PRIORITY = { error: "Critical", warn: "Normal", info: "Minor" } as const;

export function exportBcf(model: ProjectModel, issues: BcfIssue[], author = "Bouwproject"): Uint8Array {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const projectGuid = uuidFrom(`${model.project.id}:bcf-project`);
  const entries: ZipEntry[] = [
    {
      name: "bcf.version",
      data: `<?xml version="1.0" encoding="UTF-8"?>\n<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <DetailedVersion>2.1</DetailedVersion>\n</Version>\n`,
    },
    {
      name: "project.bcfp",
      data: `<?xml version="1.0" encoding="UTF-8"?>\n<ProjectExtension xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <Project ProjectId="${projectGuid}">\n    <Name>${xml(model.project.name)}</Name>\n  </Project>\n  <ExtensionSchema></ExtensionSchema>\n</ProjectExtension>\n`,
    },
  ];

  const seen = new Set<string>();
  for (const iss of issues) {
    const key = `${iss.message}|${[...iss.entityIds].sort().join(",")}`;
    const guid = uuidFrom(key);
    if (seen.has(guid)) continue;
    seen.add(guid);
    const vpGuid = uuidFrom(`${key}:vp`);
    const lm = model.levels.find((l) => l.level.id === iss.levelId);
    const levelName = lm?.level.name ?? "";
    const title = iss.message.length > 90 ? iss.message.slice(0, 87) + "…" : iss.message;

    entries.push({
      name: `${guid}/markup.bcf`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Topic Guid="${guid}" TopicType="${iss.category === "regelgeving" ? "Issue" : "Clash"}" TopicStatus="Open">
    <Title>${xml(title)}</Title>
    <Priority>${PRIORITY[iss.severity]}</Priority>
    <Labels>${xml(iss.category)}</Labels>
    <CreationDate>${now}</CreationDate>
    <CreationAuthor>${xml(author)}</CreationAuthor>
    <Description>${xml(`${iss.message}\n\nVerdieping: ${levelName}`)}</Description>
  </Topic>
  <Viewpoints Guid="${vpGuid}">
    <Viewpoint>viewpoint.bcfv</Viewpoint>
  </Viewpoints>
</Markup>
`,
    });

    // Camera: schuin van boven op het probleem, IFC-assen (plan-y → −Y).
    const elev = lm?.level.elevation ?? 0;
    const at = iss.at ?? { x: 0, y: 0 };
    const target = { x: at.x, y: -at.y, z: elev + 1.2 };
    const eye = { x: target.x - 4, y: target.y - 4, z: target.z + 3.5 };
    const d = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
    const dl = Math.hypot(d.x, d.y, d.z);
    const n = (v: number) => (Math.round(v * 1e4) / 1e4).toString();
    const comps = iss.entityIds.map((id) => `      <Component IfcGuid="${exportedGuid(model, id)}" />`).join("\n");

    entries.push({
      name: `${guid}/viewpoint.bcfv`,
      data: `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${vpGuid}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Components>
    <Selection>
${comps}
    </Selection>
    <Visibility DefaultVisibility="true" />
  </Components>
  <PerspectiveCamera>
    <CameraViewPoint><X>${n(eye.x)}</X><Y>${n(eye.y)}</Y><Z>${n(eye.z)}</Z></CameraViewPoint>
    <CameraDirection><X>${n(d.x / dl)}</X><Y>${n(d.y / dl)}</Y><Z>${n(d.z / dl)}</Z></CameraDirection>
    <CameraUpVector><X>0</X><Y>0</Y><Z>1</Z></CameraUpVector>
    <FieldOfView>60</FieldOfView>
  </PerspectiveCamera>
</VisualizationInfo>
`,
    });
  }

  return makeZip(entries);
}
