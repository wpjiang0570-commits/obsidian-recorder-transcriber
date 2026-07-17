# 🎤 Obsidian录音转文字

> 将音频文件导入 Obsidian，自动转写为文字笔记。支持云端转写和本地实时语音识别两种方式。

## 功能

| 功能 | 说明 | 费用 |
|------|------|:----:|
| 🎤 **导入录音文件转写** | 选择手机录制的音频文件，上传服务器转写为文字 | 按量付费 |
| 🎙️ **实时语音转写** | 对着手机说话，实时识别为文字，自动保存到笔记 | **免费** |

两种方式转写的结果都会自动追加到当日的 Markdown 笔记中，同一天的录音自动汇总到同一篇笔记。

## 安装

通过 Obsidian BRAT 插件安装：

1. 安装 [BRAT](obsidian://show-plugin?id=obsidian42-brat) 插件
2. 在 BRAT 设置中添加仓库地址：
   ```
   https://github.com/wpjiang0570-commits/obsidian-recorder-transcriber
   ```
3. 选择版本 `1.2.0`，点击安装
4. 在插件设置中填写密钥

## 使用

### 云端转写（需密钥）

1. 点击功能区 🎤 图标
2. 选择音频文件（支持 .wav/.mp3/.m4a 等格式）
3. 等待 10-60 秒，转写结果自动保存到今日笔记

### 本地实时语音转写（免费）

1. 在插件设置中开启「本地实时语音识别」→ 重启 Obsidian
2. 点击功能区 🎙️ 图标
3. 允许麦克风权限，对着手机说话
4. 说完后自动识别并保存到今日笔记

> ⚠️ 本地转写使用手机系统自带的语音识别能力，无需联网（部分手机可能需要网络连接）

## 技术架构

```
Obsidian → 插件 (base64编码) → ECS 中继服务器 → 阿里云 OSS → DashScope Paraformer
                                                      ↕
                                           返回文字 ← 轮询结果
```

- **插件**: TypeScript + esbuild 编译
- **服务器**: Python Flask + Gunicorn + systemd
- **存储**: 阿里云 OSS（音频临时存储，1天自动清理）
- **转写**: 阿里云百炼 Paraformer-v2

## 开发

```bash
# 安装依赖
npm install

# 编译插件
npx esbuild main.ts --bundle --external:obsidian --external:electron \
  --format=cjs --target=es2018 --outfile=main.js
```

## 许可

MIT
