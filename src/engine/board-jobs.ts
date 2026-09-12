import { generateBoard, shuffleRemaining, type GeneratedBoard } from "./board";
import type { BoardConfig, BoardMatrix } from "../types";

type BoardJob = { kind: "generate"; config: BoardConfig } | { kind: "shuffle"; board: BoardMatrix };
type BoardResult = GeneratedBoard | BoardMatrix;
export type BoardRequest = BoardJob & { id: number };
export type BoardResponse = { id: number; result: BoardResult } | { id: number; error: string };

/** 棋盘搜索在独立线程执行，避免生成和死局洗牌阻塞输入与战斗帧。 */
export class BoardJobs {
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, {
    resolve: (result: BoardResult) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    try {
      // 保持独立文件与相对 URL，不使用内联或 blob worker。
      this.worker = new Worker(new URL("./board.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<BoardResponse>) => {
        const response = event.data;
        const pending = this.pending.get(response.id);
        if (!pending) return;
        this.pending.delete(response.id);
        if ("error" in response) pending.reject(new Error(response.error));
        else pending.resolve(response.result);
      };
      this.worker.onerror = () => this.disableWorker();
      this.worker.onmessageerror = () => this.disableWorker();
    } catch {
      this.disableWorker();
    }
  }

  private disableWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const pending of this.pending.values()) pending.reject(new Error("棋盘计算线程不可用"));
    this.pending.clear();
  }

  private request(job: BoardJob): Promise<BoardResult> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("棋盘计算线程不可用"));
        return;
      }
      const id = ++this.nextId;
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ ...job, id } satisfies BoardRequest);
      } catch {
        this.disableWorker();
      }
    });
  }

  private async run(job: BoardJob): Promise<BoardResult> {
    try {
      return await this.request(job);
    } catch {
      // 受限宿主仍可开局；仅在需要棋盘时降级，先让出当前输入任务。
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      return job.kind === "generate" ? generateBoard(job.config) : shuffleRemaining(job.board);
    }
  }

  generate(config: BoardConfig): Promise<GeneratedBoard> {
    return this.run({ kind: "generate", config }) as Promise<GeneratedBoard>;
  }

  shuffle(board: BoardMatrix): Promise<BoardMatrix> {
    return this.run({ kind: "shuffle", board }) as Promise<BoardMatrix>;
  }

  prefetch(config: BoardConfig): Promise<GeneratedBoard | null> | null {
    if (!this.worker) return null;
    // 后台预生成失败时不在主线程补算，避免游玩中突然停顿。
    return this.request({ kind: "generate", config }).then((result) => result as GeneratedBoard, () => null);
  }
}
