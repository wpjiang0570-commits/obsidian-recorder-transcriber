"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => RecorderTranscriberPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var RELAY_URL = "http://120.79.132.94:8765";
var MAX_DURATION_SECONDS = 5 * 60;
var DEFAULT_SETTINGS = {
  licenseKey: "",
  outputFolder: "\u8F6C\u5F55\u7B14\u8BB0",
  enableLocalASR: false
};
var RecorderTranscriberPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("microphone", "\u5BFC\u5165\u5F55\u97F3\u6587\u4EF6\uFF08\u4E91\u7AEF\u8F6C\u5199\uFF09", () => {
      this.selectAndTranscribe();
    });
    this.addCommand({
      id: "select-and-transcribe",
      name: "\u5BFC\u5165\u5F55\u97F3\u6587\u4EF6\uFF08\u4E91\u7AEF\u8F6C\u5199\uFF09",
      callback: () => this.selectAndTranscribe()
    });
    if (this.settings.enableLocalASR) {
      this.registerLocalASR();
    }
    this.addSettingTab(new RecorderTranscriberSettingTab(this.app, this));
  }
  registerLocalASR() {
    this.addRibbonIcon("mic", "\u5B9E\u65F6\u8BED\u97F3\u8F6C\u5199\uFF08\u672C\u5730\u514D\u8D39\uFF09", () => {
      this.startLocalDictation();
    });
    this.addCommand({
      id: "local-speech-to-text",
      name: "\u5B9E\u65F6\u8BED\u97F3\u8F6C\u5199\uFF08\u672C\u5730\u514D\u8D39\uFF09",
      callback: () => this.startLocalDictation()
    });
  }
  // ====== 云端转写（原有方式）======
  async selectAndTranscribe() {
    if (!this.settings.licenseKey) {
      new import_obsidian.Notice("\u26A0\uFE0F \u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u6709\u6548\u7684\u5BC6\u94A5");
      this.app.setting.open();
      this.app.setting.openTabById(this.manifest.id);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.wav,.mp3,.m4a,.webm,.mp4,.aac,.flac,.ogg";
    input.onchange = async (event) => {
      var _a;
      const file = (_a = event.target.files) == null ? void 0 : _a[0];
      if (!file)
        return;
      try {
        const duration = await this.getAudioDuration(file);
        if (duration > MAX_DURATION_SECONDS) {
          new import_obsidian.Notice(`\u26A0\uFE0F \u97F3\u9891\u8FC7\u957F\uFF08${Math.round(duration / 60)}\u5206\u949F\uFF09\uFF0C\u6682\u4E0D\u652F\u6301\u8D85\u8FC7 5 \u5206\u949F`);
          return;
        }
      } catch (_) {
      }
      new import_obsidian.Notice("\u{1F4E4} \u6B63\u5728\u53D1\u9001\u5230\u670D\u52A1\u5668\u8F6C\u5199\u2026");
      try {
        const text = await this.transcribeAudio(file);
        await this.appendToDailyNote(text, file.name);
        new import_obsidian.Notice("\u2705 \u8F6C\u5199\u5B8C\u6210\uFF01\u5DF2\u6DFB\u52A0\u5230\u4ECA\u65E5\u7B14\u8BB0");
      } catch (error) {
        console.error("\u8F6C\u5199\u5931\u8D25:", error);
        new import_obsidian.Notice("\u274C " + error.message);
      }
    };
    input.click();
  }
  async getAudioDuration(file) {
    if (file.name.toLowerCase().endsWith(".wav")) {
      const buffer = await file.slice(0, 100).arrayBuffer();
      const view = new DataView(buffer);
      const byteRate = view.getUint32(28, true);
      const dataSize = view.getUint32(40, true);
      if (byteRate > 0)
        return dataSize / byteRate;
    }
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.duration;
  }
  async transcribeAudio(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64Data = btoa(binary);
    const relayUrl = RELAY_URL.replace(/\/+$/, "");
    const response = await (0, import_obsidian.requestUrl)({
      url: `${relayUrl}/transcribe`,
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audio_data: base64Data,
        filename: file.name,
        api_key: this.settings.licenseKey
      })
    });
    const result = response.json;
    if (result.success && result.text) {
      return result.text;
    } else if (result.error) {
      throw new Error(result.error);
    } else {
      throw new Error("\u8F6C\u5199\u5931\u8D25: " + JSON.stringify(result));
    }
  }
  // ====== 本地实时语音转写（Web Speech API）======
  async startLocalDictation() {
    if (!this.settings.licenseKey) {
      new import_obsidian.Notice("\u26A0\uFE0F \u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199\u6709\u6548\u7684\u5BC6\u94A5");
      this.app.setting.open();
      this.app.setting.openTabById(this.manifest.id);
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      new import_obsidian.Notice("\u274C \u5F53\u524D\u8BBE\u5907\u4E0D\u652F\u6301\u672C\u5730\u8BED\u97F3\u8BC6\u522B");
      return;
    }
    new import_obsidian.Notice("\u{1F399}\uFE0F \u8BF7\u8BF4\u8BDD\uFF0C\u8BF4\u5B8C\u540E\u7B49\u5F85\u81EA\u52A8\u8BC6\u522B\u2026");
    return new Promise((resolve) => {
      const recognition = new SpeechRecognition();
      recognition.lang = "zh-CN";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      let recognizedText = "";
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            recognizedText += event.results[i][0].transcript;
          }
        }
      };
      recognition.onerror = (event) => {
        console.error("\u672C\u5730\u8BED\u97F3\u8BC6\u522B\u9519\u8BEF:", event.error);
        if (event.error === "not-allowed") {
          new import_obsidian.Notice("\u274C \u8BF7\u5141\u8BB8\u4F7F\u7528\u9EA6\u514B\u98CE\u6743\u9650");
        } else if (event.error === "no-speech") {
          new import_obsidian.Notice("\u274C \u672A\u68C0\u6D4B\u5230\u8BED\u97F3\uFF0C\u8BF7\u91CD\u8BD5");
        } else {
          new import_obsidian.Notice("\u274C \u8BED\u97F3\u8BC6\u522B\u5931\u8D25: " + event.error);
        }
        resolve();
      };
      recognition.onend = async () => {
        if (recognizedText.trim()) {
          new import_obsidian.Notice("\u2705 \u8BC6\u522B\u5B8C\u6210\uFF0C\u6B63\u5728\u4FDD\u5B58\u2026");
          await this.appendToDailyNote(recognizedText.trim(), "\u5B9E\u65F6\u8BED\u97F3\u8F6C\u5F55");
          new import_obsidian.Notice("\u2705 \u5DF2\u6DFB\u52A0\u5230\u4ECA\u65E5\u7B14\u8BB0");
        } else {
          new import_obsidian.Notice("\u26A0\uFE0F \u672A\u8BC6\u522B\u5230\u6709\u6548\u6587\u5B57");
        }
        resolve();
      };
      recognition.start();
    });
  }
  // ====== 保存到每日笔记 ======
  async appendToDailyNote(text, fileName) {
    const folderPath = this.settings.outputFolder;
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
    const now = /* @__PURE__ */ new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const noteName = `${folderPath}/${dateStr}.md`;
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const newSection = ["", `## ${timeStr} \u2014 ${baseName}`, "", text, ""].join("\n");
    const existingFile = this.app.vault.getAbstractFileByPath(noteName);
    if (existingFile instanceof import_obsidian.TFile) {
      const existingContent = await this.app.vault.read(existingFile);
      const trimmed = existingContent.replace(/\s+$/, "");
      await this.app.vault.modify(existingFile, trimmed + newSection);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(existingFile);
    } else {
      const content = ["---", `title: "${dateStr} \u5F55\u97F3\u8F6C\u5199"`, `date: ${dateStr}`, "---", "", newSection.trim(), ""].join("\n");
      const noteFile = await this.app.vault.create(noteName, content);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(noteFile);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var RecorderTranscriberSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Obsidian\u5F55\u97F3\u8F6C\u6587\u5B57 - \u8BBE\u7F6E" });
    new import_obsidian.Setting(containerEl).setName("\u{1F511} \u5BC6\u94A5").setDesc("\u8BF7\u8F93\u5165\u4F60\u7684\u4F7F\u7528\u5BC6\u94A5\uFF08\u4E91\u7AEF\u8F6C\u5199\u9700\u8981\uFF09").addText(
      (text) => text.setPlaceholder("AQI-XXXXXXXXXXXXXXXX").setValue(this.plugin.settings.licenseKey).onChange(async (v) => {
        this.plugin.settings.licenseKey = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u8F93\u51FA\u6587\u4EF6\u5939").setDesc("\u8F6C\u5199\u7B14\u8BB0\u4FDD\u5B58\u5230 Obsidian \u7684\u54EA\u4E2A\u6587\u4EF6\u5939").addText(
      (text) => text.setPlaceholder("\u8F6C\u5F55\u7B14\u8BB0").setValue(this.plugin.settings.outputFolder).onChange(async (v) => {
        this.plugin.settings.outputFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u{1F399}\uFE0F \u672C\u5730\u5B9E\u65F6\u8BED\u97F3\u8BC6\u522B").setDesc("\u542F\u7528\u540E\uFF0C\u529F\u80FD\u533A\u4F1A\u51FA\u73B0\u300C\u5B9E\u65F6\u8BED\u97F3\u8F6C\u5199\u300D\u6309\u94AE\uFF0C\u4F7F\u7528\u624B\u673A\u81EA\u5E26\u8BED\u97F3\u8BC6\u522B\uFF08\u514D\u8D39\uFF09").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableLocalASR).onChange(async (v) => {
        this.plugin.settings.enableLocalASR = v;
        await this.plugin.saveSettings();
        new import_obsidian.Notice("\u26A0\uFE0F \u8BF7\u91CD\u542F Obsidian \u4F7F\u8BBE\u7F6E\u751F\u6548");
      })
    );
    containerEl.createEl("h3", { text: "\u4F7F\u7528\u8BF4\u660E" });
    const el = containerEl.createDiv();
    el.innerHTML = `
            <div style="font-size: 13px; color: var(--text-muted);">
                <p><strong>\u{1F3A4} \u5BFC\u5165\u5F55\u97F3\u6587\u4EF6\uFF08\u4E91\u7AEF\u8F6C\u5199\uFF09</strong></p>
                <ol style="margin-left: 20px;">
                    <li>\u9009\u62E9\u624B\u673A\u5F55\u5236\u7684 .wav/.mp3/.m4a \u6587\u4EF6</li>
                    <li>\u901A\u8FC7\u670D\u52A1\u5668\u8C03\u7528\u963F\u91CC\u4E91\u8F6C\u5199\uFF08\u9700\u5BC6\u94A5\uFF09</li>
                    <li>\u26A0\uFE0F \u5355\u6B21\u97F3\u9891\u4E0D\u8D85\u8FC7 5 \u5206\u949F</li>
                    <li>\u7B49\u5F85 10-60 \u79D2\u540E\u6587\u5B57\u8FFD\u52A0\u5230\u4ECA\u65E5\u7B14\u8BB0</li>
                </ol>
                <p style="margin-top:12px"><strong>\u{1F399}\uFE0F \u5B9E\u65F6\u8BED\u97F3\u8F6C\u5199\uFF08\u672C\u5730\u514D\u8D39\uFF09</strong></p>
                <ol style="margin-left: 20px;">
                    <li>\u5148\u5728\u8BBE\u7F6E\u4E2D\u5F00\u542F\u300C\u672C\u5730\u5B9E\u65F6\u8BED\u97F3\u8BC6\u522B\u300D\u5E76\u91CD\u542F Obsidian</li>
                    <li>\u70B9 \u{1F399}\uFE0F \u6309\u94AE\uFF0C\u5BF9\u7740\u624B\u673A\u8BF4\u8BDD</li>
                    <li>\u8BF4\u5B8C\u540E\u81EA\u52A8\u8BC6\u522B\u5E76\u4FDD\u5B58\u5230\u4ECA\u65E5\u7B14\u8BB0</li>
                    <li>\u5B8C\u5168\u514D\u8D39\uFF0C\u65E0\u9700\u8054\u7F51\uFF08\u90E8\u5206\u624B\u673A\u9700\u8981\u7F51\u7EDC\uFF09</li>
                </ol>
            </div>
        `;
  }
};
