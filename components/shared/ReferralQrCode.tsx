"use client";

import { useRef } from "react";
import QRCode from "react-qr-code";
import { Download } from "lucide-react";

type Props = {
  value: string;
  label?: string;
  size?: number;
  /** e.g. betese-paul-signup — saves as PNG for printing. */
  downloadFileName?: string;
  showDownload?: boolean;
};

function downloadSvgAsPng(svg: SVGElement, fileName: string, size: number) {
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const pad = 16;
    canvas.width = size + pad * 2;
    canvas.height = size + pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad, size, size);
    URL.revokeObjectURL(url);
    canvas.toBlob((png) => {
      if (!png) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `${fileName}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };
  img.src = url;
}

/** Scannable QR for agent / player signup links — optional PNG download for print. */
export function ReferralQrCode({
  value,
  label,
  size = 148,
  downloadFileName,
  showDownload = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!value.trim()) return null;

  function handleDownload() {
    const svg = wrapRef.current?.querySelector("svg");
    if (!svg) return;
    downloadSvgAsPng(svg, downloadFileName ?? "betese-signup-qr", size);
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={wrapRef}
        className="rounded-xl border border-white/10 bg-white p-2.5 shadow-lg"
      >
        <QRCode value={value} size={size} level="M" bgColor="#ffffff" fgColor="#0f172a" />
      </div>
      {label ? (
        <p className="max-w-[200px] text-center text-[10px] leading-snug text-slate-500">{label}</p>
      ) : null}
      {showDownload && downloadFileName ? (
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-white/5"
        >
          <Download size={12} /> Save QR image
        </button>
      ) : null}
    </div>
  );
}
