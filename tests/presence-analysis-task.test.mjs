import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const result = await build({
  entryPoints: [fileURLToPath(new URL('../src/ui/presence-analysis-task.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
});
const presence = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);

const projectionBuild = await build({
  entryPoints: [fileURLToPath(new URL('../src/ui/variable-analysis-task-projection.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: 'node22',
});
const projection = await import(`data:text/javascript;base64,${Buffer.from(projectionBuild.outputFiles[0].text).toString('base64')}`);

const request = { requestId: 'req-presence-1', relevantCharacterIds: ['reimu', 'marisa'] };
const baseState = () => ({
  environment: { day: 1, time_period: '白昼' },
  areas: { greenhouse_plot: { id: 'greenhouse_plot' } },
  characters: { reimu: { id: 'reimu' }, marisa: { id: 'marisa' } },
  presence_snapshot: {
    present_character_ids: ['reimu', 'marisa'],
    character_views: {
      reimu: { area_id: 'central_courtyard', action: '交谈', facing: 'front' },
      marisa: { area_id: 'central_courtyard', action: '旁听', facing: 'left' },
    },
    visitor_meta: {},
  },
  interaction: {},
  uid_counters: { character_visit: 1 },
});

test('staging freezes relevant present characters and semantic baseline', () => {
  const staged = presence.stagePresenceAnalysisTask(baseState(), request);
  assert.deepEqual(staged.interaction.presence_analysis_task.slots.map((slot) => slot.character_id), ['reimu', 'marisa']);
  assert.equal(staged.interaction.presence_analysis_task.slots[0].baseline_area_id, 'central_courtyard');
  assert.equal(staged.interaction.presence_analysis_task.slots[0].decision, 'pending');
});

test('combined staging uses authoritative assistant baseline instead of an empty new user floor', () => {
  const authoritative = baseState();
  const requestWithVisits = {
    ...request,
    visitIdsByCharacter: { reimu: 'character_visit_1', marisa: 'character_visit_2' },
  };
  const staged = projection.stageVariableAnalysisTasks(authoritative, requestWithVisits);
  assert.deepEqual(
    staged.interaction.presence_analysis_task.slots.map((slot) => slot.character_id),
    ['reimu', 'marisa'],
  );
  assert.deepEqual(
    staged.interaction.visit_summary_task.slots.map((slot) => slot.character_id),
    ['reimu', 'marisa'],
  );
  const text = projection.formatVariableAnalysisTaskProjection(authoritative, requestWithVisits);
  const parsed = JSON.parse(text.match(/<GensokyoVariableAnalysisTask>(.*?)<\/GensokyoVariableAnalysisTask>/s)[1]);
  assert.deepEqual(parsed.interaction.presence_analysis_task, staged.interaction.presence_analysis_task);
  assert.deepEqual(parsed.interaction.visit_summary_task, staged.interaction.visit_summary_task);
});

test('extra-model move and leave decisions are committed and task is cleared', () => {
  const baseline = baseState();
  const staged = presence.stagePresenceAnalysisTask(baseline, request);
  staged.interaction.presence_analysis_task.slots[0] = {
    ...staged.interaction.presence_analysis_task.slots[0],
    decision: 'move', area_id: 'greenhouse_plot', action: '查看花圃', facing: 'right',
  };
  staged.interaction.presence_analysis_task.slots[1] = {
    ...staged.interaction.presence_analysis_task.slots[1], decision: 'leave',
  };
  const next = presence.applyPresenceAnalysisTask(baseline, staged, request);
  assert.equal(next.presence_snapshot.character_views.reimu.area_id, 'greenhouse_plot');
  assert.equal(next.presence_snapshot.character_views.reimu.action, '查看花圃');
  assert.deepEqual(next.presence_snapshot.present_character_ids, ['reimu']);
  assert.equal(next.interaction.presence_analysis_task, null);
});

test('tampered envelope, unknown area and local baseline drift cannot overwrite presence', () => {
  const baseline = baseState();
  const tampered = presence.stagePresenceAnalysisTask(baseline, request);
  tampered.interaction.presence_analysis_task.slots[0].character_id = 'alice';
  assert.deepEqual(
    presence.applyPresenceAnalysisTask(baseline, tampered, request).presence_snapshot,
    baseline.presence_snapshot,
  );

  const invalidArea = presence.stagePresenceAnalysisTask(baseline, request);
  Object.assign(invalidArea.interaction.presence_analysis_task.slots[0], {
    decision: 'move', area_id: 'unknown_void',
  });
  assert.equal(
    presence.applyPresenceAnalysisTask(baseline, invalidArea, request).presence_snapshot.character_views.reimu.area_id,
    'central_courtyard',
  );

  const drifted = presence.stagePresenceAnalysisTask(baseline, request);
  Object.assign(drifted.interaction.presence_analysis_task.slots[0], {
    decision: 'leave',
  });
  drifted.presence_snapshot.character_views.reimu.area_id = 'main_house';
  const afterDrift = presence.applyPresenceAnalysisTask(baseline, drifted, request);
  assert.ok(afterDrift.presence_snapshot.present_character_ids.includes('reimu'));
  assert.equal(afterDrift.presence_snapshot.character_views.reimu.area_id, 'main_house');
});
