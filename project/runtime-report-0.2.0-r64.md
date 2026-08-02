# r64 live 素材候选发布记录

- 维护源提交：`408529c00274279172df263a26925f0646eb4333`。
- live generation：`1`；184 个运行素材，`208,627,661` bytes。
- 公网 manifest：`https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json`。
- manifest SHA-256：`3e6d02780349105a9bc9db02cfecd0ef79b6ab495fad1b5b53aba567970cced4`。
- 发布顺序：184 个媒体先逐项上传；每项均从公开域名 HEAD 核验 HTTP 200、长度、MIME 和 `public, max-age=0, must-revalidate`；随后上传 `no-store` manifest，并核对公开下载整文件 SHA-256。
- r64 JSON：`dist/checkpoint-0.2.0-r64/幻想乡物语-测试检查点-0.2.0-r64.json`，`2,149,342` bytes，SHA-256 `59cc501656dca4d27ea0eee89504303d3f06140df74b930a2224f42200a0784b`。
- 离线门禁：`check:ui`、`check:assets:r2`、`npm test`（201/201）和 `git diff --check` 通过。

该产物是候选包。真实 SillyTavern 中仍需用新聊天验收：live manifest 拉取、素材更新后 URL 不变但内容刷新，以及 r63 普通发送空楼层等待修复。
