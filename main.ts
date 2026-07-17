import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl } from 'obsidian';

// ====== 写死在代码里的配置（用户看不到）======
const RELAY_URL = 'http://120.79.132.94:8765';
const MAX_DURATION_SECONDS = 5 * 60;

interface RecorderTranscriberSettings {
    licenseKey: string;
    outputFolder: string;
    enableLocalASR: boolean;  // 是否启用本地实时语音识别
}

const DEFAULT_SETTINGS: RecorderTranscriberSettings = {
    licenseKey: '',
    outputFolder: '转录笔记',
    enableLocalASR: false,
};

export default class RecorderTranscriberPlugin extends Plugin {
    settings: RecorderTranscriberSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        // 🎤 原有功能：选择文件 → 云端转写
        this.addRibbonIcon('microphone', '导入录音文件（云端转写）', () => {
            this.selectAndTranscribe();
        });

        this.addCommand({
            id: 'select-and-transcribe',
            name: '导入录音文件（云端转写）',
            callback: () => this.selectAndTranscribe(),
        });

        // 🎙️ 新功能：实时语音 → 本地免费转写
        if (this.settings.enableLocalASR) {
            this.registerLocalASR();
        }

        this.addSettingTab(new RecorderTranscriberSettingTab(this.app, this));
    }

    registerLocalASR() {
        // 添加功能区图标
        this.addRibbonIcon('mic', '实时语音转写（本地免费）', () => {
            this.startLocalDictation();
        });

        // 添加命令
        this.addCommand({
            id: 'local-speech-to-text',
            name: '实时语音转写（本地免费）',
            callback: () => this.startLocalDictation(),
        });
    }

    // ====== 云端转写（原有方式）======

    async selectAndTranscribe() {
        if (!this.settings.licenseKey) {
            new Notice('⚠️ 请先在设置中填写有效的密钥');
            // @ts-ignore
            this.app.setting.open();
            this.app.setting.openTabById(this.manifest.id);
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*,.wav,.mp3,.m4a,.webm,.mp4,.aac,.flac,.ogg';

        input.onchange = async (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const duration = await this.getAudioDuration(file);
                if (duration > MAX_DURATION_SECONDS) {
                    new Notice(`⚠️ 音频过长（${Math.round(duration / 60)}分钟），暂不支持超过 5 分钟`);
                    return;
                }
            } catch (_) {}

            new Notice('📤 正在发送到服务器转写…');

            try {
                const text = await this.transcribeAudio(file);
                await this.appendToDailyNote(text, file.name);
                new Notice('✅ 转写完成！已添加到今日笔记');
            } catch (error) {
                console.error('转写失败:', error);
                new Notice('❌ ' + (error as Error).message);
            }
        };

        input.click();
    }

    async getAudioDuration(file: File): Promise<number> {
        if (file.name.toLowerCase().endsWith('.wav')) {
            const buffer = await file.slice(0, 100).arrayBuffer();
            const view = new DataView(buffer);
            const byteRate = view.getUint32(28, true);
            const dataSize = view.getUint32(40, true);
            if (byteRate > 0) return dataSize / byteRate;
        }

        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer.duration;
    }

    async transcribeAudio(file: File): Promise<string> {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        const relayUrl = RELAY_URL.replace(/\/+$/, '');
        const response = await requestUrl({
            url: `${relayUrl}/transcribe`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio_data: base64Data,
                filename: file.name,
                api_key: this.settings.licenseKey,
            }),
        });

        const result = response.json;

        if (result.success && result.text) {
            return result.text;
        } else if (result.error) {
            throw new Error(result.error);
        } else {
            throw new Error('转写失败: ' + JSON.stringify(result));
        }
    }

    // ====== 本地实时语音转写（Web Speech API）======

    async startLocalDictation() {
        if (!this.settings.licenseKey) {
            new Notice('⚠️ 请先在设置中填写有效的密钥');
            // @ts-ignore
            this.app.setting.open();
            this.app.setting.openTabById(this.manifest.id);
            return;
        }

        const SpeechRecognition = (window as any).SpeechRecognition
                               || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            new Notice('❌ 当前设备不支持本地语音识别');
            return;
        }

        new Notice('🎙️ 请说话，说完后等待自动识别…');

        return new Promise<void>((resolve) => {
            const recognition = new SpeechRecognition();
            recognition.lang = 'zh-CN';
            recognition.interimResults = false;
            recognition.continuous = false;
            recognition.maxAlternatives = 1;

            let recognizedText = '';

            recognition.onresult = (event: any) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        recognizedText += event.results[i][0].transcript;
                    }
                }
            };

            recognition.onerror = (event: any) => {
                console.error('本地语音识别错误:', event.error);
                if (event.error === 'not-allowed') {
                    new Notice('❌ 请允许使用麦克风权限');
                } else if (event.error === 'no-speech') {
                    new Notice('❌ 未检测到语音，请重试');
                } else {
                    new Notice('❌ 语音识别失败: ' + event.error);
                }
                resolve();
            };

            recognition.onend = async () => {
                if (recognizedText.trim()) {
                    new Notice('✅ 识别完成，正在保存…');
                    await this.appendToDailyNote(recognizedText.trim(), '实时语音转录');
                    new Notice('✅ 已添加到今日笔记');
                } else {
                    new Notice('⚠️ 未识别到有效文字');
                }
                resolve();
            };

            recognition.start();
        });
    }

    // ====== 保存到每日笔记 ======

    async appendToDailyNote(text: string, fileName: string) {
        const folderPath = this.settings.outputFolder;
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!folder) {
            await this.app.vault.createFolder(folderPath);
        }

        const now = new Date();
        const dateStr =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const timeStr =
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const noteName = `${folderPath}/${dateStr}.md`;
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        const newSection = ['', `## ${timeStr} — ${baseName}`, '', text, ''].join('\n');

        const existingFile = this.app.vault.getAbstractFileByPath(noteName);
        if (existingFile instanceof TFile) {
            const existingContent = await this.app.vault.read(existingFile);
            const trimmed = existingContent.replace(/\s+$/, '');
            await this.app.vault.modify(existingFile, trimmed + newSection);
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(existingFile);
        } else {
            const content = ['---', `title: "${dateStr} 录音转写"`, `date: ${dateStr}`, '---', '', newSection.trim(), ''].join('\n');
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
}

class RecorderTranscriberSettingTab extends PluginSettingTab {
    plugin: RecorderTranscriberPlugin;

    constructor(app: App, plugin: RecorderTranscriberPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Obsidian录音转文字 - 设置' });

        new Setting(containerEl)
            .setName('🔑 密钥')
            .setDesc('请输入你的使用密钥（云端转写需要）')
            .addText((text) =>
                text
                    .setPlaceholder('AQI-XXXXXXXXXXXXXXXX')
                    .setValue(this.plugin.settings.licenseKey)
                    .onChange(async (v) => { this.plugin.settings.licenseKey = v; await this.plugin.saveSettings(); })
            );

        new Setting(containerEl)
            .setName('输出文件夹')
            .setDesc('转写笔记保存到 Obsidian 的哪个文件夹')
            .addText((text) =>
                text
                    .setPlaceholder('转录笔记')
                    .setValue(this.plugin.settings.outputFolder)
                    .onChange(async (v) => { this.plugin.settings.outputFolder = v; await this.plugin.saveSettings(); })
            );

        new Setting(containerEl)
            .setName('🎙️ 本地实时语音识别')
            .setDesc('启用后，功能区会出现「实时语音转写」按钮，使用手机自带语音识别（免费）')
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.enableLocalASR)
                    .onChange(async (v) => {
                        this.plugin.settings.enableLocalASR = v;
                        await this.plugin.saveSettings();
                        new Notice('⚠️ 请重启 Obsidian 使设置生效');
                    })
            );

        containerEl.createEl('h3', { text: '使用说明' });
        const el = containerEl.createDiv();
        el.innerHTML = `
            <div style="font-size: 13px; color: var(--text-muted);">
                <p><strong>🎤 导入录音文件（云端转写）</strong></p>
                <ol style="margin-left: 20px;">
                    <li>选择手机录制的 .wav/.mp3/.m4a 文件</li>
                    <li>通过服务器调用阿里云转写（需密钥）</li>
                    <li>⚠️ 单次音频不超过 5 分钟</li>
                    <li>等待 10-60 秒后文字追加到今日笔记</li>
                </ol>
                <p style="margin-top:12px"><strong>🎙️ 实时语音转写（本地免费）</strong></p>
                <ol style="margin-left: 20px;">
                    <li>先在设置中开启「本地实时语音识别」并重启 Obsidian</li>
                    <li>点 🎙️ 按钮，对着手机说话</li>
                    <li>说完后自动识别并保存到今日笔记</li>
                    <li>完全免费，无需联网（部分手机需要网络）</li>
                </ol>
            </div>
        `;
    }
}
