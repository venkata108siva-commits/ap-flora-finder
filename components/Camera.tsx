"use client";

import { useEffect, useRef, useState } from "react";
import { Camera as CamIcon, ImageUp, X } from "lucide-react";

/**
 * Live camera that always asks for the BACK camera ("environment").
 * On PCs without a back camera it falls back to the webcam; if no camera is
 * available at all, the user can upload a photo instead.
 */
export function Camera({ onCapture, onClose, onUpload }: { onCapture: (blob: Blob) => void; onClose: () => void; onUpload: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"starting" | "live" | "error">("starting");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setMsg("This browser can't open the camera. Upload a photo instead.");
        return;
      }
      const hd = { width: { ideal: 1920 }, height: { ideal: 1440 } };
      const attempts: MediaStreamConstraints[] = [
        { video: { facingMode: { exact: "environment" }, ...hd }, audio: false },
        { video: { facingMode: { ideal: "environment" }, ...hd }, audio: false }, // PC webcam fallback
        { video: true, audio: false },
      ];
      let lastErr: any;
      for (const c of attempts) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(c);
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream.current = s;
          if (video.current) {
            video.current.srcObject = s;
            await video.current.play().catch(() => {});
          }
          setState("live");
          return;
        } catch (e: any) {
          lastErr = e;
          if (e?.name === "NotAllowedError" || e?.name === "SecurityError") break;
        }
      }
      if (cancelled) return;
      setState("error");
      setMsg(
        lastErr?.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser settings, or upload a photo."
          : "No camera was found on this device. Upload a photo instead.",
      );
    }
    start();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.92);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Camera">
      <div className="ov-top">
        <CamIcon size={20} />
        <b>Back camera</b>
        <span className="spacer" />
        <button className="iconbtn" onClick={onClose} aria-label="Close camera">
          <X size={22} />
        </button>
      </div>
      <div className="viewport">
        <video ref={video} playsInline muted autoPlay />
        {state === "live" && <div className="frame" />}
        {state === "starting" && <div className="ov-hint" style={{ position: "absolute" }}>Opening camera…</div>}
        {state === "error" && (
          <div className="cam-err" style={{ position: "absolute" }}>
            <p>{msg}</p>
            <button className="btn primary" onClick={onUpload}>
              <ImageUp size={18} /> Upload a photo
            </button>
          </div>
        )}
      </div>
      {state === "live" && <p className="ov-hint">Fill the frame with a flower or leaf · good light gives the best match</p>}
      <div className="ov-bottom">
        <button className="iconbtn" onClick={onUpload} aria-label="Upload from gallery">
          <ImageUp size={22} />
        </button>
        <button className="shutter" onClick={snap} disabled={state !== "live"} aria-label="Take photo" />
        <span style={{ width: 44 }} />
      </div>
    </div>
  );
}
