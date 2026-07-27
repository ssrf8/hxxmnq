import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = path.resolve('src/assets/characters');
const INPUT = path.join(ROOT, '参考序列帧', '正常');
const OUTPUT = path.join(ROOT, 'sakuya', 'sequence-reference-v1', 'frames');

const onlyFrame = process.argv.find((argument) => argument.startsWith('--frame='))
  ?.slice('--frame='.length)
  ?.padStart(3, '0');

function rgbToHsv(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
    else if (max === gg) hue = 60 * ((bb - rr) / delta + 2);
    else hue = 60 * ((rr - gg) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max ? delta / max : 0, value: max };
}

function silverHair(r, g, b) {
  const light = (r * 0.25 + g * 0.55 + b * 0.20) / 255;
  return [
    Math.round(112 + light * 102),
    Math.round(114 + light * 102),
    Math.round(140 + light * 104),
  ];
}

function navyDress(r, g, b) {
  const light = (r * 0.30 + g * 0.52 + b * 0.18) / 255;
  return [
    Math.round(15 + light * 48),
    Math.round(27 + light * 57),
    Math.round(65 + light * 102),
  ];
}

function darkGreenBow(r, g, b) {
  const light = (r * 0.24 + g * 0.58 + b * 0.18) / 255;
  return [
    Math.round(15 + light * 30),
    Math.round(47 + light * 60),
    Math.round(43 + light * 46),
  ];
}

function blackShoe(r, g, b) {
  const light = (r * 0.30 + g * 0.50 + b * 0.20) / 255;
  return [
    Math.round(10 + light * 54),
    Math.round(11 + light * 48),
    Math.round(18 + light * 56),
  ];
}

const figures = [
  { x0: 80, x1: 310, y0: 10, y1: 340, kind: 'front' },
  { x0: 390, x1: 620, y0: 10, y1: 340, kind: 'back' },
  { x0: 80, x1: 310, y0: 345, y1: 700, kind: 'left' },
  { x0: 390, x1: 620, y0: 345, y1: 700, kind: 'right' },
];

function recolorFrame(source) {
  const output = new PNG({ width: source.width, height: source.height });
  source.data.copy(output.data);
  for (const figure of figures) {
    for (let y = figure.y0; y < Math.min(figure.y1, source.height); y += 1) {
      const localY = y - figure.y0;
      for (let x = figure.x0; x < Math.min(figure.x1, source.width); x += 1) {
        const localX = x - figure.x0;
        const index = (y * source.width + x) * 4;
        const r = source.data[index];
        const g = source.data[index + 1];
        const b = source.data[index + 2];
        const a = source.data[index + 3];
        if (!a) continue;
        const { hue, saturation, value } = rgbToHsv(r, g, b);
        let replacement = null;

        const greenFamily = hue >= 42 && hue <= 155;
        const hairZone = localY <= (figure.kind === 'front' || figure.kind === 'back' ? 185 : 190);
        const dressZone = localY >= 125 && localY <= 300;
        const shoeZone = localY >= 270;
        const topOrnamentZone = localY <= 68
          && localX >= 88 && localX <= 142;

        if (topOrnamentZone && saturation >= 0.22 && value >= 0.30) {
          const light = Math.max(0.58, value);
          replacement = [
            Math.round(220 + light * 25),
            Math.round(216 + light * 28),
            Math.round(228 + light * 24),
          ];
        } else if (hairZone && greenFamily && saturation >= 0.05 && saturation <= 0.24 && value >= 0.26) {
          replacement = silverHair(r, g, b);
        } else if (hairZone && localY < 190 && greenFamily && saturation > 0.24 && value <= 0.76) {
          replacement = darkGreenBow(r, g, b);
        } else if (shoeZone && ((hue <= 48 || hue >= 340) && saturation >= 0.20 && value <= 0.62)) {
          replacement = blackShoe(r, g, b);
        } else if (dressZone && greenFamily && saturation >= 0.24 && value <= 0.82) {
          replacement = navyDress(r, g, b);
        } else if (greenFamily && saturation >= 0.28 && value <= 0.70) {
          replacement = darkGreenBow(r, g, b);
        }

        if (replacement) {
          output.data[index] = replacement[0];
          output.data[index + 1] = replacement[1];
          output.data[index + 2] = replacement[2];
        }
      }
    }
  }

  // The source reference set contains a small generator watermark in the
  // bottom-right corner.  Replace only that non-character rectangle with an
  // equal-sized sample from the empty center gutter at the same scanlines.
  if (output.width === 720 && output.height === 720) {
    const targetX = 600;
    const sourceX = 300;
    const top = 674;
    const width = 120;
    for (let y = top; y < 720; y += 1) {
      for (let offset = 0; offset < width; offset += 1) {
        const from = (y * output.width + sourceX + offset) * 4;
        const to = (y * output.width + targetX + offset) * 4;
        output.data.copy(output.data, to, from, from + 4);
      }
    }
  }
  return output;
}

fs.mkdirSync(OUTPUT, { recursive: true });
const inputs = fs.readdirSync(INPUT)
  .filter((name) => /^\d{3}\.png$/u.test(name))
  .filter((name) => !onlyFrame || name.startsWith(onlyFrame))
  .sort();

for (const name of inputs) {
  const source = PNG.sync.read(fs.readFileSync(path.join(INPUT, name)));
  const output = recolorFrame(source);
  fs.writeFileSync(path.join(OUTPUT, name), PNG.sync.write(output));
}

console.log(JSON.stringify({
  input: path.relative(process.cwd(), INPUT).replaceAll('\\', '/'),
  output: path.relative(process.cwd(), OUTPUT).replaceAll('\\', '/'),
  frames: inputs.length,
}, null, 2));
