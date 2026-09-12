import { CHARACTER_IDS } from "./types";
import type { CharacterDefinition, CharacterId } from "./types";

const characterDefinitions = [
  {
    id: "pikachu", name: "皮卡丘",
    imageUrl: new URL("../assets/avatars/icons/01-pikachu.png", import.meta.url).href,
    ultimate: {
      name: "十万伏特",
      effect: "lightning",
      imageUrl: new URL("../assets/avatars/cutins/runtime/01-pikachu.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/01-pikachu.mp3", import.meta.url).href,
    },
  },
  {
    id: "psyduck", name: "可达鸭",
    imageUrl: new URL("../assets/avatars/icons/02-psyduck.png", import.meta.url).href,
    ultimate: {
      name: "念力",
      effect: "psychic",
      imageUrl: new URL("../assets/avatars/cutins/runtime/02-psyduck.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/02-psyduck.mp3", import.meta.url).href,
    },
  },
  {
    id: "spongebob", name: "海绵宝宝",
    imageUrl: new URL("../assets/avatars/icons/03-spongebob.png", import.meta.url).href,
    ultimate: {
      name: "抓水母",
      effect: "net",
      imageUrl: new URL("../assets/avatars/cutins/runtime/03-spongebob.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/03-spongebob.m4a", import.meta.url).href,
    },
  },
  {
    id: "minion", name: "小黄人",
    imageUrl: new URL("../assets/avatars/icons/05-minion.png", import.meta.url).href,
    ultimate: {
      name: "香蕉大炮", effect: "banana",
      imageUrl: new URL("../assets/avatars/cutins/runtime/05-minion.webp", import.meta.url).href,
      fieldSoundUrl: new URL("../assets/audio/ultimates/05-minion-cannon.mp3", import.meta.url).href,
    },
  },
  {
    id: "bumblebee", name: "大黄蜂",
    imageUrl: new URL("../assets/avatars/icons/06-bumblebee.png", import.meta.url).href,
    ultimate: {
      name: "汽车人变形",
      effect: "charge",
      vehicle: {
        imageUrl: new URL("../assets/ultimates/bumblebee/camaro-side.png", import.meta.url).href,
        imageWidth: 1536,
        imageHeight: 1024,
        bounds: { x: 40, y: 289, width: 1462, height: 466 },
      },
      imageUrl: new URL("../assets/avatars/cutins/runtime/06-bumblebee.webp", import.meta.url).href,
      fieldSoundUrl: new URL("../assets/audio/ultimates/06-bumblebee-transform.mp3", import.meta.url).href,
    },
  },
  {
    id: "smiley", name: "Smiley",
    imageUrl: new URL("../assets/avatars/icons/07-smiley.png", import.meta.url).href,
    ultimate: { name: "微笑一击", effect: "charge", imageUrl: new URL("../assets/avatars/cutins/runtime/07-smiley.webp", import.meta.url).href },
  },
  {
    id: "invincible", name: "无敌少侠",
    imageUrl: new URL("../assets/avatars/icons/08-invincible.png", import.meta.url).href,
    ultimate: {
      name: "维特鲁姆撞击", effect: "charge",
      imageUrl: new URL("../assets/avatars/cutins/runtime/08-invincible.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/08-invincible-charge.m4a", import.meta.url).href,
    },
  },
  {
    id: "lei-yi", name: "雷伊",
    imageUrl: new URL("../assets/avatars/icons/09-lei-yi.png", import.meta.url).href,
    ultimate: {
      name: "雷神天明闪",
      effect: "lightning",
      imageUrl: new URL("../assets/avatars/cutins/runtime/09-lei-yi.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/09-lei-yi.mp3", import.meta.url).href,
    },
  },
  {
    id: "bart-simpson", name: "巴特·辛普森",
    imageUrl: new URL("../assets/avatars/icons/10-bart-simpson.png", import.meta.url).href,
    ultimate: { name: "超级涂鸦喷漆", effect: "spray", fieldSoundUrl: new URL("../assets/audio/ultimates/10-bart-spray.mp3", import.meta.url).href, imageUrl: new URL("../assets/avatars/cutins/runtime/10-bart-simpson.webp", import.meta.url).href },
  },
  {
    id: "nai-long", name: "奶龙",
    imageUrl: new URL("../assets/avatars/icons/11-nai-long.png", import.meta.url).href,
    ultimate: {
      name: "我才是奶龙！",
      effect: "charge",
      imageUrl: new URL("../assets/avatars/cutins/runtime/11-nai-long.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/11-nai-long.mp3", import.meta.url).href,
    },
  },
  {
    id: "nai-wa", name: "奶蛙",
    imageUrl: new URL("../assets/avatars/icons/12-nai-wa.png", import.meta.url).href,
    ultimate: {
      name: "大笑声波",
      effect: "sonic",
      imageUrl: new URL("../assets/avatars/cutins/runtime/12-nai-wa.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/12-nai-wa.mp3", import.meta.url).href,
    },
  },
  {
    id: "niu-lai", name: "牛来",
    imageUrl: new URL("../assets/avatars/icons/13-niu-lai.png", import.meta.url).href,
    ultimate: {
      name: "妈妈！",
      effect: "charge",
      imageUrl: new URL("../assets/avatars/cutins/runtime/13-niu-lai.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/13-niu-lai.mp3", import.meta.url).href,
    },
  },
  {
    id: "meituan-kangaroo", name: "美团",
    imageUrl: new URL("../assets/avatars/icons/14-meituan-kangaroo.png", import.meta.url).href,
    ultimate: {
      name: "你的胆子真是肥嘟嘟的",
      effect: "charge",
      imageUrl: new URL("../assets/avatars/cutins/runtime/14-meituan-kangaroo.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/14-meituan-kangaroo.mp3", import.meta.url).href,
    },
  },
  {
    id: "yellow-mms", name: "黄色 M&M’s 豆",
    imageUrl: new URL("../assets/avatars/icons/15-yellow-mms.png", import.meta.url).href,
    ultimate: { name: "糖果雨", effect: "candy", imageUrl: new URL("../assets/avatars/cutins/runtime/15-yellow-mms.webp", import.meta.url).href },
  },
  {
    id: "pacman", name: "吃豆人",
    imageUrl: new URL("../assets/avatars/icons/16-pacman.png", import.meta.url).href,
    ultimate: {
      name: "吃豆人嚼嚼嚼", effect: "charge",
      fieldSoundUrl: new URL("../assets/audio/ultimates/16-pacman-chew.m4a", import.meta.url).href,
      chew: {
        openImageUrl: new URL("../assets/avatars/master/16-pacman.png", import.meta.url).href,
        closedImageUrl: new URL("../assets/ultimates/pacman/closed-mouth.png", import.meta.url).href,
      },
      imageUrl: new URL("../assets/avatars/cutins/runtime/16-pacman.webp", import.meta.url).href,
    },
  },
  {
    id: "hong-kong-yellow-duck", name: "大黄鸭",
    imageUrl: new URL("../assets/avatars/icons/17-hong-kong-yellow-duck.png", import.meta.url).href,
    ultimate: {
      name: "大黄鸭冲鸭",
      effect: "charge",
      imageUrl: new URL("../assets/avatars/cutins/runtime/17-hong-kong-yellow-duck.webp", import.meta.url).href,
      soundUrl: new URL("../assets/audio/ultimates/17-hong-kong-yellow-duck.mp3", import.meta.url).href,
    },
  },
  {
    id: "among-us-crewmate", name: "among us船员",
    imageUrl: new URL("../assets/avatars/icons/18-among-us-crewmate.png", import.meta.url).href,
    ultimate: {
      name: "我是狼", effect: "charge",
      fieldSoundUrl: new URL("../assets/audio/ultimates/18-among-us-kill.mp3", import.meta.url).href,
      imageUrl: new URL("../assets/avatars/cutins/runtime/18-among-us-crewmate.webp", import.meta.url).href,
      knife: { imageUrl: new URL("../assets/ultimates/among-us/knife.svg", import.meta.url).href },
    },
  },
] as const;

export const CHARACTERS: readonly CharacterDefinition[] = characterDefinitions.map((character) => ({
  ...character,
  ultimate: {
    ...character.ultimate,
    direction: CHARACTER_IDS.indexOf(character.id) % 2 === 0 ? "up" : "down",
  },
}));

const CHARACTER_MAP = new Map<CharacterId, CharacterDefinition>(
  CHARACTERS.map((character) => [character.id, character]),
);

export function getCharacter(id: CharacterId): CharacterDefinition {
  const character = CHARACTER_MAP.get(id);
  if (!character) {
    throw new Error(`Unknown character: ${id}`);
  }
  return character;
}
