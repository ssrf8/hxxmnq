import { resolveCharacterSprites } from './character-sprite-registry';
import type { SpriteFacing, SpriteFrameTransform } from './sprite-actor';

const canvasNode = document.querySelector<HTMLCanvasElement>('#cirno-calibration-canvas');
const facingNode = document.querySelector<HTMLSelectElement>('#cirno-facing');
const scaleNode = document.querySelector<HTMLInputElement>('#cirno-scale');
const xNode = document.querySelector<HTMLInputElement>('#cirno-x');
const yNode = document.querySelector<HTMLInputElement>('#cirno-y');
const scaleValueNode = document.querySelector<HTMLOutputElement>('#cirno-scale-value');
const xValueNode = document.querySelector<HTMLOutputElement>('#cirno-x-value');
const yValueNode = document.querySelector<HTMLOutputElement>('#cirno-y-value');
const brightnessNode = document.querySelector<HTMLInputElement>('#cirno-brightness');
const brightnessValueNode = document.querySelector<HTMLOutputElement>('#cirno-brightness-value');
const headGuideNode = document.querySelector<HTMLInputElement>('#cirno-head-guide');
const headGuideValueNode = document.querySelector<HTMLOutputElement>('#cirno-head-guide-value');
const autoBindNode = document.querySelector<HTMLInputElement>('#cirno-auto-bind');
const resultNode = document.querySelector<HTMLTextAreaElement>('#cirno-result');
const resetNode = document.querySelector<HTMLButtonElement>('#cirno-reset');
const copyNode = document.querySelector<HTMLButtonElement>('#cirno-copy');
if (!canvasNode || !facingNode || !scaleNode || !xNode || !yNode
  || !scaleValueNode || !xValueNode || !yValueNode || !brightnessNode || !brightnessValueNode
  || !headGuideNode || !headGuideValueNode || !autoBindNode || !resultNode || !resetNode || !copyNode) {
  throw new Error('琪露诺校准页缺少必要节点');
}
const contextNode = canvasNode.getContext('2d');
if (!contextNode) throw new Error('浏览器不支持 Canvas 2D');

const canvas: HTMLCanvasElement = canvasNode;
const context: CanvasRenderingContext2D = contextNode;
const facingSelect: HTMLSelectElement = facingNode;
const scaleInput: HTMLInputElement = scaleNode;
const xInput: HTMLInputElement = xNode;
const yInput: HTMLInputElement = yNode;
const scaleValue: HTMLOutputElement = scaleValueNode;
const xValue: HTMLOutputElement = xValueNode;
const yValue: HTMLOutputElement = yValueNode;
const brightnessInput: HTMLInputElement = brightnessNode;
const brightnessValue: HTMLOutputElement = brightnessValueNode;
const headGuideInput: HTMLInputElement = headGuideNode;
const headGuideValue: HTMLOutputElement = headGuideValueNode;
const autoBind: HTMLInputElement = autoBindNode;
const result: HTMLTextAreaElement = resultNode;

const sprites = resolveCharacterSprites('../assets', {
  cirnoSpriteSrc: '../assets/characters/cirno/cirno-turnaround-v1.webp',
  cirnoMotionSrc: '../assets/characters/cirno/cirno-walk-cycle-v1.webp',
  cirnoSequenceSrc: '../assets/characters/cirno/cirno-animation-sequence-approved-v1.webp',
} as DOMStringMap);
const initial = sprites.cirno.idleFrameTransforms as Record<SpriteFacing, SpriteFrameTransform>;
const values = Object.fromEntries(
  (['front', 'back', 'left', 'right'] as const).map((facing) => [facing, { ...initial[facing] }]),
) as Record<SpriteFacing, SpriteFrameTransform>;
const initialBrightness = { ...(sprites.cirno.motionFrameBrightness ?? {
  front: 1, back: 1, left: 1, right: 1,
}) } as Record<SpriteFacing, number>;
const brightness = { ...initialBrightness };

const idleImage = new Image();
const sequenceImage = new Image();
idleImage.src = sprites.cirno.idleSource;
sequenceImage.src = sprites.cirno.sequence?.source ?? '';
const facingRow: Record<SpriteFacing, number> = { front: 0, back: 1, left: 2, right: 3 };
const facingCell: Record<SpriteFacing, { x: number; y: number }> = {
  front: { x: 0, y: 0 }, back: { x: 1, y: 0 }, left: { x: 0, y: 1 }, right: { x: 1, y: 1 },
};
const motionFootOffset: Record<SpriteFacing, number | null> = { front: null, back: null, left: null, right: null };
const idleFootRatio: Record<SpriteFacing, number | null> = { front: null, back: null, left: null, right: null };
const scratch = document.createElement('canvas');
const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
const actorAnchorY = 350;

const currentFacing = () => facingSelect.value as SpriteFacing;
const compact = (value: number) => Number(value.toFixed(4));

function alphaBottomRatio(image: HTMLImageElement, sourceX: number, sourceY: number, sourceWidth: number, sourceHeight: number) {
  if (!scratchContext) return null;
  scratch.width = Math.round(sourceWidth);
  scratch.height = Math.round(sourceHeight);
  scratchContext.clearRect(0, 0, scratch.width, scratch.height);
  scratchContext.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, scratch.width, scratch.height);
  const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data;
  for (let row = scratch.height - 1; row >= 0; row -= 1) {
    for (let column = 0; column < scratch.width; column += 1) {
      if (pixels[(row * scratch.width + column) * 4 + 3] > 8) return (row + 1) / scratch.height;
    }
  }
  return null;
}

function measureFootBounds() {
  if (!idleImage.naturalWidth || !sequenceImage.naturalWidth) return;
  const idleWidth = idleImage.naturalWidth / 2;
  const idleHeight = idleImage.naturalHeight / 2;
  const sequenceWidth = sequenceImage.naturalWidth / 17;
  const sequenceHeight = sequenceImage.naturalHeight / 4;
  for (const facing of ['front', 'back', 'left', 'right'] as const) {
    const cell = facingCell[facing];
    idleFootRatio[facing] = alphaBottomRatio(idleImage, cell.x * idleWidth, cell.y * idleHeight, idleWidth, idleHeight);
    const sequenceBottom = alphaBottomRatio(sequenceImage, 0, facingRow[facing] * sequenceHeight, sequenceWidth, sequenceHeight);
    motionFootOffset[facing] = sequenceBottom === null ? null : sequenceBottom - .82;
  }
  if (autoBind.checked) bindCurrentFoot();
}

function bindCurrentFoot() {
  const facing = currentFacing();
  const motionBottom = motionFootOffset[facing];
  const idleBottom = idleFootRatio[facing];
  if (motionBottom === null || idleBottom === null) return;
  values[facing].y = motionBottom - idleBottom * values[facing].scale;
  yInput.value = String(values[facing].y);
}

function updateOutput() {
  const transform = values[currentFacing()];
  transform.scale = Number(scaleInput.value);
  transform.x = Number(xInput.value);
  if (autoBind.checked) bindCurrentFoot();
  else transform.y = Number(yInput.value);
  brightness[currentFacing()] = Number(brightnessInput.value);
  scaleValue.value = transform.scale.toFixed(4);
  xValue.value = transform.x.toFixed(4);
  yValue.value = transform.y.toFixed(4);
  brightnessValue.value = brightness[currentFacing()].toFixed(2);
  headGuideValue.value = `${headGuideInput.value}px`;
  const tuple = (facing: SpriteFacing) => {
    const item = values[facing];
    return `[${compact(item.scale)}, ${compact(item.x)}, ${compact(item.y)}]`;
  };
  result.value = `cirno: idleFits(${tuple('front')}, ${tuple('back')}, ${tuple('left')}, ${tuple('right')})\n`
    + `brightness: { front: ${compact(brightness.front)}, back: ${compact(brightness.back)}, left: ${compact(brightness.left)}, right: ${compact(brightness.right)} }`;
}

function syncControls() {
  const transform = values[currentFacing()];
  scaleInput.value = String(transform.scale);
  xInput.value = String(transform.x);
  yInput.value = String(transform.y);
  brightnessInput.value = String(brightness[currentFacing()]);
  yInput.disabled = autoBind.checked;
  updateOutput();
}

function drawTitle(anchorX: number, title: string) {
  context.fillStyle = '#17394f';
  context.font = '600 18px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(title, anchorX, 42);
}

function drawGuides(facing: SpriteFacing, size: number) {
  const footOffset = motionFootOffset[facing] ?? 0;
  const footLineY = actorAnchorY + size * footOffset;
  context.strokeStyle = 'rgba(23, 90, 125, .72)';
  context.setLineDash([8, 7]);
  context.beginPath();
  context.moveTo(70, footLineY);
  context.lineTo(canvas.width - 70, footLineY);
  context.stroke();
  context.strokeStyle = 'rgba(207, 68, 86, .82)';
  context.setLineDash([4, 5]);
  context.beginPath();
  context.moveTo(70, Number(headGuideInput.value));
  context.lineTo(canvas.width - 70, Number(headGuideInput.value));
  context.stroke();
  context.setLineDash([]);
  context.font = '600 13px system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillStyle = '#b13245';
  context.fillText('可调头顶参考线', 76, Number(headGuideInput.value) - 7);
  context.fillStyle = '#195a78';
  context.fillText('动画首帧脚底对准线', 76, footLineY - 7);
}

function render(time: number) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#c9efff');
  gradient.addColorStop(1, '#e6f7dc');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const facing = currentFacing();
  const size = 260;
  const frame = Math.floor(time / 100) % 17;
  const anchors = [250, 710] as const;
  drawTitle(anchors[0], `动画图基准 · ${facing} · 第 ${frame + 1} 帧`);
  drawTitle(anchors[1], `静态图基准 · ${facing}`);
  drawGuides(facing, size);
  if (sequenceImage.complete && sequenceImage.naturalWidth) {
    const sourceWidth = sequenceImage.naturalWidth / 17;
    const sourceHeight = sequenceImage.naturalHeight / 4;
    context.imageSmoothingEnabled = false;
    context.filter = `brightness(${brightness[facing]})`;
    context.drawImage(sequenceImage, frame * sourceWidth, facingRow[facing] * sourceHeight,
      sourceWidth, sourceHeight, anchors[0] - size * .5, actorAnchorY - size * .82, size, size);
    context.filter = 'none';
  }
  if (idleImage.complete && idleImage.naturalWidth) {
    const cell = facingCell[facing];
    const sourceWidth = idleImage.naturalWidth / 2;
    const sourceHeight = idleImage.naturalHeight / 2;
    const transform = values[facing];
    context.imageSmoothingEnabled = false;
    context.drawImage(idleImage, cell.x * sourceWidth, cell.y * sourceHeight, sourceWidth, sourceHeight,
      anchors[1] + size * transform.x, actorAnchorY + size * transform.y,
      size * transform.scale, size * transform.scale);
  }
  requestAnimationFrame(render);
}

idleImage.addEventListener('load', measureFootBounds);
sequenceImage.addEventListener('load', measureFootBounds);
facingSelect.addEventListener('change', syncControls);
scaleInput.addEventListener('input', updateOutput);
xInput.addEventListener('input', updateOutput);
yInput.addEventListener('input', () => { autoBind.checked = false; yInput.disabled = false; updateOutput(); });
brightnessInput.addEventListener('input', updateOutput);
headGuideInput.addEventListener('input', updateOutput);
autoBind.addEventListener('change', () => { yInput.disabled = autoBind.checked; if (autoBind.checked) bindCurrentFoot(); updateOutput(); });
resetNode.addEventListener('click', () => {
  values[currentFacing()] = { ...initial[currentFacing()] };
  brightness[currentFacing()] = initialBrightness[currentFacing()];
  syncControls();
});
copyNode.addEventListener('click', async () => {
  result.select();
  await navigator.clipboard?.writeText(result.value);
  copyNode.textContent = '已复制';
  window.setTimeout(() => { copyNode.textContent = '复制参数'; }, 1200);
});

syncControls();
requestAnimationFrame(render);
