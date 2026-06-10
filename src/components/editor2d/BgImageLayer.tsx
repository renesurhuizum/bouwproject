"use client";

import { useEffect, useState } from "react";
import { Layer, Image as KonvaImage } from "react-konva";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import { metersToScreen, BASE_PPM, type ViewState } from "./viewport";

interface Props {
  levelId: string | null;
  view: ViewState;
}

export function BgImageLayer({ levelId, view }: Props) {
  const level = useLiveQuery(
    async () => (levelId ? getDB().levels.get(levelId) : null),
    [levelId],
  );

  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    // Geen blob → cleanup van de vorige run heeft img al op null gezet.
    if (!level?.bgImageBlob) return;
    const url = URL.createObjectURL(level.bgImageBlob);
    const image = new window.Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => {
      URL.revokeObjectURL(url);
      setImg(null);
    };
  }, [level?.bgImageBlob]);

  if (!img || !level?.bgImageBlob) return null;

  const mPerPx = level.bgImageScale ?? 0.02;
  const ox = level.bgImageOffsetX ?? 0;
  const oy = level.bgImageOffsetY ?? 0;
  const screenPos = metersToScreen({ x: ox, y: oy }, view);
  const screenW = img.naturalWidth * mPerPx * BASE_PPM * view.scale;
  const screenH = img.naturalHeight * mPerPx * BASE_PPM * view.scale;

  return (
    <Layer>
      <KonvaImage
        image={img}
        x={screenPos.x}
        y={screenPos.y}
        width={screenW}
        height={screenH}
        opacity={level.bgImageOpacity ?? 0.4}
        listening={false}
      />
    </Layer>
  );
}
