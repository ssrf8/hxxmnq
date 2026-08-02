import type { GardenBridge, GardenState, OpeningContext, OpeningDraft } from './types';
import type { AssetPreloader, AssetPreloadSnapshot } from './asset-preloader';

const DRAFT_VERSION = 1;

export function buildOpeningMessage(draft: OpeningDraft): string {
  const appearance = draft.playerAppearance.trim() || '未作特别说明';
  const appearanceSentence = /[。！？.!?]$/u.test(appearance) ? appearance : `${appearance}。`;
  return `玩家「${draft.playerName.trim()}」将以「${draft.playerPronouns.trim()}」作为称呼。外貌：${appearanceSentence}\n\n祖父留下的庭守钥已经苏醒，并将玩家带往移动庭园「${draft.gardenName.trim()}」。确认后只会在当前首个 assistant 楼层写入开局资料，不发送玩家消息，也不会调用 LLM。`;
}

function storageKey(chatId: string) {
  return `gensokyo-garden:opening-draft:v${DRAFT_VERSION}:${encodeURIComponent(chatId || 'unknown')}`;
}

function normalizedDraft(value: Partial<OpeningDraft>): OpeningDraft {
  return {
    playerName: String(value.playerName ?? '').slice(0, 40),
    playerPronouns: String(value.playerPronouns ?? '中性称谓').slice(0, 40),
    playerAppearance: String(value.playerAppearance ?? '').slice(0, 500),
    gardenName: String(value.gardenName ?? '无名庭园').slice(0, 60),
  };
}

export class OpeningController {
  private context?: OpeningContext;
  private busy = false;

  constructor(
    private readonly bridge: GardenBridge,
    private readonly root: HTMLElement,
    private readonly runtimeShell: HTMLElement,
    private readonly loadingRoot: HTMLElement,
    private readonly assetPreloader: AssetPreloader,
    private readonly setStatus: (text: string, error?: boolean) => void,
    private readonly requestRefresh: () => void,
  ) {
    this.form.addEventListener('input', () => { this.saveDraft(); this.renderPreview(); });
    this.form.addEventListener('submit', (event) => { event.preventDefault(); void this.commit(); });
    this.button('gg-opening-quick').addEventListener('click', () => this.applyPersona());
    this.assetPreloader.subscribe((snapshot) => this.renderAssetProgress(snapshot));
  }

  async render(state: GardenState) {
    this.assetPreloader.setEntryContext([
      ...(state.presence_snapshot?.present_character_ids ?? []).map((id) => `character:${id}`),
      ...Object.keys(state.facilities ?? {}).map((id) => `facility:${id}`),
    ]);
    void this.assetPreloader.start();
    const committed = Boolean(state.meta?.opening_committed);
    this.root.hidden = committed;
    if (committed) {
      if (!this.assetPreloader.snapshot.entryReady && !this.assetPreloader.snapshot.entryTimedOut) {
        this.runtimeShell.hidden = true;
        this.loadingRoot.hidden = false;
        const snapshot = await this.assetPreloader.waitForEntryGate();
        this.loadingRoot.hidden = true;
        this.runtimeShell.hidden = false;
        if (snapshot.failed) this.setAssetFallbackStatus(snapshot);
      } else {
        this.loadingRoot.hidden = true;
        this.runtimeShell.hidden = false;
      }
      return;
    }
    this.loadingRoot.hidden = true;
    this.runtimeShell.hidden = true;
    if (!this.context) {
      this.context = await this.bridge.getOpeningContext();
      const saved = this.loadDraft();
      this.writeDraft(saved ?? normalizedDraft({
        playerName: this.context.personaName,
        playerPronouns: '中性称谓',
        playerAppearance: this.context.personaDescription,
        gardenName: '无名庭园',
      }));
    }
    this.renderPreview();
  }

  private get form() { return document.getElementById('gg-opening-form') as HTMLFormElement; }
  private input(id: string) { return document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement; }
  private button(id: string) { return document.getElementById(id) as HTMLButtonElement; }

  private renderAssetProgress(snapshot: AssetPreloadSnapshot) {
    const progress = document.getElementById('gg-asset-loading-progress') as HTMLProgressElement;
    const status = document.getElementById('gg-asset-loading-status') as HTMLElement;
    progress.value = snapshot.entryPercent;
    progress.textContent = `${snapshot.entryPercent}%`;
    status.dataset.assetTotal = String(snapshot.total);
    status.dataset.assetSettled = String(snapshot.settled);
    status.dataset.assetFailedUrls = JSON.stringify(snapshot.failedUrls);
    if (snapshot.entryReady || snapshot.entryTimedOut) {
      status.textContent = snapshot.failed
        ? `入口素材已检查，${snapshot.failed} 项载入失败，将使用内置降级显示。`
        : snapshot.entryTimedOut
          ? '入口等待已到 15 秒，将先进入庭园，其余素材继续后台加载。'
          : `入口素材已加载 ${snapshot.entrySettled}/${snapshot.entryTotal} 项 · 100%`;
      return;
    }
    const retry = snapshot.retrying
      ? ` · 已重试 ${snapshot.retrying} 次（单项最多 ${snapshot.maxAttempts} 次）`
      : '';
    status.textContent = `入口素材已检查 ${snapshot.entrySettled}/${snapshot.entryTotal} 项 · ${snapshot.entryPercent}%${retry}`;
  }

  private setAssetFallbackStatus(snapshot: AssetPreloadSnapshot) {
    this.setStatus(`有 ${snapshot.failed} 项素材在 ${snapshot.maxAttempts} 次尝试后仍未载入，已使用内置降级显示`, true);
  }

  private readDraft(): OpeningDraft {
    return normalizedDraft({
      playerName: this.input('gg-opening-name').value,
      playerPronouns: this.input('gg-opening-pronouns').value,
      playerAppearance: this.input('gg-opening-appearance').value,
      gardenName: this.input('gg-opening-garden').value,
    });
  }

  private writeDraft(draft: OpeningDraft) {
    this.input('gg-opening-name').value = draft.playerName;
    this.input('gg-opening-pronouns').value = draft.playerPronouns;
    this.input('gg-opening-appearance').value = draft.playerAppearance;
    this.input('gg-opening-garden').value = draft.gardenName;
  }

  private loadDraft(): OpeningDraft | undefined {
    if (!this.context) return undefined;
    try {
      const raw = sessionStorage.getItem(storageKey(this.context.chatId));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as { version?: number; draft?: Partial<OpeningDraft> };
      return parsed.version === DRAFT_VERSION ? normalizedDraft(parsed.draft ?? {}) : undefined;
    } catch { return undefined; }
  }

  private saveDraft() {
    if (!this.context) return;
    sessionStorage.setItem(storageKey(this.context.chatId), JSON.stringify({ version: DRAFT_VERSION, draft: this.readDraft() }));
  }

  private renderPreview() {
    document.getElementById('gg-opening-preview')!.textContent = buildOpeningMessage(this.readDraft());
  }

  private applyPersona() {
    if (!this.context) return;
    const draft = this.readDraft();
    draft.playerName = this.context.personaName || draft.playerName;
    draft.playerAppearance = this.context.personaDescription || draft.playerAppearance;
    this.writeDraft(draft);
    this.saveDraft();
    this.renderPreview();
    this.setStatus(this.context.personaName ? '已读取当前 Persona，可继续修改' : '当前没有可读取的 Persona，保留现有草稿');
  }

  private async commit() {
    if (!this.context || this.busy) return;
    const draft = this.readDraft();
    if (!draft.playerName.trim()) return this.setStatus('请先填写玩家姓名', true);
    if (!draft.playerPronouns.trim()) return this.setStatus('请填写称谓或代词', true);
    if (!draft.gardenName.trim()) return this.setStatus('庭园总得有个暂用名吧', true);
    this.busy = true;
    this.button('gg-opening-commit').disabled = true;
    this.form.setAttribute('aria-busy', 'true');
    const frozenChatId = this.context.chatId;
    try {
      this.saveDraft();
      const beforeLoad = this.assetPreloader.snapshot;
      if (!beforeLoad.entryReady && !beforeLoad.entryTimedOut) {
        this.loadingRoot.hidden = false;
        const snapshot = await this.assetPreloader.waitForEntryGate();
        this.loadingRoot.hidden = true;
        if (snapshot.failed) this.setAssetFallbackStatus(snapshot);
      }
      const result = await this.bridge.initializeOpening(draft, frozenChatId);
      sessionStorage.removeItem(storageKey(frozenChatId));
      const loadWarning = this.assetPreloader.snapshot.failed
        ? `；${this.assetPreloader.snapshot.failed} 项素材已降级显示`
        : '';
      this.setStatus((result.alreadyCommitted
        ? '开局资料已经存在，移动庭园的结界正在重新开启'
        : '庭守钥已经苏醒，移动庭园的结界正在开启') + loadWarning,
      this.assetPreloader.snapshot.failed > 0);
      this.requestRefresh();
    } catch (error) {
      this.loadingRoot.hidden = true;
      this.setStatus(`进入庭园失败：${error instanceof Error ? error.message : String(error)}。草稿仍在，可以安全重试。`, true);
    } finally {
      this.busy = false;
      this.button('gg-opening-commit').disabled = false;
      this.form.setAttribute('aria-busy', 'false');
    }
  }

}
