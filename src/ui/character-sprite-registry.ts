import type { SpriteActorConfig } from './sprite-actor';

interface CharacterSpriteDefinition extends Omit<SpriteActorConfig, 'idleSource' | 'motionSource'> {
  idleFile: string;
  motionFile: string;
}

const definitions: Record<string, CharacterSpriteDefinition> = {
  reimu: {
    label: '博丽灵梦',
    idleFile: 'reimu-turnaround-v1.png',
    motionFile: 'reimu-walk-cycle-v1.png',
    movementStyle: 'walk',
    frameDurationMs: 116,
    idleBob: 0.75,
    motionBob: 0.8,
    motionSway: 0.01,
    travelSpeed: 0.000018,
    travelRadius: 0.038,
  },
  marisa: {
    label: '雾雨魔理沙',
    idleFile: 'marisa-riding-turnaround-v3.png',
    motionFile: 'marisa-hover-cycle-v1.png',
    movementStyle: 'hover',
    frameDurationMs: 148,
    idleBob: 1.35,
    motionBob: 1.65,
    motionSway: 0.008,
    travelSpeed: 0.000021,
    travelRadius: 0.045,
  },
  cirno: {
    label: '琪露诺',
    idleFile: 'cirno-turnaround-v1.png',
    motionFile: 'cirno-walk-cycle-v1.png',
    movementStyle: 'flutter',
    frameDurationMs: 108,
    idleBob: 1.1,
    motionBob: 1.3,
    motionSway: 0.012,
    travelSpeed: 0.00002,
    travelRadius: 0.042,
  },
  alice: {
    label: '爱丽丝·玛格特洛依德',
    idleFile: 'alice-turnaround-v1.png',
    motionFile: 'alice-walk-cycle-v1.png',
    movementStyle: 'walk',
    frameDurationMs: 132,
    idleBob: 0.55,
    motionBob: 0.65,
    motionSway: 0.006,
    travelSpeed: 0.000016,
    travelRadius: 0.035,
  },
  mystia: {
    label: '米斯蒂娅·萝蕾拉',
    idleFile: 'mystia-turnaround-v2.png',
    motionFile: 'mystia-walk-cycle-v1.png',
    movementStyle: 'flutter',
    frameDurationMs: 112,
    idleBob: 1,
    motionBob: 1.2,
    motionSway: 0.012,
    travelSpeed: 0.000019,
    travelRadius: 0.04,
  },
  suika: {
    label: '伊吹萃香',
    idleFile: 'suika-turnaround-v1.png',
    motionFile: 'suika-walk-cycle-v1.png',
    movementStyle: 'walk',
    frameDurationMs: 124,
    idleBob: 0.8,
    motionBob: 0.95,
    motionSway: 0.014,
    travelSpeed: 0.000018,
    travelRadius: 0.039,
  },
  nitori: {
    label: '河城荷取',
    idleFile: 'nitori-turnaround-v1.png',
    motionFile: 'nitori-walk-cycle-v1.png',
    movementStyle: 'walk',
    frameDurationMs: 118,
    idleBob: 0.65,
    motionBob: 0.85,
    motionSway: 0.008,
    travelSpeed: 0.000019,
    travelRadius: 0.04,
  },
  sakuya: {
    label: '十六夜咲夜',
    idleFile: 'sakuya-turnaround-v1.png',
    motionFile: 'sakuya-walk-cycle-v1.png',
    movementStyle: 'walk',
    frameDurationMs: 126,
    idleBob: 0.5,
    motionBob: 0.6,
    motionSway: 0.005,
    travelSpeed: 0.000017,
    travelRadius: 0.036,
  },
};

export function resolveCharacterSprites(assetBase: string, dataset: DOMStringMap) {
  return Object.fromEntries(Object.entries(definitions).map(([id, definition]) => {
    const idleSource = dataset[`${id}SpriteSrc`]
      || `${assetBase}/characters/${id}/${definition.idleFile}`;
    const motionSource = dataset[`${id}MotionSrc`]
      || `${assetBase}/characters/${id}/${definition.motionFile}`;
    return [id, { ...definition, idleSource, motionSource } satisfies SpriteActorConfig];
  })) as Record<string, SpriteActorConfig>;
}
