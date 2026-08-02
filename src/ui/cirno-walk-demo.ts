import { resolveCharacterSprites } from './character-sprite-registry';
import { SpriteActor } from './sprite-actor';

const canvas = document.querySelector<HTMLCanvasElement>('#cirno-demo-canvas');
const status = document.querySelector<HTMLElement>('#cirno-demo-status');
if (!canvas || !status) throw new Error('琪露诺动画验收页缺少必要节点');
const context = canvas.getContext('2d');
if (!context) throw new Error('浏览器不支持 Canvas 2D');
const demoCanvas: HTMLCanvasElement = canvas;
const demoStatus: HTMLElement = status;
const demoContext: CanvasRenderingContext2D = context;

const sprites = resolveCharacterSprites('../assets', {
  cirnoSpriteSrc: '../assets/characters/cirno/cirno-turnaround-v1.webp',
  cirnoMotionSrc: '../assets/characters/cirno/cirno-walk-cycle-v1.webp',
  cirnoSequenceSrc: '../assets/characters/cirno/cirno-animation-sequence-approved-v1.webp',
} as DOMStringMap);
const actor = new SpriteActor('cirno-demo', sprites.cirno, () => undefined);
actor.sync({ area_id: 'demo', action: '自由巡游', facing: 'front' }, false, true);

let previous = 0;
function frame(time: number) {
  const delta = previous ? Math.min(50, time - previous) : 16;
  previous = time;
  actor.update(delta);
  demoContext.clearRect(0, 0, demoCanvas.width, demoCanvas.height);
  const gradient = demoContext.createLinearGradient(0, 0, 0, demoCanvas.height);
  gradient.addColorStop(0, '#bfe9ff');
  gradient.addColorStop(1, '#dff4d1');
  demoContext.fillStyle = gradient;
  demoContext.fillRect(0, 0, demoCanvas.width, demoCanvas.height);
  demoContext.fillStyle = 'rgba(255,255,255,.42)';
  for (let x = 35; x < demoCanvas.width; x += 92) demoContext.fillRect(x, 48 + (x % 4) * 7, 44, 8);
  const anchorX = demoCanvas.width / 2 + actor.offsetX * demoCanvas.width * 1.7;
  const anchorY = demoCanvas.height * .7 + actor.offsetY * demoCanvas.height * 1.5;
  demoContext.strokeStyle = 'rgba(29,91,125,.55)';
  demoContext.setLineDash([8, 7]);
  demoContext.beginPath();
  demoContext.moveTo(24, anchorY);
  demoContext.lineTo(demoCanvas.width - 24, anchorY);
  demoContext.stroke();
  demoContext.setLineDash([]);
  actor.draw(demoContext, anchorX, anchorY, 190);
  demoStatus.textContent = actor.motion === 'walk'
    ? `移动中 · ${actor.facing} · 蓝色虚线是当前落脚基准`
    : `停止中 · ${actor.facing} · 蓝色虚线是当前落脚基准`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
