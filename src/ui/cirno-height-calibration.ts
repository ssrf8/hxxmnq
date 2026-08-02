import { resolveCharacterSprites } from './character-sprite-registry';
import type { SpriteFacing, SpriteFrameTransform } from './sprite-actor';

const required = <T extends Element>(selector: string) => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`琪露诺全方向校准页缺少节点：${selector}`);
  return node;
};

const canvas = required<HTMLCanvasElement>('#cirno-height-canvas');
const contextNode = canvas.getContext('2d', { willReadFrequently: true });
if (!contextNode) throw new Error('浏览器不支持 Canvas 2D');
const context: CanvasRenderingContext2D = contextNode;
const facingInput = required<HTMLSelectElement>('#cirno-height-facing');
const motionScaleInput = required<HTMLInputElement>('#cirno-motion-scale');
const idleScaleInput = required<HTMLInputElement>('#cirno-idle-scale');
const targetHeightInput = required<HTMLInputElement>('#cirno-target-height');
const frameInput = required<HTMLInputElement>('#cirno-motion-frame');
const autoplayInput = required<HTMLInputElement>('#cirno-autoplay');
const motionScaleValue = required<HTMLOutputElement>('#cirno-motion-scale-value');
const idleScaleValue = required<HTMLOutputElement>('#cirno-idle-scale-value');
const targetHeightValue = required<HTMLOutputElement>('#cirno-target-height-value');
const frameValue = required<HTMLOutputElement>('#cirno-motion-frame-value');
const result = required<HTMLTextAreaElement>('#cirno-height-result');
const copyButton = required<HTMLButtonElement>('#cirno-height-copy');
const resetButton = required<HTMLButtonElement>('#cirno-height-reset');

const facings = ['front', 'back', 'left', 'right'] as const;
const facingLabel: Record<SpriteFacing, string> = { front: '正面', back: '背面', left: '左侧', right: '右侧' };
const facingRow: Record<SpriteFacing, number> = { front: 0, back: 1, left: 2, right: 3 };
const facingCell: Record<SpriteFacing, { x: number; y: number }> = {
  front: { x: 0, y: 0 }, back: { x: 1, y: 0 }, left: { x: 0, y: 1 }, right: { x: 1, y: 1 },
};
const sprites = resolveCharacterSprites('../assets', {
  cirnoSpriteSrc: '../assets/characters/cirno/cirno-turnaround-v1.webp',
  cirnoMotionSrc: '../assets/characters/cirno/cirno-walk-cycle-v1.webp',
  cirnoSequenceSrc: '../assets/characters/cirno/cirno-animation-sequence-approved-v1.webp',
} as DOMStringMap);
const registeredIdle = sprites.cirno.idleFrameTransforms as Record<SpriteFacing, SpriteFrameTransform>;
const brightness = sprites.cirno.motionFrameBrightness ?? { front: 1, back: 1, left: 1, right: 1 };
const registeredMotion = sprites.cirno.motionFrameTransforms;
const motion = Object.fromEntries(facings.map((facing) => [
  facing,
  { ...(registeredMotion?.[facing] ?? { scale: 1, x: -.5, y: -.82 }) },
])) as Record<SpriteFacing, SpriteFrameTransform>;
const idle = Object.fromEntries(facings.map((facing) => [facing, { ...registeredIdle[facing] }])) as Record<SpriteFacing, SpriteFrameTransform>;
const initialMotion = structuredClone(motion);
const initialIdle = structuredClone(idle);
const idleCenterBias = Object.fromEntries(facings.map((facing) => [facing, idle[facing].x + idle[facing].scale / 2])) as Record<SpriteFacing, number>;
const motionBottom = { front: 1, back: 1, left: 1, right: 1 } as Record<SpriteFacing, number>;
const idleBottom = { front: 1, back: 1, left: 1, right: 1 } as Record<SpriteFacing, number>;

const idleImage = new Image();
const sequenceImage = new Image();
idleImage.src = sprites.cirno.idleSource;
sequenceImage.src = sprites.cirno.sequence?.source ?? '';
const scratch = document.createElement('canvas');
const scratchContext = scratch.getContext('2d', { willReadFrequently: true });

function alphaBottomRatio(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
  if (!scratchContext) return 1;
  scratch.width = Math.round(sw);
  scratch.height = Math.round(sh);
  scratchContext.clearRect(0, 0, scratch.width, scratch.height);
  scratchContext.drawImage(image, sx, sy, sw, sh, 0, 0, scratch.width, scratch.height);
  const data = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data;
  for (let y = scratch.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      if (data[(y * scratch.width + x) * 4 + 3] > 8) return (y + 1) / scratch.height;
    }
  }
  return 1;
}

function measureAndBind() {
  if (!idleImage.naturalWidth || !sequenceImage.naturalWidth) return;
  const iw = idleImage.naturalWidth / 2;
  const ih = idleImage.naturalHeight / 2;
  const mw = sequenceImage.naturalWidth / 17;
  const mh = sequenceImage.naturalHeight / 4;
  for (const facing of facings) {
    const cell = facingCell[facing];
    idleBottom[facing] = alphaBottomRatio(idleImage, cell.x * iw, cell.y * ih, iw, ih);
    motionBottom[facing] = alphaBottomRatio(sequenceImage, 0, facingRow[facing] * mh, mw, mh);
    motion[facing].y = -motionBottom[facing] * motion[facing].scale;
    idle[facing].y = -idleBottom[facing] * idle[facing].scale;
  }
  syncControls();
}

const selectedFacing = () => facingInput.value as SpriteFacing;
const compact = (value: number) => Number(value.toFixed(4));
const tuple = (value: SpriteFrameTransform) => `[${compact(value.scale)}, ${compact(value.x)}, ${compact(value.y)}]`;

function updateResult() {
  result.value = `motionFits(${facings.map((facing) => tuple(motion[facing])).join(', ')})\n`
    + `idleFits(${facings.map((facing) => tuple(idle[facing])).join(', ')})`;
}

function syncControls() {
  const facing = selectedFacing();
  motionScaleInput.value = String(motion[facing].scale);
  idleScaleInput.value = String(idle[facing].scale);
  motionScaleValue.value = motion[facing].scale.toFixed(4);
  idleScaleValue.value = idle[facing].scale.toFixed(4);
  targetHeightValue.value = `${targetHeightInput.value}px`;
  frameValue.value = frameInput.value;
  updateResult();
}

function updateSelectedScales() {
  const facing = selectedFacing();
  motion[facing].scale = Number(motionScaleInput.value);
  motion[facing].x = -motion[facing].scale / 2;
  motion[facing].y = -motionBottom[facing] * motion[facing].scale;
  idle[facing].scale = Number(idleScaleInput.value);
  idle[facing].x = idleCenterBias[facing] - idle[facing].scale / 2;
  idle[facing].y = -idleBottom[facing] * idle[facing].scale;
  syncControls();
}

function drawLine(y: number, color: string, label: string) {
  context.strokeStyle = color;
  context.setLineDash([7, 6]);
  context.beginPath();
  context.moveTo(36, y);
  context.lineTo(canvas.width - 36, y);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = color;
  context.font = '600 12px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText(label, 42, y - 6);
}

let lastFrameChangedAt = 0;
function render(time: number) {
  if (autoplayInput.checked && time - lastFrameChangedAt >= 100) {
    frameInput.value = String(Number(frameInput.value) % 17 + 1);
    frameValue.value = frameInput.value;
    lastFrameChangedAt = time;
  }
  const frame = Number(frameInput.value) - 1;
  const size = 178;
  const centers = [135, 378, 621, 864];
  const motionBaseline = 285;
  const idleBaseline = 555;
  const targetHeight = Number(targetHeightInput.value);
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#c9efff'); gradient.addColorStop(1, '#e5f6da');
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  const selected = selectedFacing();
  const selectedIndex = facings.indexOf(selected);
  context.fillStyle = 'rgba(72, 170, 214, .12)';
  context.fillRect(centers[selectedIndex] - 112, 0, 224, canvas.height);
  drawLine(motionBaseline, '#24647f', '动画脚底线');
  drawLine(motionBaseline - targetHeight, '#b43b50', '统一目标高度');
  drawLine(idleBaseline, '#24647f', '静态脚底线');
  drawLine(idleBaseline - targetHeight, '#b43b50', '统一目标高度');
  context.font = '700 17px system-ui, sans-serif'; context.textAlign = 'center'; context.fillStyle = '#183a4e';
  for (let index = 0; index < facings.length; index += 1) {
    const facing = facings[index];
    const center = centers[index];
    context.fillText(`${facingLabel[facing]} · ${facing}`, center, 28);
    if (sequenceImage.naturalWidth) {
      const sw = sequenceImage.naturalWidth / 17;
      const sh = sequenceImage.naturalHeight / 4;
      const fit = motion[facing];
      context.imageSmoothingEnabled = false;
      context.filter = `brightness(${brightness[facing]})`;
      context.drawImage(sequenceImage, frame * sw, facingRow[facing] * sh, sw, sh,
        center + size * fit.x, motionBaseline + size * fit.y, size * fit.scale, size * fit.scale);
      context.filter = 'none';
    }
    if (idleImage.naturalWidth) {
      const sw = idleImage.naturalWidth / 2;
      const sh = idleImage.naturalHeight / 2;
      const cell = facingCell[facing];
      const fit = idle[facing];
      context.drawImage(idleImage, cell.x * sw, cell.y * sh, sw, sh,
        center + size * fit.x, idleBaseline + size * fit.y, size * fit.scale, size * fit.scale);
    }
  }
  context.fillStyle = '#28546b'; context.font = '600 14px system-ui, sans-serif'; context.textAlign = 'right';
  context.fillText(`动画第 ${frame + 1} 帧`, canvas.width - 38, 52);
  requestAnimationFrame(render);
}

idleImage.addEventListener('load', measureAndBind);
sequenceImage.addEventListener('load', measureAndBind);
facingInput.addEventListener('change', syncControls);
motionScaleInput.addEventListener('input', updateSelectedScales);
idleScaleInput.addEventListener('input', updateSelectedScales);
targetHeightInput.addEventListener('input', syncControls);
frameInput.addEventListener('input', syncControls);
autoplayInput.addEventListener('change', () => { lastFrameChangedAt = 0; });
resetButton.addEventListener('click', () => {
  const facing = selectedFacing();
  motion[facing] = { ...initialMotion[facing], y: -motionBottom[facing] * initialMotion[facing].scale };
  idle[facing] = { ...initialIdle[facing], y: -idleBottom[facing] * initialIdle[facing].scale };
  syncControls();
});
copyButton.addEventListener('click', async () => {
  result.select();
  await navigator.clipboard?.writeText(result.value);
  copyButton.textContent = '已复制';
  window.setTimeout(() => { copyButton.textContent = '复制两套参数'; }, 1200);
});

syncControls();
requestAnimationFrame(render);
