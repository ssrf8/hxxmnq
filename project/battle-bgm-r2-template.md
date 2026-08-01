# 弹幕 BGM · R2 接入模板

当前界面与播放总线已经落地，但不附带音乐文件。曲目登记位于 `src/battle/battle-bgm-catalog.json`。

后续上传到 Cloudflare R2 后，只需把对应曲目的 `source_url` 从 `null` 改为公开 HTTPS 对象地址或自定义域名地址，例如：

```json
{
  "id": "boss_theme",
  "title": "符卡决战",
  "description": "适合妖花核心与正式 Boss 战的循环曲。",
  "source_url": "https://media.example.com/gensokyo/bgm/boss-theme.ogg"
}
```

约束：

- 只接受公开 `https://` 音源，不在前端保存 R2 Access Key、Secret 或签名凭据。
- 建议使用 `.ogg` 或 `.mp3`，开启浏览器可读取的正确 `Content-Type`。
- R2／自定义域名需允许当前 SillyTavern 页面来源读取音频；跨域失败时界面会保留设置但静默不播放。
- 曲目默认循环；音量和曲目选择只保存在浏览器本机，不写入 MVU。
