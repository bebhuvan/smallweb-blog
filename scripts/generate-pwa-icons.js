import { mkdirSync, writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { join } from 'path';

function hexToRgba(hex) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b, 255];
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lengthBuf = Buffer.alloc(4);
  lengthBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcValue, 0);
  return Buffer.concat([lengthBuf, typeBuf, data, crcBuf]);
}

function createPng(size, options) {
  const { background, circleColor, circleScale } = options;
  const [bgR, bgG, bgB, bgA] = hexToRgba(background);
  const [cR, cG, cB, cA] = hexToRgba(circleColor);
  const radius = size * circleScale;
  const center = (size - 1) / 2;

  const rowLength = size * 4 + 1;
  const raw = Buffer.alloc(rowLength * size);

  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const useCircle = dist <= radius;
      const offset = rowStart + 1 + x * 4;
      if (useCircle) {
        raw[offset] = cR;
        raw[offset + 1] = cG;
        raw[offset + 2] = cB;
        raw[offset + 3] = cA;
      } else {
        raw[offset] = bgR;
        raw[offset + 1] = bgG;
        raw[offset + 2] = bgB;
        raw[offset + 3] = bgA;
      }
    }
  }

  const compressed = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outputDir = join(process.cwd(), 'public', 'icons');
mkdirSync(outputDir, { recursive: true });

const baseOptions = {
  background: '#D95D39',
  circleColor: '#FAF7F2',
  circleScale: 0.28,
};

const outputs = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

for (const output of outputs) {
  const buffer = createPng(output.size, baseOptions);
  writeFileSync(join(outputDir, output.name), buffer);
}

console.log('Generated PWA icons:', outputs.map((o) => o.name).join(', '));
