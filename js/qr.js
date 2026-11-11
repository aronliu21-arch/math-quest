// QR code (SVG) for room links, using the vendored MIT qrcode-generator.
import qrcode from '../vendor/qrcode.mjs';
export function qrSVG(text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
