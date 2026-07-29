import type {
  SpriteActorConfig,
  SpriteFacing,
  SpriteFrameTransform,
  SpriteSequenceConfig,
} from './sprite-actor';

interface CharacterSpriteDefinition extends Omit<SpriteActorConfig, 'idleSource' | 'motionSource' | 'animationSource' | 'sequence'> {
  idleFile: string;
  motionFile: string;
  animationFile?: string;
  sequenceFile?: string;
  sequenceDefinition?: Omit<SpriteSequenceConfig, 'source'>;
}

const walkWander = {
  travelRadiusY: 0.065,
  travelDistanceMin: 0.034,
  travelDistanceMax: 0.08,
  restDurationMs: [900, 2200] as const,
  turnDurationMs: [120, 180] as const,
  settleDurationMs: [120, 200] as const,
};

const flutterWander = {
  ...walkWander,
  travelRadiusY: 0.075,
  restDurationMs: [760, 1800] as const,
};

type FrameFit = readonly [scale: number, x: number, y: number];
const idleFits = (...values: readonly [FrameFit, FrameFit, FrameFit, FrameFit]) =>
  Object.fromEntries(
    (['front', 'back', 'left', 'right'] as const).map((facing, index) => {
      const [scale, x, y] = values[index];
      return [facing, { scale, x, y }];
    }),
  ) as Record<SpriteFacing, SpriteFrameTransform>;

const turnaroundFits = {
  reimu: idleFits([.8277, -.4136, -.7617], [.8222, -.4116, -.7564], [.81, -.413, -.6827], [.7988, -.4015, -.6729]),
  marisa: idleFits([.837, -.4659, -.7442], [.7801, -.344, -.7405], [.9012, -.4946, -.7253], [.8982, -.3896, -.7299]),
  // Cirno's turnaround silhouettes read larger than their alpha bounds suggest.
  // Keep the measured center/foot anchors, but reduce the resting art by 10%.
  cirno: idleFits([.6844, -.3964, -.6659], [.689, -.3009, -.6706], [.6452, -.3754, -.5318], [.6402, -.2653, -.5323]),
  alice: idleFits([.8181, -.4765, -.7965], [.8238, -.3398, -.7685], [.829, -.4863, -.6836], [.817, -.3394, -.6781]),
  mystia: idleFits([.8102, -.4409, -.767], [.7445, -.352, -.6891], [.7996, -.4176, -.678], [.7882, -.3742, -.6585]),
  suika: idleFits([.8068, -.4499, -.7481], [.8, -.3505, -.7415], [.8226, -.4768, -.7009], [.8186, -.3423, -.7008]),
  nitori: idleFits([.873, -.5099, -.7898], [.8671, -.3712, -.7843], [.8519, -.483, -.6979], [.8519, -.3692, -.6979]),
  sakuya: idleFits([.8372, -.4941, -.7576], [.8488, -.3653, -.7589], [.8409, -.491, -.6738], [.8349, -.3605, -.6735]),
};

// The approved Cirno motion sequence is darker than her turnaround sheet. Brighten
// movement instead of dimming the resting art; the reciprocal measured ratios keep
// the transition close without rewriting or smoothing the pixel assets.
const cirnoMotionBrightness: Record<SpriteFacing, number> = {
  front: 1.45,
  back: 1.56,
  left: 1.47,
  right: 1.47,
};

const definitions: Record<string, CharacterSpriteDefinition> = {
  reimu: {
    ...walkWander,
    label: '博丽灵梦',
    idleFile: 'reimu-turnaround-v1.png',
    motionFile: 'reimu-walk-cycle-v1.png',
    animationFile: 'reimu-animation-v2-r6.png',
    sequenceFile: 'reimu-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 20, rows: 4, frameDurationMs: 110, loopStart: 0, loopEnd: 19 },
    idleFrameTransforms: turnaroundFits.reimu,
    movementStyle: 'walk',
    frameDurationMs: 116,
    motionBob: 0.8,
    motionSway: 0.01,
    travelSpeed: 0.000018,
    travelRadius: 0.095,
  },
  marisa: {
    ...flutterWander,
    label: '雾雨魔理沙',
    idleFile: 'marisa-riding-turnaround-v3.png',
    motionFile: 'marisa-hover-cycle-v1.png',
    animationFile: 'marisa-animation-v2-r2.png',
    idleFrameTransforms: turnaroundFits.marisa,
    movementStyle: 'hover',
    frameDurationMs: 148,
    motionBob: 1.65,
    motionSway: 0.008,
    travelSpeed: 0.000021,
    travelRadius: 0.11,
  },
  cirno: {
    ...flutterWander,
    label: '琪露诺',
    idleFile: 'cirno-turnaround-v1.png',
    motionFile: 'cirno-walk-cycle-v1.png',
    movementStyle: 'flutter',
    sequenceFile: 'cirno-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 17, rows: 4, frameDurationMs: 100, loopStart: 0, loopEnd: 16 },
    idleFrameTransforms: turnaroundFits.cirno,
    motionFrameBrightness: cirnoMotionBrightness,
    frameDurationMs: 108,
    motionBob: 1.3,
    motionSway: 0.012,
    travelSpeed: 0.00002,
    travelRadius: 0.105,
  },
  alice: {
    ...walkWander,
    label: '爱丽丝·玛格特洛依德',
    idleFile: 'alice-turnaround-v1.png',
    motionFile: 'alice-walk-cycle-v1.png',
    movementStyle: 'walk',
    sequenceFile: 'alice-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 25, rows: 4, frameDurationMs: 90, loopStart: 0, loopEnd: 24 },
    idleFrameTransforms: turnaroundFits.alice,
    frameDurationMs: 132,
    motionBob: 0.65,
    motionSway: 0.006,
    travelSpeed: 0.000016,
    travelRadius: 0.09,
  },
  mystia: {
    ...flutterWander,
    label: '米斯蒂娅·萝蕾拉',
    idleFile: 'mystia-turnaround-v2.png',
    motionFile: 'mystia-walk-cycle-v1.png',
    movementStyle: 'flutter',
    sequenceFile: 'mystia-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 24, rows: 4, frameDurationMs: 80, loopStart: 0, loopEnd: 23 },
    idleFrameTransforms: turnaroundFits.mystia,
    frameDurationMs: 112,
    motionBob: 1.2,
    motionSway: 0.012,
    travelSpeed: 0.000019,
    travelRadius: 0.1,
  },
  suika: {
    ...walkWander,
    label: '伊吹萃香',
    idleFile: 'suika-turnaround-v1.png',
    motionFile: 'suika-walk-cycle-v1.png',
    movementStyle: 'walk',
    sequenceFile: 'suika-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 19, rows: 4, frameDurationMs: 100, loopStart: 0, loopEnd: 18 },
    idleFrameTransforms: turnaroundFits.suika,
    frameDurationMs: 124,
    motionBob: 0.95,
    motionSway: 0.014,
    travelSpeed: 0.000018,
    travelRadius: 0.095,
  },
  nitori: {
    ...walkWander,
    label: '河城荷取',
    idleFile: 'nitori-turnaround-v1.png',
    motionFile: 'nitori-walk-cycle-v1.png',
    movementStyle: 'walk',
    sequenceFile: 'nitori-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 22, rows: 4, frameDurationMs: 90, loopStart: 0, loopEnd: 21 },
    idleFrameTransforms: turnaroundFits.nitori,
    frameDurationMs: 118,
    motionBob: 0.85,
    motionSway: 0.008,
    travelSpeed: 0.000019,
    travelRadius: 0.1,
  },
  sakuya: {
    ...walkWander,
    label: '十六夜咲夜',
    idleFile: 'sakuya-turnaround-v1.png',
    motionFile: 'sakuya-walk-cycle-v1.png',
    movementStyle: 'walk',
    sequenceFile: 'sakuya-animation-sequence-approved-v1.png',
    sequenceDefinition: { columns: 24, rows: 4, frameDurationMs: 100, loopStart: 0, loopEnd: 23 },
    idleFrameTransforms: turnaroundFits.sakuya,
    frameDurationMs: 126,
    motionBob: 0.6,
    motionSway: 0.005,
    travelSpeed: 0.000017,
    travelRadius: 0.092,
  },
};

export function resolveCharacterSprites(assetBase: string, dataset: DOMStringMap) {
  return Object.fromEntries(Object.entries(definitions).map(([id, definition]) => {
    const idleSource = dataset[`${id}SpriteSrc`]
      || `${assetBase}/characters/${id}/${definition.idleFile}`;
    const motionSource = dataset[`${id}MotionSrc`]
      || `${assetBase}/characters/${id}/${definition.motionFile}`;
    const animationSource = dataset[`${id}AnimationSrc`] || (definition.animationFile
      ? `${assetBase}/characters/${id}/${definition.animationFile}`
      : undefined);
    const sequenceSource = dataset[`${id}SequenceSrc`] || (definition.sequenceFile
      ? `${assetBase}/characters/${id}/${definition.sequenceFile}`
      : undefined);
    const sequence = sequenceSource && definition.sequenceDefinition
      ? { ...definition.sequenceDefinition, source: sequenceSource }
      : undefined;
    const { sequenceFile: _sequenceFile, sequenceDefinition: _sequenceDefinition, ...config } = definition;
    return [id, { ...config, idleSource, motionSource, animationSource, sequence } satisfies SpriteActorConfig];
  })) as Record<string, SpriteActorConfig>;
}
