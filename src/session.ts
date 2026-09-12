import { GAME_STORAGE_KEY } from "./save";

const LEASE_MS = 125_000;
interface Lease { owner: string; expiresAt: number }

/** 一个地址只有一个写档者；IDB 的读写事务使兼容路径的租约获取保持原子性。 */
export class SessionGuard {
  private readonly owner = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  private releaseLock: (() => void) | null = null;
  private database: IDBDatabase | null = null;
  private usingLease = false;
  private held = false;
  private expiresAt = 0;
  private epoch = 0;
  private renewal: Promise<boolean> | null = null;

  constructor(private readonly lost: () => void, private readonly report: (message: string) => void) {}

  get owned(): boolean {
    return this.held && (!this.usingLease || Date.now() < this.expiresAt);
  }

  async acquire(): Promise<boolean> {
    if (this.owned) return true;
    const epoch = ++this.epoch;
    if (navigator.locks) {
      this.usingLease = false;
      return new Promise((resolve) => {
        void navigator.locks.request(GAME_STORAGE_KEY, { mode: "exclusive", ifAvailable: true }, async (lock) => {
          if (!lock || epoch !== this.epoch) { resolve(false); return; }
          this.held = true;
          await new Promise<void>((release) => {
            this.releaseLock = release;
            resolve(true);
          });
        }).catch(() => { this.report("无法获取游戏运行权限，请关闭其他游戏页面后重试。"); resolve(false); });
      });
    }
    this.usingLease = true;
    try {
      await this.openDatabase();
      const acquired = await this.changeLease(true);
      if (epoch !== this.epoch) { if (acquired) void this.dropLease(); return false; }
      this.held = acquired;
      return acquired;
    } catch {
      this.report("浏览器无法协调本地存档，请允许本地存储后重试。");
      return false;
    }
  }

  async renew(): Promise<boolean> {
    if (!this.usingLease) return this.owned;
    if (!this.held) return false;
    if (this.renewal) return this.renewal;
    const epoch = this.epoch;
    this.renewal = this.changeLease(false).catch(() => false).then((renewed) => {
      if (epoch !== this.epoch) return false;
      if (!renewed) { this.held = false; this.lost(); }
      return renewed;
    }).finally(() => { this.renewal = null; });
    return this.renewal;
  }

  release(): void {
    this.epoch += 1;
    this.held = false;
    this.releaseLock?.();
    this.releaseLock = null;
    if (this.usingLease) void this.dropLease();
  }

  private openDatabase(): Promise<void> {
    if (this.database) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("yellow-match-sessions", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("leases");
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("本地运行权限数据库被占用"));
      request.onsuccess = () => {
        this.database = request.result;
        this.database.onversionchange = () => { this.database?.close(); this.database = null; this.held = false; this.lost(); };
        resolve();
      };
    });
  }

  private changeLease(acquire: boolean): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const transaction = this.database!.transaction("leases", "readwrite");
      const store = transaction.objectStore("leases");
      const request = store.get(GAME_STORAGE_KEY);
      let granted = false;
      let expiry = 0;
      request.onsuccess = () => {
        const lease = request.result as Lease | undefined;
        const now = Date.now();
        if (lease?.owner === this.owner || (acquire && (!lease || lease.expiresAt <= now))) {
          expiry = now + LEASE_MS;
          store.put({ owner: this.owner, expiresAt: expiry } satisfies Lease, GAME_STORAGE_KEY);
          granted = true;
        }
      };
      transaction.oncomplete = () => { if (granted) this.expiresAt = expiry; resolve(granted); };
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  private async dropLease(): Promise<void> {
    if (!this.database) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.database!.transaction("leases", "readwrite");
        const store = transaction.objectStore("leases");
        const request = store.get(GAME_STORAGE_KEY);
        request.onsuccess = () => { if ((request.result as Lease | undefined)?.owner === this.owner) store.delete(GAME_STORAGE_KEY); };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch { /* 关闭途中事务可能取消，租约仍会在期限后失效。 */ }
  }
}
