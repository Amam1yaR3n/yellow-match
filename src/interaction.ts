import { getToySdk, type ToyAbility, type ToySdk } from "./toy-sdk";

export const DEVELOPMENT_BVID = "BV19R8i6KEaP";

// 同时约束能力探测和业务请求，超时后下次页面事件仍可重试。
async function query<T>(ability: ToyAbility, read: (sdk: ToySdk) => Promise<T>): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      (async () => {
        const sdk = getToySdk();
        if (!sdk || !await sdk.isSupport(ability)) throw new Error("当前环境不支持互动查询");
        return read(sdk);
      })(),
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(new Error("互动查询超时")), 8_000);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

export function readFollowing(): Promise<boolean> {
  return query("getAuthorRelation", async (sdk) => {
    const result = await sdk.getAuthorRelation();
    if (result.status !== "ok" || typeof result.data?.isFollowing !== "boolean") throw new Error("关注状态不可用");
    return result.data.isFollowing;
  });
}

export function readTriple(): Promise<boolean> {
  return query("getVideoUserActions", async (sdk) => {
    const result = await sdk.getVideoUserActions({ videos: [{ bvid: DEVELOPMENT_BVID }] });
    const item = result.items?.find((entry) => entry.bvid === DEVELOPMENT_BVID);
    if (result.status !== "ok" || item?.status !== "ok"
      || typeof item.liked !== "boolean" || typeof item.favorited !== "boolean"
      || typeof item.coinCount !== "number" || !Number.isSafeInteger(item.coinCount) || item.coinCount < 0) {
      throw new Error("三连状态不可用");
    }
    return item.liked && item.coinCount >= 1 && item.favorited;
  });
}

