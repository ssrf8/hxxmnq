type CharacterId = 'youmu' | 'sanae' | 'patchouli';
type Facing = 'front' | 'back' | 'left' | 'right';
type Target = 'motion' | 'idle';
type Fit = { scale: number; x: number; y: number };

const required = <T extends Element>(selector: string) => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`新角色校准页缺少节点：${selector}`);
  return node;
};

const characters: Record<CharacterId, { label: string; frames: number; duration: number }> = {
  youmu: { label: '魂魄妖梦', frames: 28, duration: 48 },
  sanae: { label: '东风谷早苗', frames: 35, duration: 48 },
  patchouli: { label: '帕秋莉·诺蕾姬', frames: 26, duration: 48 },
};
const facings: Facing[] = ['front', 'back', 'left', 'right'];
const facingRow: Record<Facing, number> = { front: 0, back: 1, left: 2, right: 3 };
const facingCell: Record<Facing, { x: number; y: number }> = {
  front: { x: 0, y: 0 }, back: { x: 1, y: 0 }, left: { x: 0, y: 1 }, right: { x: 1, y: 1 },
};
const defaultFit = (): Fit => ({ scale: 1, x: -.5, y: -.82 });
const defaultCharacterState = () => ({
  motion: Object.fromEntries(facings.map((facing) => [facing, defaultFit()])) as Record<Facing, Fit>,
  idle: Object.fromEntries(facings.map((facing) => [facing, defaultFit()])) as Record<Facing, Fit>,
});
const state = Object.fromEntries((Object.keys(characters) as CharacterId[]).map((id) => [id, defaultCharacterState()])) as Record<CharacterId, ReturnType<typeof defaultCharacterState>>;
const storageKey = 'gensokyo-new-character-sprite-calibration-v1';
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  for (const id of Object.keys(characters) as CharacterId[]) for (const target of ['motion', 'idle'] as Target[]) {
    for (const facing of facings) if (saved?.[id]?.[target]?.[facing]) Object.assign(state[id][target][facing], saved[id][target][facing]);
  }
} catch { /* 损坏的本地草稿不阻塞校准页。 */ }

const canvas = required<HTMLCanvasElement>('#cal-canvas');
const contextNode = canvas.getContext('2d', { willReadFrequently: true });
if (!contextNode) throw new Error('浏览器不支持 Canvas 2D');
const context: CanvasRenderingContext2D = contextNode;
const characterInput = required<HTMLSelectElement>('#cal-character');
const facingInput = required<HTMLSelectElement>('#cal-facing');
const frameInput = required<HTMLInputElement>('#cal-frame');
const frameValue = required<HTMLOutputElement>('#cal-frame-value');
const speedInput = required<HTMLInputElement>('#cal-speed');
const speedValue = required<HTMLOutputElement>('#cal-speed-value');
const autoplayInput = required<HTMLInputElement>('#cal-autoplay');
const guidesInput = required<HTMLInputElement>('#cal-guides');
const metricsNode = required<HTMLElement>('#cal-metrics');
const resultNode = required<HTMLTextAreaElement>('#cal-result');
const copyButton = required<HTMLButtonElement>('#cal-copy');
const resetFacingButton = required<HTMLButtonElement>('#cal-reset-facing');
const resetCharacterButton = required<HTMLButtonElement>('#cal-reset-character');

const controls = Object.fromEntries((['motion', 'idle'] as Target[]).map((target) => [target, {
  scale: required<HTMLInputElement>(`#${target}-scale`),
  x: required<HTMLInputElement>(`#${target}-x`),
  y: required<HTMLInputElement>(`#${target}-y`),
  scaleValue: required<HTMLOutputElement>(`#${target}-scale-value`),
  xValue: required<HTMLOutputElement>(`#${target}-x-value`),
  yValue: required<HTMLOutputElement>(`#${target}-y-value`),
}])) as Record<Target, Record<'scale' | 'x' | 'y', HTMLInputElement> & Record<'scaleValue' | 'xValue' | 'yValue', HTMLOutputElement>>;

const images = Object.fromEntries((Object.keys(characters) as CharacterId[]).map((id) => {
  const idle = new Image();
  const motion = new Image();
  idle.src = `../assets/characters/${id}/${id}-turnaround-v1.webp`;
  motion.src = `../assets/characters/${id}/${id}-animation-sequence-v1.webp`;
  return [id, { idle, motion }];
})) as Record<CharacterId, Record<Target, HTMLImageElement>>;

const selectedCharacter = () => characterInput.value as CharacterId;
const selectedFacing = () => facingInput.value as Facing;
const compact = (value: number) => Number(value.toFixed(4));
const tuple = (fit: Fit) => `[${compact(fit.scale)}, ${compact(fit.x)}, ${compact(fit.y)}]`;

function persist() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function updateResult() {
  const id = selectedCharacter();
  resultNode.value = `${id}: {\n  motion: idleFits(${facings.map((facing) => tuple(state[id].motion[facing])).join(', ')}),\n  idle: idleFits(${facings.map((facing) => tuple(state[id].idle[facing])).join(', ')}),\n}`;
}

function syncControls() {
  const id = selectedCharacter();
  const facing = selectedFacing();
  const definition = characters[id];
  frameInput.max = String(definition.frames);
  if (Number(frameInput.value) > definition.frames) frameInput.value = '1';
  speedInput.value = String(definition.duration);
  frameValue.value = frameInput.value;
  speedValue.value = `${speedInput.value}ms`;
  for (const target of ['motion', 'idle'] as Target[]) {
    const fit = state[id][target][facing];
    for (const axis of ['scale', 'x', 'y'] as const) controls[target][axis].value = String(fit[axis]);
    controls[target].scaleValue.value = fit.scale.toFixed(3);
    controls[target].xValue.value = fit.x.toFixed(3);
    controls[target].yValue.value = fit.y.toFixed(3);
  }
  updateResult();
}

function applyControl(target: Target, axis: keyof Fit) {
  state[selectedCharacter()][target][selectedFacing()][axis] = Number(controls[target][axis].value);
  persist();
  syncControls();
}

function drawGuide(center: number, baseline: number, title: string) {
  context.fillStyle = '#17384b';
  context.font = '700 18px system-ui,sans-serif';
  context.textAlign = 'center';
  context.fillText(title, center, 36);
  if (!guidesInput.checked) return;
  context.strokeStyle = 'rgba(188,55,78,.72)';
  context.setLineDash([5, 5]);
  context.beginPath(); context.moveTo(center, 55); context.lineTo(center, 570); context.stroke();
  context.strokeStyle = 'rgba(34,101,132,.78)';
  context.setLineDash([9, 7]);
  context.beginPath(); context.moveTo(center - 175, baseline); context.lineTo(center + 175, baseline); context.stroke();
  context.setLineDash([]);
}

function drawSprite(target: Target, center: number, baseline: number, alpha = 1) {
  const id = selectedCharacter();
  const facing = selectedFacing();
  const image = images[id][target];
  if (!image.naturalWidth) return;
  const fit = state[id][target][facing];
  const size = 300;
  const columns = target === 'motion' ? characters[id].frames : 2;
  const rows = target === 'motion' ? 4 : 2;
  const frame = target === 'motion' ? Number(frameInput.value) - 1 : facingCell[facing].x;
  const row = target === 'motion' ? facingRow[facing] : facingCell[facing].y;
  const sw = image.naturalWidth / columns;
  const sh = image.naturalHeight / rows;
  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, frame * sw, row * sh, sw, sh,
    center + size * fit.x, baseline + size * fit.y, size * fit.scale, size * fit.scale);
  context.restore();
}

const scratch = document.createElement('canvas');
const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
function alphaMetrics(target: Target) {
  const id = selectedCharacter();
  const facing = selectedFacing();
  const image = images[id][target];
  if (!scratchContext || !image.naturalWidth) return null;
  const columns = target === 'motion' ? characters[id].frames : 2;
  const rows = target === 'motion' ? 4 : 2;
  const frame = target === 'motion' ? Number(frameInput.value) - 1 : facingCell[facing].x;
  const row = target === 'motion' ? facingRow[facing] : facingCell[facing].y;
  const sw = image.naturalWidth / columns;
  const sh = image.naturalHeight / rows;
  scratch.width = Math.round(sw); scratch.height = Math.round(sh);
  scratchContext.clearRect(0, 0, scratch.width, scratch.height);
  scratchContext.drawImage(image, frame * sw, row * sh, sw, sh, 0, 0, scratch.width, scratch.height);
  const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data;
  let minY = scratch.height; let maxY = -1;
  for (let y = 0; y < scratch.height; y += 1) for (let x = 0; x < scratch.width; x += 1) {
    if (pixels[(y * scratch.width + x) * 4 + 3] > 8) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  if (maxY < 0) return null;
  const fit = state[id][target][facing];
  return {
    height: (maxY - minY + 1) / scratch.height * 300 * fit.scale,
    foot: 300 * fit.y + (maxY + 1) / scratch.height * 300 * fit.scale,
  };
}

let lastAdvancedAt = 0;
function render(time: number) {
  if (autoplayInput.checked && time - lastAdvancedAt >= Number(speedInput.value)) {
    frameInput.value = String(Number(frameInput.value) % characters[selectedCharacter()].frames + 1);
    frameValue.value = frameInput.value;
    lastAdvancedAt = time;
  }
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#cceeff'); gradient.addColorStop(1, '#e8f5d9');
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  const centers = [200, 600, 1000]; const baseline = 485;
  drawGuide(centers[0], baseline, `动画 · 第 ${frameInput.value} 帧`);
  drawGuide(centers[1], baseline, '独立静态图');
  drawGuide(centers[2], baseline, '动静叠加');
  drawSprite('motion', centers[0], baseline);
  drawSprite('idle', centers[1], baseline);
  drawSprite('motion', centers[2], baseline, .52);
  drawSprite('idle', centers[2], baseline, .52);
  const motionMetrics = alphaMetrics('motion'); const idleMetrics = alphaMetrics('idle');
  if (motionMetrics && idleMetrics) metricsNode.textContent = `可见高度：动画 ${motionMetrics.height.toFixed(1)}px / 静态 ${idleMetrics.height.toFixed(1)}px；脚底相对原点：动画 ${motionMetrics.foot.toFixed(1)}px / 静态 ${idleMetrics.foot.toFixed(1)}px；差值 ${(idleMetrics.foot - motionMetrics.foot).toFixed(1)}px`;
  requestAnimationFrame(render);
}

characterInput.addEventListener('change', () => { frameInput.value = '1'; syncControls(); });
facingInput.addEventListener('change', syncControls);
frameInput.addEventListener('input', () => { frameValue.value = frameInput.value; });
speedInput.addEventListener('input', () => { speedValue.value = `${speedInput.value}ms`; });
for (const target of ['motion', 'idle'] as Target[]) for (const axis of ['scale', 'x', 'y'] as const) controls[target][axis].addEventListener('input', () => applyControl(target, axis));
document.querySelectorAll<HTMLButtonElement>('[data-nudge]').forEach((button) => button.addEventListener('click', () => {
  const [target, axis, delta] = button.dataset.nudge!.split(',') as [Target, 'x' | 'y', string];
  const fit = state[selectedCharacter()][target][selectedFacing()];
  fit[axis] = compact(fit[axis] + Number(delta));
  persist(); syncControls();
}));
resetFacingButton.addEventListener('click', () => {
  const id = selectedCharacter(); const facing = selectedFacing();
  state[id].motion[facing] = defaultFit(); state[id].idle[facing] = defaultFit(); persist(); syncControls();
});
resetCharacterButton.addEventListener('click', () => {
  state[selectedCharacter()] = defaultCharacterState(); persist(); syncControls();
});
copyButton.addEventListener('click', async () => {
  resultNode.select(); await navigator.clipboard?.writeText(resultNode.value);
  copyButton.textContent = '已复制'; window.setTimeout(() => { copyButton.textContent = '复制当前角色参数'; }, 1200);
});
for (const pair of Object.values(images)) for (const image of Object.values(pair)) image.addEventListener('load', syncControls);
syncControls(); requestAnimationFrame(render);
