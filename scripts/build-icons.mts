import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { ImageResponse } from 'next/og';

const ACCENT = '#2a78d6';
const PULSE = 'M5 17.5h4.5l2.8-7 4.6 12 3.3-8 2 2.6H27';

async function png(size: number, radius: number): Promise<Buffer> {
  const svg = createElement(
    'svg',
    { width: size, height: size, viewBox: '0 0 32 32', xmlns: 'http://www.w3.org/2000/svg' },
    createElement('rect', { width: 32, height: 32, rx: radius, fill: ACCENT }),
    createElement('path', {
      d: PULSE,
      fill: 'none',
      stroke: '#fff',
      strokeWidth: 2.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    }),
  );
  const res = new ImageResponse(
    createElement('div', { style: { display: 'flex', width: '100%', height: '100%' } }, svg),
    { width: size, height: size },
  );
  return Buffer.from(await res.arrayBuffer());
}

function ico(images: Array<{ size: number; data: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const favicon = ico([
  { size: 16, data: await png(16, 7) },
  { size: 32, data: await png(32, 8) },
  { size: 48, data: await png(48, 8) },
]);
writeFileSync('app/favicon.ico', favicon);

const apple = await png(180, 0);
writeFileSync('app/apple-icon.png', apple);

console.log(`app/favicon.ico ${favicon.length} B, app/apple-icon.png ${apple.length} B`);
