import type { CharacterDefinition, UltimateBatch } from "./types";
import { getCharacter } from "./characters";
import { CINEMATIC_DURATION_MS } from "./engine/combat";

const ENTER_DURATION_MS = 160;
const LEAVE_DURATION_MS = 140;

interface CinematicView {
  id: number;
  banner: HTMLDivElement;
  image: HTMLImageElement;
}

/** 只呈现已保存的逻辑时间，不通过 Promise 或动画回调结算伤害。 */
export class UltimateCinematic {
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly pendingImages = new Map<string, Promise<HTMLImageElement | null>>();
  private view: CinematicView | null = null;

  constructor(private readonly layer: HTMLDivElement) {}

  private decodeImage(url: string): Promise<HTMLImageElement | null> {
    // 同角色跨棋盘再次释放时直接复用已解码图片。
    const cached = this.images.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = this.pendingImages.get(url);
    if (pending) return pending;
    const image = new Image();
    image.decoding = "async";
    const decoded = new Promise<HTMLImageElement | null>((resolve) => {
      let settled = false;
      const finish = (available: boolean): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        if (available) this.images.set(url, image);
        else this.images.delete(url);
        resolve(available ? image : null);
      };
      // 后台预载也有上限；失败记录不缓存，触发时仍可重试。
      const timeout = window.setTimeout(() => finish(false), 5_000);
      image.onerror = () => finish(false);
      if (typeof image.decode !== "function") image.onload = () => finish(image.naturalWidth > 0);
      if (!image.src) image.src = url;
      if (typeof image.decode === "function") {
        void image.decode().then(() => finish(image.naturalWidth > 0), () => finish(false));
      } else if (image.complete) {
        finish(image.naturalWidth > 0);
      }
    }).catch(() => null);
    this.pendingImages.set(url, decoded);
    void decoded.then(() => this.pendingImages.delete(url));
    return decoded;
  }

  async preload(characters: readonly CharacterDefinition[]): Promise<void> {
    // 小批量解码，避免 17 张大图同时争用游戏开始时的主线程。
    for (let index = 0; index < characters.length; index += 2) {
      await Promise.all(characters.slice(index, index + 2).map((character) => this.decodeImage(character.ultimate.imageUrl)));
    }
  }

  ready(character: CharacterDefinition): boolean {
    return this.images.has(character.ultimate.imageUrl);
  }

  async prepare(character: CharacterDefinition): Promise<boolean> {
    return Boolean(await this.decodeImage(character.ultimate.imageUrl));
  }

  render(batch: UltimateBatch | null): void {
    if (!batch || batch.phase !== "playing") { this.cancel(); return; }
    const cast = batch.casts[batch.index];
    const character = getCharacter(cast.characterId);
    if (this.view?.id !== cast.id) {
      this.cancel();
      const banner = document.createElement("div");
      banner.className = "ultimate-banner";
      const image = new Image();
      image.className = "ultimate-image";
      image.alt = "";
      image.draggable = false;
      const cached = this.images.get(character.ultimate.imageUrl);
      image.src = cached?.src ?? character.imageUrl;
      banner.classList.toggle("has-fallback", !cached);
      image.onerror = () => { image.hidden = true; };
      const copy = document.createElement("div");
      copy.className = "ultimate-copy";
      const name = document.createElement("span");
      name.textContent = character.name;
      const title = document.createElement("strong");
      title.textContent = character.ultimate.name;
      copy.append(name, title);
      banner.append(image, copy);
      const strip = document.createElement("div");
      strip.className = "ultimate-strip";
      strip.append(banner);
      this.layer.replaceChildren(strip);
      this.layer.dataset.direction = character.ultimate.direction;
      this.view = { id: cast.id, banner, image };
    }
    const duration = batch.reducedMotion ? 300 : CINEMATIC_DURATION_MS;
    const elapsed = duration - batch.remainingMs;
    this.layer.hidden = false;
    this.layer.classList.toggle("is-reduced-motion", batch.reducedMotion);
    const { banner, image } = this.view;
    if (batch.reducedMotion) {
      banner.style.transform = "none";
      image.style.transform = "none";
      return;
    }
    const leaveStart = duration - LEAVE_DURATION_MS;
    const enter = Math.min(1, elapsed / ENTER_DURATION_MS);
    const leave = Math.max(0, (elapsed - leaveStart) / LEAVE_DURATION_MS);
    const offset = -110 * (1 - enter) ** 3 + 110 * leave ** 3;
    banner.style.transform = `translateX(${offset * (character.ultimate.direction === "up" ? 1 : -1)}%)`;
    image.style.transform = `scale(${1.01 + 0.045 * Math.min(1, elapsed / leaveStart)})`;
  }

  cancel(): void {
    if (!this.view && this.layer.hidden) return;
    this.view = null;
    this.layer.hidden = true;
    this.layer.replaceChildren();
    this.layer.classList.remove("is-reduced-motion");
    delete this.layer.dataset.direction;
  }
}
