# r65 测试检查点：流式楼层投影与旁白立绘修复

状态：`candidate`，等待 Luker 实机导入验收。

## 变更

- Luker 假流式的空 assistant 占楼保持生成态，不再由泛化 `GENERATION_STOPPED` 或早到的生成结束信号提前判定“没有收到回复”。
- assistant 楼层出现非空正文、但仍处于生成中时，GAL 显示当前正文和生成提示；输入、建议回复与本地结算继续锁定。
- 只在生成生命周期完成且正文可读后进入 `settling`，再执行 MVU／本地事件结算。
- 旁白 beat 不再回退到当前交谈人物的默认近景：隐藏 portrait、清除 `src`，并标记为 `narrator`。

## 产物

- 文件：`../dist/checkpoint-0.2.0-r65/幻想乡物语-测试检查点-0.2.0-r65.json`
- 字节：`2,151,488`
- SHA-256：`6e9515663d913c98df986c8f51df75f58cfad67451cc97d84fb06a1f722f2d6b`
- UI 脚本：`gensokyo-garden-ui-020-r65`
- 世界书条目：`17`
- 素材模式：`remote-r2-live`，读取既有固定 live manifest；本次未上传、未覆盖任何 R2 对象。

## 离线门禁

- `npm run check:ui`：通过。
- `npm test`：203/203 通过。
- `node scripts/build-ui.mjs --asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc`：通过。
- 打包 dry-run 与正式写入的字节／SHA-256 一致。
- 包内检查确认包含 `markStreamTokenReceived`、`STREAM_TOKEN_RECEIVED`、`portraitKind = "narrator"` 与 portrait `src` 清除逻辑。

## Luker 验收

在新聊天导入 r65 后，依次验证：普通发送出现空 assistant 楼层、正文后到、生成中渐进正文、旁白无人物图、GAL 停止、原生停止、重新生成和 swipe。真实宿主通过前不得称为正式发布。
