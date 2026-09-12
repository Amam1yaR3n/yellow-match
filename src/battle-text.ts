import { fitText } from "./numbers";

interface FloatingText {
  root: HTMLSpanElement;
  text: HTMLSpanElement;
  prefix: string;
  value: bigint | null;
  x: number;
  y: number;
  drift: number;
  rise: number;
}

/** 统一文字层不继承角色的缩放和旋转；外层定位与内层动画互不覆盖。 */
export class BattleText {
  private readonly items = new Set<FloatingText>();
  private readonly observer: ResizeObserver;

  constructor(private readonly layer: HTMLElement, private readonly reducedMotion: MediaQueryList) {
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(layer);
    void document.fonts.ready.then(() => this.layout());
    reducedMotion.addEventListener("change", () => this.layout());
  }

  show(prefix: string, value: bigint | null, className: string, x: number, y: number): void {
    const root = document.createElement("span");
    root.className = "battle-text-anchor";
    const text = document.createElement("span");
    text.className = `battle-text ${className}`;
    root.append(text);
    this.layer.append(root);
    const rect = this.layer.getBoundingClientRect();
    const item: FloatingText = { root, text, prefix, value, x: x / Math.max(1, rect.width), y: y / Math.max(1, rect.height), drift: (Math.random() - 0.5) * 34, rise: className.includes("upgrade") ? 23 : 35 };
    this.items.add(item);
    const remove = (): void => { this.items.delete(item); root.remove(); };
    text.addEventListener("animationend", remove, { once: true });
    text.addEventListener("animationcancel", remove, { once: true });
    this.layoutItem(item);
  }

  private layoutItem(item: FloatingText): void {
    const width = this.layer.clientWidth;
    const height = this.layer.clientHeight;
    if (width <= 0 || height <= 0) return;
    // 内缩为描边、阴影、战场轻震预留空间；数值从不借助 overflow 裁切。
    const inset = Math.min(14, width / 10, height / 10);
    const maxWidth = Math.max(1, width - inset * 2);
    const maxHeight = Math.max(1, height - inset * 2);
    fitText(item.text, item.prefix, item.value, maxWidth / 1.08, { minimumFontSize: 12, allowLines: true });
    const naturalHeight = item.text.offsetHeight;
    if (naturalHeight * 1.08 > maxHeight) {
      item.text.style.fontSize = `${parseFloat(item.text.style.fontSize) * maxHeight / (naturalHeight * 1.08)}px`;
    }
    const halfWidth = Math.min(maxWidth / 2, item.text.offsetWidth * 0.54);
    const halfHeight = Math.min(maxHeight / 2, item.text.offsetHeight * 0.54);
    const lowX = inset + halfWidth;
    const highX = width - inset - halfWidth;
    const lowY = inset + halfHeight;
    const highY = height - inset - halfHeight;
    const x = Math.max(lowX, Math.min(highX, item.x * width));
    const y = Math.max(lowY, Math.min(highY, item.y * height));
    const drift = this.reducedMotion.matches ? 0 : Math.max(lowX - x, Math.min(highX - x, item.drift));
    const rise = this.reducedMotion.matches ? 0 : Math.min(item.rise, y - lowY);
    item.root.style.left = `${x}px`;
    item.root.style.top = `${y}px`;
    item.text.style.setProperty("--text-drift", `${drift}px`);
    item.text.style.setProperty("--text-rise", `${-rise}px`);
  }

  layout(): void { for (const item of this.items) this.layoutItem(item); }
  clear(): void { this.items.clear(); this.layer.replaceChildren(); }
}
