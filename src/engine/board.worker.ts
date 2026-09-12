import { generateBoard, shuffleRemaining } from "./board";
import type { BoardRequest, BoardResponse } from "./board-jobs";

// 使用局部声明，避免把 WebWorker 全局类型混入页面的 DOM 类型。
declare const self: {
  onmessage: ((event: MessageEvent<BoardRequest>) => void) | null;
  postMessage: (message: BoardResponse) => void;
};

self.onmessage = ({ data }) => {
  try {
    const result = data.kind === "generate" ? generateBoard(data.config) : shuffleRemaining(data.board);
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, error: error instanceof Error ? error.message : "棋盘生成失败" });
  }
};
