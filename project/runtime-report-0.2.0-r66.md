# r66 测试检查点：原生发送／停止状态监控

状态：`candidate`，等待 Luker 实机导入验收。

## 修复

- 监听父页面 `body[data-generating]` 与 `#mes_stop` 的属性变化；可读取时，该原生发送／停止状态优先于 assistant 楼层是否已出现。
- 空 assistant 占位在原生停止按钮仍显示时始终保持 GAL 生成态，不进入“回复已收到”或“还没有可播放的回复”。
- 原生控件恢复发送后，若同一占位楼层仍为空，继续等待正文落盘或超时；仅同一楼层成为非空正文后才可播放和结算。
- `getChatMessages` 结果按 `message_id` 正序标准化，避免不同返回顺序把上一轮 assistant 误配到当前 user 事务。

## 产物

- 文件：`../dist/checkpoint-0.2.0-r66/幻想乡物语-测试检查点-0.2.0-r66.json`
- 字节：`2,153,174`
- SHA-256：`0c34ee3fc620755f0b4c5effa15221762c63cb41147b45f921e75629ae547fe2`
- UI 脚本：`gensokyo-garden-ui-020-r66`
- 素材模式：`remote-r2-live`；本次未上传、未覆盖 R2 对象。

## 离线门禁

- `npm run check:ui`：通过。
- `npm test`：203/203 通过。
- R2-live UI 构建：通过。
- 打包 dry-run 与正式产物 SHA-256 一致。

## Luker 验收

导入 r66 后普通发送一次：观察空 assistant 占楼期间 GAL 是否始终显示生成；原生停止按钮消失后，正文注入同一楼层时是否直接转入播放；再分别验证手动停止和真实空回复的超时提示。
