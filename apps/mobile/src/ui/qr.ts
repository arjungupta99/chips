/**
 * A QR code's dark modules as one SVG path, apart from the view that draws it (`QrCode.tsx`) so
 * it is tested without a phone.
 */

import QRCode from "qrcode";

/** The dark modules of a QR for `text`, as one path in module units, and its size in modules. */
export function qrPath(text: string): { readonly size: number; readonly path: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const runs: string[] = [];
  for (let y = 0; y < modules.size; y += 1) {
    for (let x = 0; x < modules.size; x += 1) {
      if (modules.get(y, x)) runs.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return { size: modules.size, path: runs.join("") };
}
