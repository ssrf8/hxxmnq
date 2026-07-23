import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('庭园地图只读取访客快照，不渲染玩家占位小人', async () => {
  const source = await read('../src/ui/garden-map.ts');
  assert.match(source, /present_character_ids/);
  assert.match(source, /intentionally no player marker/);
  assert.doesNotMatch(source, /state\.player/);
});

test('灵梦 NPC 使用自包含四向图集并提供可暂停的 idle/walk 动画', async () => {
  const map = await read('../src/ui/garden-map.ts');
  const actor = await read('../src/ui/sprite-actor.ts');
  const build = await read('../scripts/build-ui.mjs');
  assert.match(map, /new SpriteActor\('reimu'/);
  assert.match(map, /requestAnimationFrame/);
  assert.match(map, /visibilitychange/);
  assert.match(actor, /SpriteMotion = 'idle' \| 'walk'/);
  assert.match(actor, /prefers-reduced-motion|reducedMotion/);
  assert.match(actor, /facingCell/);
  assert.match(build, /reimuSpriteDataUrl/);
  assert.match(build, /reimu-turnaround-v1\.png/);
});

test('庭园地图滚轮缩放不被绘制尺寸抵消，并保持指针锚点', async () => {
  const source = await read('../src/ui/garden-map.ts');
  const styles = await read('../src/ui/styles.css');
  assert.match(source, /const drawWidth = canvasRatio > imageRatio \? width : height \* imageRatio/);
  assert.doesNotMatch(source, /const viewWidth = width \/ this\.camera\.zoom/);
  assert.match(source, /const worldX = \(point\.x - this\.canvas\.width \/ 2 - this\.camera\.x\) \/ previousZoom/);
  assert.match(source, /this\.camera\.x = point\.x - this\.canvas\.width \/ 2 - worldX \* nextZoom/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /canvas\.dataset\.zoom = this\.camera\.zoom\.toFixed\(3\)/);
  assert.match(source, /if \(this\.canvas\.width === width && this\.canvas\.height === height\) return/);
  assert.match(styles, /\.gg-map-shell \{[^}]*height: clamp\(420px, 62vh, 620px\)/);
  assert.match(styles, /#gg-garden-map \{[^}]*height: 100%; min-height: 0/);
  assert.doesNotMatch(styles, /#gg-garden-map \{[^}]*min-height: 480px/);
});

test('互动是多轮真实消息，并保留结束当前聊天按钮', async () => {
  const document = await read('../src/ui/index.html');
  const controller = await read('../src/ui/app.ts');
  assert.match(document, /id="gg-end-chat"/);
  assert.match(document, /id="gg-show-native"/);
  assert.match(controller, /bridge\.sendUserMessage/);
  const endHandler = controller.slice(
    controller.indexOf("'gg-end-chat'"),
    controller.indexOf("'gg-compose-form'"),
  );
  assert.match(endHandler, /composeInput\.value/);
  assert.doesNotMatch(endHandler, /sendUserMessage/);
});

test('符卡配置限制敌弹模式与参数上限', async () => {
  const config = JSON.parse(await read('../src/battle/configs/greenhouse-flower-core-tutorial-v1.json'));
  const allowed = new Set(['fixed_seed_ring', 'petal_fan', 'homing_leaf', 'local_safe_zone']);
  for (const phase of config.phases) {
    for (const pattern of phase.patterns) assert.ok(allowed.has(pattern.pattern_id), pattern.pattern_id);
  }
  assert.deepEqual(config.parameter_limits.speed, [40, 260]);
  assert.equal(config.player.auto_fire, true);
});

test('正式运行只在对应事件激活时开放符卡入口', async () => {
  const source = await read('../src/ui/app.ts');
  assert.match(source, /runtimeMode === 'preview' \|\| activeConfig === 'greenhouse_flower_core'/);
});

test('动态开局只预览草稿，并通过桥接提交真实消息', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(document, /id="gg-opening-preview"/);
  assert.match(document, /id="gg-opening-commit"/);
  assert.match(opening, /buildOpeningMessage\(draft\)/);
  assert.match(opening, /sessionStorage/);
  assert.match(opening, /appearanceSentence/);
  assert.match(bridge, /createChatMessages/);
  assert.match(bridge, /<gensokyo_opening transaction=/);
  assert.match(bridge, /include_swipes: false/);
  assert.match(bridge, /withoutMarker\(item\.message\) === expectedBody/);
  assert.doesNotMatch(opening, /replaceMvuData|stat_data\s*=/);
});

test('普通互动使用非隐藏真实消息、事务标识和无刷新写入', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  const transaction = await read('../src/ui/message-transaction.ts');
  const document = await read('../src/ui/index.html');
  assert.match(bridge, /is_hidden: false/);
  assert.match(bridge, /refresh: 'none'/);
  assert.doesNotMatch(bridge, /is_hidden: true/);
  assert.match(transaction, /gensokyoTransactionId/);
  assert.match(transaction, /submitting_user/);
  assert.match(transaction, /generating/);
  assert.match(transaction, /settling/);
  assert.match(transaction, /settled/);
  assert.match(transaction, /failed/);
  assert.match(document, /id="gg-retry-transaction"/);
});

test('最新回复没有变量块时向前读取最近一份 MVU 正式状态', async () => {
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(bridge, /function latestPersistedState/);
  assert.match(bridge, /filter\(\(message\) => message\.role === 'assistant'\)\.reverse\(\)/);
  assert.match(bridge, /Object\.keys\(state\)\.length > 0/);
  assert.match(bridge, /return latestPersistedState\(mvu\)/);
  assert.match(bridge, /if \(!g\.Mvu\?\.getMvuData\) await g\.waitGlobalInitialized/);
});

test('开场变量掉格式时提供幂等恢复，不把玩家锁在设置页', async () => {
  const document = await read('../src/ui/index.html');
  const opening = await read('../src/ui/opening.ts');
  const bridge = await read('../src/ui/bridge.ts');
  assert.match(document, /id="gg-opening-recovery"/);
  assert.match(document, /id="gg-opening-retry"/);
  assert.match(document, /id="gg-opening-enter"/);
  assert.match(document, /id="gg-opening-repair"/);
  assert.match(document, /id="gg-opening-native"/);
  assert.match(opening, /getOpeningProgress/);
  assert.match(opening, /enterGarden/);
  assert.match(opening, /regenerateLatest/);
  assert.match(opening, /repairOpening/);
  assert.match(bridge, /gensokyo_opening_repair/);
  assert.match(bridge, /parseOpeningMessage/);
  assert.match(bridge, /MVU 写入后复读校验失败/);
  assert.match(bridge, /replaceMvuData/);
  assert.match(bridge, /message_id: messageId/);
  assert.match(bridge, /只补写其中已经确认的玩家姓名/);
});

test('打包器提供 MVU initvar 初始状态，不依赖角色脚本变量初始化消息楼层', async () => {
  const packer = await read('../scripts/package-checkpoint.mjs');
  assert.match(packer, /\[initvar\] 移动庭园初始状态/);
  assert.match(packer, /<initvar>/);
  assert.match(packer, /JSON\.stringify\(initialState, null, 2\)/);
  assert.match(packer, /if \(!DRY_RUN && await exists\(OUTPUT_FILE\)\)/);
});

test('数据库适配器是可选归档且不下载或执行远程脚本', async () => {
  const adapter = await read('../src/ui/database-adapter.ts');
  assert.match(adapter, /AutoCardUpdaterAPI/);
  assert.match(adapter, /state\.meta\?\.opening_committed/);
  assert.match(adapter, /祖父的遗物（庭守钥）/);
  assert.doesNotMatch(adapter, /fetch\(|eval\(|new Function/);
});

test('运行挂载产物自包含界面与底图，不依赖开发服务器', async () => {
  const mount = await read('../dist/runtime/ui-mount.js');
  assert.match(mount, /data:image\/png;base64,/);
  assert.match(mount, /__GENSOKYO_GARDEN_UI_021__/);
  assert.match(mount, /show-native-chat/);
  assert.match(mount, /gensokyo-game-shell/);
  assert.match(mount, /gg-gensokyo-chat-active/);
  assert.doesNotMatch(mount, /position:'fixed',inset/);
  assert.doesNotMatch(mount, /127\.0\.0\.1:8765|gcore\.jsdelivr\.net/);
});
