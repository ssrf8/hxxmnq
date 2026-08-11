import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const importTypescript = async (path) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const context = await importTypescript('../src/ui/facility-system-context.ts');

test('设施 system 上下文只投影建成形态、结构状态和权威边界', () => {
  const state = {
    areas: { main_house: { state: '启用' } },
    facilities: {
      magic_greenhouse: { state: '启用', current_form: '妖花温室' },
      moon_spring: { state: '启用', current_form: '静水观测池' },
    },
    facility_runtime: {
      moon_spring: {
        built: true,
        current_form: '静水观测池',
        status: 'abnormal',
        condition_id: 'moon_spring_ripple_noise',
        risk_cooldown_until: 999,
        second_form_choice_pending: true,
      },
    },
  };
  const before = structuredClone(state);
  const result = context.buildFacilitySystemContext(state);

  assert.match(result, /^【庭园设施现状：当前代码事实】/u);
  assert.match(result, /旧主屋：已修复；正常使用/u);
  assert.match(result, /魔法温室：已建成；形态“妖花温室”；运转正常/u);
  assert.match(result, /月见温泉：已建成；形态“静水观测池”；运转异常（静水涟漪紊乱）/u);
  assert.match(result, /优先于开场背景和剧情梗概中的旧状态/u);
  assert.doesNotMatch(result, /risk_cooldown|second_form|999|moon_spring_ripple_noise/u);
  assert.deepEqual(state, before);
});

test('未建成的后续设施不投影，损坏设施不会被误写成正常', () => {
  const result = context.buildFacilitySystemContext({
    areas: { main_house: { state: '损坏' } },
    facilities: {
      fairy_garden: { state: '未发现', current_form: null },
      banquet_plaza: { state: '损坏', current_form: '符卡演武场' },
    },
    facility_runtime: {
      fairy_garden: { built: false, status: 'normal' },
      banquet_plaza: {
        built: true,
        current_form: '符卡演武场',
        status: 'damaged',
        condition_id: 'banquet_arena_floor_damage',
      },
    },
  });

  assert.match(result, /旧主屋：尚未修复；当前损坏/u);
  assert.match(result, /宴会广场：已建成；形态“符卡演武场”；结构损坏（场地地板损伤）/u);
  assert.doesNotMatch(result, /妖精花园/u);
});
