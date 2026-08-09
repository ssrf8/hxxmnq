// Phase 2 增量 E — bridge 专属场景合同测试（无法 fake 宿主全局的部分）。
// 断言 runHelperGenerate / waitForVariableStage / 事件投影的结构性行为。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const bridge = await read('../src/ui/bridge.ts');
const app = await read('../src/ui/app.ts');
const tx = await read('../src/ui/message-transaction.ts');

test('非本 generationId 事件：started/stream/ended 三处均按 attempt.generationId 过滤', () => {
  const matches = bridge.match(/id !== attempt\.generationId/g) ?? [];
  assert.ok(matches.length >= 3, `应至少 3 处 generationId 过滤（实际 ${matches.length}）`);
  // 具体验证订阅回调存在过滤
  assert.match(bridge, /subscribe\(iframeEvents\.GENERATION_STARTED, \(id\) => \{ if \(id !== attempt\.generationId\) return; trace\('started'\);/);
  assert.match(bridge, /subscribe\(iframeEvents\.STREAM_TOKEN_RECEIVED_FULLY, \(text, id\) => \{/);
  assert.match(bridge, /subscribe\(iframeEvents\.GENERATION_ENDED, \(text, id\) => \{/);
});

test('重复 GENERATION_ENDED 只记录一次（endedLogged 保护）', () => {
  assert.match(bridge, /endedLogged = true;/);
  assert.match(bridge, /if \(id !== attempt\.generationId \|\| endedLogged\) return;/);
});

test('tool-call 结果（非 string）不落楼，明确失败供重试', () => {
  assert.match(bridge, /typeof result !== 'string'/);
  assert.match(bridge, /不支持的 tool-call 结果/);
});

test('空/空白结果不落空楼（可重试）', () => {
  assert.match(bridge, /if \(!text\.trim\(\)\) \{/);
  assert.match(bridge, /empty_result/);
});

test('assistant 落楼失败保留内存结果（pendingHelperResult），禁止自动再调模型', () => {
  assert.match(bridge, /let pendingHelperResult: string \| null = null;/);
  assert.match(bridge, /pendingHelperResult = text;/);
  // retryLastTransaction 的显式落楼分支：只落已生成文本
  assert.match(bridge, /pendingHelperResult && !current\.assistantResponded/);
});

test('Helper 非空正文精确落楼后主动结束本次生成，不依赖通用 ENDED 事件', () => {
  assert.match(
    bridge,
    /pendingHelperResult = text;[\s\S]*?throw error;[\s\S]*?hostGenerationActive = false;\s*transactions\.markGenerationEnded\(\);\s*\} finally \{/,
  );
});

test('原生发送只保留世界书扫描路由，不再改写最终 user 消息', () => {
  assert.match(
    bridge,
    /GENERATION_AFTER_COMMANDS[\s\S]*?buildGalCurrentTurnInjections[\s\S]*?gensokyo-native-route-scan[\s\S]*?once: true/,
  );
  assert.doesNotMatch(bridge, /CHAT_COMPLETION_PROMPT_READY|appendGalContextToFinalUserMessage/);
});

test('v5 三类 GAL 入口都把冻结完整正文写入真实 user 楼层并在生成前复读校验', () => {
  const writes = bridge.match(/message: v2\.request\.modelUserInput/g) ?? [];
  assert.equal(writes.length, 3);
  assert.match(bridge, /storedUserMessageMatchesRequestV2\(pendingRequest, stored\)/);
  assert.match(bridge, /真实玩家楼层与冻结请求不一致：已拒绝生成/);
});

test('listener 在 finally 清理（unsubs.forEach + pendingStreamText 清空），不依赖正常结束', () => {
  assert.match(bridge, /\} finally \{\r?\n\s+unsubs\.forEach/);
  assert.match(bridge, /pendingStreamText = '';/);
});

test('MVU timeout 语义：90 秒上限 + 只恢复结算不再生成文本', () => {
  assert.match(bridge, />= 90000/);
  assert.match(bridge, /只恢复结算，不再生成文本/);
});

test('本地托管剧情收到精确非空回复后直接结算，只有自由对话等待 MVU', () => {
  const sendStart = bridge.indexOf('async sendUserMessage(text');
  const sendEnd = bridge.indexOf('async sendAnomalyResolution(text)', sendStart);
  const sendMethod = bridge.slice(sendStart, sendEnd);
  const anomalyStart = sendEnd;
  const anomalyEnd = bridge.indexOf('async sendDuelVictoryRequest(', anomalyStart);
  const anomalyMethod = bridge.slice(anomalyStart, anomalyEnd);
  const duelEnd = bridge.indexOf('async getTransactionState()', anomalyEnd);
  const duelMethod = bridge.slice(anomalyEnd, duelEnd);
  const anomalyRecoveryStart = bridge.indexOf('const recoverRecordedAnomalyResolution');
  const anomalyRecoveryEnd = bridge.indexOf('const recoverRecordedDuelVictory', anomalyRecoveryStart);
  const anomalyRecovery = bridge.slice(anomalyRecoveryStart, anomalyRecoveryEnd);
  const duelRecoveryEnd = bridge.indexOf('const recoverCompletedCurrentTransaction', anomalyRecoveryEnd);
  const duelRecovery = bridge.slice(anomalyRecoveryEnd, duelRecoveryEnd);
  assert.match(sendMethod, /if \(!action\) await waitForVariableStage\(snapshot\.assistantMessageId\);/);
  assert.doesNotMatch(anomalyMethod, /waitForVariableStage/);
  assert.doesNotMatch(duelMethod, /waitForVariableStage/);
  assert.doesNotMatch(anomalyRecovery, /isDuringExtraAnalysis/);
  assert.doesNotMatch(duelRecovery, /isDuringExtraAnalysis/);
  assert.match(bridge, /if \(!attemptForceReady && !pendingSettlement && !pendingSystemOperation && !variableStageReady\(mvu\)\) return false;/);
  assert.match(
    bridge,
    /recoverRecordedAnomalyResolution\(mvu, current\)[\s\S]*?recoverRecordedDuelVictory\(mvu, current\)[\s\S]*?if \(mvu\.isDuringExtraAnalysis\?\.\(\) && !recorded\) return false;/,
  );
});

test('stream 投影：CustomEvent 广播 + app 监听更新 gg-scene-text（Promise 权威，展示层）', () => {
  assert.match(bridge, /gensokyo-garden:generation-stream/);
  assert.match(bridge, /pendingStreamText = text;/);
  assert.match(app, /addEventListener\('gensokyo-garden:generation-stream'/);
  assert.match(app, /gg-scene-text/);
  assert.match(app, /transactionBusy !== 'true'/);
});

test('retry attemptSeq 递增：由完成的 snapshot 推进一次（V1/V2 按 schema 分派），retry 不再重复加一', () => {
  assert.match(bridge, /pendingRequest = advanceAnyRequest\(request, snapshot\.attemptSeq \?\? request\.attemptSeq\);/);
  // R1/R4：V2 retry 按 request schema 分流到 retryFromScratch，不靠全局 generationTransport
  assert.match(bridge, /const isV2Retry = pendingRequest\?\.schema === REQUEST_SCHEMA_V2/);
  assert.match(bridge, /current\.requestSchema === REQUEST_SCHEMA_V2/);
  assert.match(bridge, /retryFromScratch\(pendingRequest!\)/);
  assert.doesNotMatch(bridge, /generationTransport === 'helper-generate' && pendingRequest/);
  assert.doesNotMatch(bridge, /retryFromScratch\(\{[\s\S]*?attemptSeq:[\s\S]*?\+ 1/);
});

test('writeHelperAssistantMessage 幂等：commitKey 反查 0 条才写/多条歧义失败', () => {
  assert.match(bridge, /resolveAssistantMessageByCommitKey\(activeMessages\(\), attempt\.requestId, attempt\.attemptId\)/);
  assert.match(bridge, /助手楼层 commitKey 反查歧义，禁止猜 ID/);
});

test('P0：assistant 两条持久化路径完成前，提前到达的 MVU 事件不得启动 settlement', () => {
  assert.match(bridge, /let assistantPersistenceInFlight = false;/);
  assert.equal((bridge.match(/assistantPersistenceInFlight = true;/g) ?? []).length, 2);
  assert.equal((bridge.match(/assistantPersistenceInFlight = false;/g) ?? []).length, 3);
  assert.equal((bridge.match(/finally \{\r?\n\s+assistantPersistenceInFlight = false;/g) ?? []).length, 2);
  assert.match(
    bridge,
    /const settlePendingAfterReply = \(forceReady = false\): Promise<boolean> => \{\r?\n\s+if \(assistantPersistenceInFlight\) return Promise\.resolve\(false\);/,
  );
  // 精确 VisitTurn 复读仍是提交门禁；竞态修复不得用放宽验证掩盖 missing-turn。
  assert.match(bridge, /throw new Error\(`VisitTurn 精确复读失败（\$\{verified\.code\}）：保持 settlement pending`\);/);
});

test('P1：一次 settlement 只由统一收尾路径复读 commit，不在回调和返回前重复验证', () => {
  const start = bridge.indexOf('const settlePendingAfterReply');
  const end = bridge.indexOf('const readAllSwipesMessage', start);
  const settlementFlow = bridge.slice(start, end);
  assert.equal((settlementFlow.match(/persistCommitSettled\(/g) ?? []).length, 1);
  assert.match(settlementFlow, /\.then\(async \(settled\) => \{[\s\S]*?await persistCommitSettled\(transactions\.read\(\)\);/);
});

test('chat identity 写前复核：切聊天不落楼', () => {
  assert.match(bridge, /currentChatId\(\)\.trim\(\) !== snapshot\.chatId/);
  assert.match(bridge, /ignored_chat_switched/);
});

test('历史构造排除本次玩家楼层（buildChatHistoryForGenerate + userMessageId）', () => {
  assert.match(bridge, /buildChatHistoryForGenerate\(activeMessages\(\), userMessageId\)/);
});

// ---- B2-T08-R0：请求合同与失败边界（外援强制裁定 1）----
test('R0：V2 构造失败在 transactions.submit 之前抛错，禁止 request 置空后继续', () => {
  assert.match(bridge, /if \(!v2\.ok\) \{/);
  assert.match(bridge, /V2 请求构造失败（\$\{v2\.reason\}）/);
  assert.doesNotMatch(bridge, /requestResult\.ok \? requestResult\.request : undefined/);
  // 构造成功后才把请求赋给 pendingRequest，并作为 submit 的 request
  assert.match(bridge, /pendingRequest = v2\.request;/);
  assert.match(bridge, /request: v2\.request,/);
});

test('R0：新发送不继承旧 pendingRequest 的 requestId（builder 不再传旧 ID）', () => {
  assert.doesNotMatch(bridge, /requestId: pendingRequest\?\.schema === REQUEST_SCHEMA_V2 \? pendingRequest\.requestId/);
  assert.match(bridge, /const requestMetadata = buildRequestMetadataV2\(v2\.request\);/);
});

test('R0：V2 请求一律固定 helper-generate（request schema 判定，不靠全局 transport）', () => {
  assert.match(bridge, /const isV2Pending = pendingRequest\?\.schema === REQUEST_SCHEMA_V2;/);
  assert.match(bridge, /\(generationTransport === 'helper-generate' \|\| isV2Pending\)/);
});

// ---- B2-T08-R4：锁死 Helper transport 与 retry 判定（外援强制裁定 8/19）----
test('R4：V2 走 Helper 后立即 return，不落入 /trigger；continueGeneration 不被 V2 使用', () => {
  assert.match(bridge, /await runHelperGenerate\(\);\r?\n\s+return;/);
  assert.match(bridge, /async continueGeneration\(\) \{/);
  // app 不把 continue 绑定为 V2 恢复路径（V2 stop→retry 走 retryFromScratch）
  assert.doesNotMatch(app, /continueGeneration/);
});

test('R4：Helper 缺失/失败 fail closed（runHelperGenerate 抛错，不调 /trigger 或 /continue）', () => {
  assert.match(bridge, /if \(!request \|\| !g\.generate\) throw new Error\('helper-generate 需要有效 request 与 generate\(\)'\);/);
  assert.match(bridge, /V2 冻结请求缺少恰好一条非空 system 合成历史，拒绝生成/);
});

test('R4：全局 generationTransport 只服务 V1/诊断，不覆盖 V2 合同', () => {
  // V2 判定是“helper-generate || isV2Pending”，generationTransport 不是 V2 的必要条件
  assert.match(bridge, /\(generationTransport === 'helper-generate' \|\| isV2Pending\)/);
  // V2 retry 按 schema 判定（R1 已实现）
  assert.match(bridge, /const isV2Retry = pendingRequest\?\.schema === REQUEST_SCHEMA_V2/);
});

// ---- B2-T08-R1：新请求身份与单次注入（外援强制裁定 3/5/6/7）----
test('R1：app 普通入口不预先注入 narrative contract（纯文本 + 结构化 requestContext）', () => {
  // submitGalMessage 传纯 value
  assert.match(app, /const transaction = await bridge\.sendUserMessage\(\s*value,/s);
  // 目标动作/设施/装修/异变调查等入口不再套 withGardenNarrativeContract
  assert.doesNotMatch(app, /sendUserMessage\(withGardenNarrativeContract/);
  // 结构化上下文：mainTargetCharacterId / requireMainTarget 显式传
  assert.match(app, /const activeTargetCharacterId = activeTarget\?\.type === 'character' \? activeTarget\.id : null/);
  assert.match(app, /mainTargetCharacterId: activeTargetCharacterId/);
  assert.match(app, /eventParticipants: \[\.\.\.eventParticipants\]/);
  assert.match(app, /explicitCharacterIds: authorizedCharacterIds/);
  assert.match(app, /requireMainTarget: Boolean\(activeTargetCharacterId\)/);
  // 异变调查锁定 reimu
  assert.match(app, /mainTargetCharacterId: 'reimu', explicitCharacterIds: \['reimu'\], requireMainTarget: true/);
});

test('R1：MessageTransactionSnapshot.requestSchema 在带 request 的 submit/restore 真实赋值', () => {
  assert.match(tx, /requestSchema: request\.request\.schema/);
  assert.match(tx, /requestSchema: \(result\.request as \{ schema\?: string \}\)\.schema/);
  assert.match(bridge, /current\.requestSchema === REQUEST_SCHEMA_V2/);
});

// ---- B2-T08-R2：保留场景道具的事务语义（外援强制裁定 5）----
test('R2：sceneItemPreview 由 bridge 用 queueSceneItemUse 从持久态派生只读 promptState', () => {
  // bridge 导入 queueSceneItemUse
  assert.match(bridge, /import \{ queueSceneItemUse \} from '\.\/activity-rules';/);
  // 有 preview 时派生 promptState，无则用 before
  assert.match(bridge, /const injectState = requestContext\?\.sceneItemPreview/);
  assert.match(bridge, /queueSceneItemUse\(\s*before,/s);
  // 注入 state 用 promptState，并只传结构化显式角色给统一 builder
  assert.match(bridge, /state: injectState,/);
  assert.match(bridge, /explicitCharacterIds: requestContext\?\.explicitCharacterIds/);
  assert.doesNotMatch(bridge, /contractInjector|withGardenNarrativeContract/);
  // 身份/结算仍以持久 before（pendingOwnershipBefore 克隆 before）
  assert.match(bridge, /pendingOwnershipBefore = structuredClone\(before\);/);
});

test('R2：app 只传结构化 preview，不传整份 GardenState；成功后仍走 queue_scene_item M2', () => {
  assert.doesNotMatch(app, /sendUserMessage\([\s\S]*?queueSceneItemUse\(/);
  assert.match(app, /sceneItemPreview: \{/);
  assert.match(app, /type: 'queue_scene_item',/);
  // 失败路径（sendUserMessage 抛错）不会执行 M2：M2 调用位于发送成功之后
  const sendIndex = app.indexOf('await bridge.sendUserMessage(');
  const m2Index = app.indexOf("type: 'queue_scene_item'");
  assert.ok(sendIndex !== -1 && m2Index !== -1 && m2Index > sendIndex, 'queue_scene_item 必须在发送成功之后');
});

// ---- B2-T08-R3：两个系统生成入口改为 V2（外援强制裁定 6）----
test('R3：异变收束构造 V2 request + 合并 system-operation metadata，不预注入', () => {
  assert.match(bridge, /async sendAnomalyResolution\(text\)/);
  // 构造 V2 request
  assert.match(bridge, /异变收束 V2 请求构造失败/);
  assert.match(bridge, /pendingRequest = v2\.request;/);
  // system-operation metadata 与 V2 metadata 合并
  assert.match(bridge, /gensokyoSystemOperation: \{/);
  assert.match(bridge, /type: 'anomaly_resolution',/);
  assert.match(bridge, /\.\.\.buildRequestMetadataV2\(v2\.request\),/);
  // app 传未注入 prompt
  assert.match(app, /await bridge\.sendAnomalyResolution\(prompt\);/);
  assert.doesNotMatch(app, /sendAnomalyResolution\(withGardenNarrativeContract/);
});

test('R3：决斗胜利以锁定后 reread 状态构造 V2（mainTarget=对手，requireMainTarget:true）', () => {
  assert.match(bridge, /async sendDuelVictoryRequest\(requestText: string, message: string\)/);
  assert.match(bridge, /const duelTargetId = rereadPending\.target_character_id;/);
  assert.match(bridge, /mainTargetCharacterId: duelTargetId \?\? null,/);
  assert.match(bridge, /requireMainTarget: true,/);
  assert.match(bridge, /决斗胜利 V2 请求构造失败/);
  assert.match(bridge, /type: 'duel_victory_dialogue',/);
  assert.match(bridge, /\.\.\.buildRequestMetadataV2\(v2\.request\),/);
  // 不创建第二套结算器：pendingSystemOperation 保持原样
  assert.match(bridge, /pendingSystemOperation = \{ type: 'duel_victory_dialogue', operationId, settlementId \};/);
});
