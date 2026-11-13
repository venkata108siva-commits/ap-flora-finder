"use client";

import { useEffect, useRef, useState } from "react";
import ReactCrop, { type PixelCrop, type Crop } from "react-image-crop";
import { Crop as CropIcon, RotateCcw, ScanLine, X } from "lucide-react";

/** Optional crop step. "Identify" with no selection sends the full photo. */
export function Cropper({ src, onDone, onCancel }: { src: string; onDone: (blob: Blob) => void; onCancel: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [px, setPx] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function finish(useCrop: boolean) {
    const el = img.current;
    if (!el) return;
    setBusy(true);
    const sx = el.naturalWidth / el.width;
    const sy = el.naturalHeight / el.height;
    const area =
      useCrop && px && px.width > 8 && px.height > 8
        ? { x: px.x * sx, y: px.y * sy, w: px.width * sx, h: px.height * sy }
        : { x: 0, y: 0, w: el.naturalWidth, h: el.naturalHeight };
    // Downscale to max 1600px so uploads are fast on mobile data.
    const scale = Math.min(1, 1600 / Math.max(area.w, area.h));
    const c = document.createElement("canvas");
    c.width = Math.round(area.w * scale);
    c.height = Math.round(area.h * scale);
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(el, area.x, area.y, area.w, area.h, 0, 0, c.width, c.height);
    c.toBlob((b) => b && onDone(b), "image/jpeg", 0.88);
  }

  const hasCrop = !!(px && px.width > 8 && px.height > 8);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div className="ov-top">
        <CropIcon size={20} />
        <b>Crop (optional)</b>
        <span className="spacer" />
        <button className="iconbtn" onClick={onCancel} aria-label="Cancel">
          <X size={22} />
        </button>
      </div>
      <p className="ov-hint">Drag over the plant to crop, or identify the full photo.</p>
      <div className="crop-area">
        <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setPx(c)} keepSelection ruleOfThirds>
          <img ref={img} src={src} alt="Your photo" />
        </ReactCrop>
      </div>
      <div className="crop-actions">
        {hasCrop && (
          <button
            className="btn ghost"
            onClick={() => {
              setCrop(undefined);
              setPx(undefined);
            }}
          >
            <RotateCcw size={18} /> Reset
          </button>
        )}
        <button className="btn ghost" onClick={() => finish(false)} disabled={busy}>
          Use full photo
        </button>
        <button className="btn primary" onClick={() => finish(true)} disabled={busy}>
          <ScanLine size={18} /> {hasCrop ? "Crop & identify" : "Identify"}
        </button>
      </div>
    </div>
  );
}
