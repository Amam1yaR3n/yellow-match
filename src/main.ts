import "./styles.css";
import { BossSkillView, OBSTACLE_IMAGE } from "./boss-view";
import { BOSS_SKILL_NAMES, hitBossChain, unitUnavailable } from "./engine/boss-skills";
import { DOUBAO_OBSTACLE, isCharacterCell } from "./types";
import { AudioFeedback } from "./audio";
import { CHARACTERS, getCharacter } from "./characters";
import { UltimateCinematic } from "./ultimate";
import { LightningEffects } from "./lightning";
import { ChargeEffects } from "./charge";
import { PsychicEffects } from "./psychic";
import { SonicEffects } from "./sonic";
import { SprayEffects, SPRAY_CAN_URL } from "./spray";
import { BananaEffects, BANANA_URL, CANNON_URL } from "./banana";
import { CandyEffects } from "./candy";
import { NetEffects, JELLYFISH_NET_URL } from "./net";
import { BOARD_STAGES, findAvailablePair, findRandomAvailablePair, remainingTileCount, type AvailablePair, type GeneratedBoard } from "./engine/board";
import { BoardJobs } from "./engine/board-jobs";
import { selectBombTiles } from "./engine/bomb";
import { findPath } from "./engine/pathfinding";
import { acceptImageReady, advanceBattle, canEliminate, canFight, commitElimination, countCharacters, createGameState, evolutionStage, HINT_COUNT, normalAttackDamage, orderedUnits, reinforcementCount, teamPower, useReducedMotion, type BattleEffect, type EliminationSource } from "./engine/combat";
import { BattleText } from "./battle-text";
import { fitNumericText, formatInteger } from "./numbers";
import { CloudSave, withCloudTimeout, type CloudReadResult } from "./cloud-save";
import { LEADERBOARD_SCORE_MAX, LeaderboardClient, type LeaderboardBoard, type LeaderboardData } from "./leaderboard";
import { loadPreferences, savePreferences, type GamePreferences } from "./preferences";
import { LocalSave } from "./save";
import { DEVELOPMENT_BVID, readFollowing, readTriple } from "./interaction";
import { SessionGuard } from "./session";
import { getToySdk, type ToyAuthorProfile } from "./toy-sdk";
import type {
  CharacterId,
  Coord,
  GameState,
  PathPoint,
} from "./types";

const EVOLUTION_LABELS = ["", "I", "II", "III", "IV"] as const;
const AUTHOR_MID = "137429365";
const DEVELOPMENT_COVER_URL = new URL("../assets/video/development-cover.jpg", import.meta.url).href;
const GIFT_ICON = `<svg class="reward-gift" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 29h40v25a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3Z" fill="#ffd75b"/><path d="M9 22h46v12H9Z" fill="#ffe995"/><path d="M28 23h8v34h-8Z" fill="#f19779"/><path d="M31 22C13 24 13 7 23 10c5 1 8 12 8 12Zm2 0C51 24 51 7 41 10c-5 1-8 12-8 12Z" fill="#f19779"/><path d="M12 34v20a3 3 0 0 0 3 3h34a3 3 0 0 0 3-3V34M9 22h46v12H9ZM28 34v23m8-23v23M31 22C13 24 13 7 23 10c5 1 8 12 8 12Zm2 0C51 24 51 7 41 10c-5 1-8 12-8 12Z" fill="none" stroke="#63451e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const COMBO_WINDOW_MS = 2_800;
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const BOSS_FORMS = [
  { id: "volcano-original", name: "火山哥·初始形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-01.png", import.meta.url).href, scale: 1 },
  { id: "volcano-penguin", name: "火山哥·企鹅形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-02.png", import.meta.url).href, scale: 1 },
  { id: "volcano-jiahao", name: "火山哥·嘉豪山形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-03.png", import.meta.url).href, scale: 1 },
  { id: "volcano-macho", name: "火山哥·硬汉形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-04.png", import.meta.url).href, scale: 1 },
  { id: "volcano-drool", name: "火山哥·口水形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-05.png", import.meta.url).href, scale: 1 },
  { id: "volcano-dragon", name: "火山哥·奶龙形态", imageUrl: new URL("../assets/avatars/volcano/volcano-stage-06.png", import.meta.url).href, scale: 1 },
] as const;

for (const form of BOSS_FORMS) {
  const image = new Image();
  image.src = form.imageUrl;
}

interface ViewportPoint {
  x: number;
  y: number;
}

interface BattleLayout {
  boss: DOMRect;
  field: DOMRect;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Game root not found");
}

app.innerHTML = `
  <main class="game-shell is-loading" data-phase="loading">
    <section class="battle-stage" aria-label="黄色战队对战火山哥">
      <div class="battle-layout">
        <div class="utility-toolbar battle-utility-toolbar" aria-label="游戏功能">
          <button class="utility-button ranking-button" type="button" aria-label="排行榜" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M3.5 23.5h21" />
              <path d="M4.5 23.5v-7h6v7m0 0v-12h7v12m0 0v-9h6v9" />
            </svg>
          </button>
          <button class="utility-button settings-button" type="button" aria-label="设置" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M14 9.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
              <path d="M11.8 3.5h4.4l.7 3a9.3 9.3 0 0 1 2.1 1.2l2.9-.9 2.2 3.8-2.2 2.1a9.2 9.2 0 0 1 0 2.6l2.2 2.1-2.2 3.8-2.9-.9a9.3 9.3 0 0 1-2.1 1.2l-.7 3h-4.4l-.7-3A9.3 9.3 0 0 1 9 19.3l-2.9.9-2.2-3.8 2.2-2.1a9.2 9.2 0 0 1 0-2.6L3.9 9.6l2.2-3.8 2.9.9a9.3 9.3 0 0 1 2.1-1.2l.7-3Z" />
            </svg>
          </button>
          <button class="utility-button interaction-button" type="button" aria-label="互动" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M4.5 12.5h19v11h-19zM3.5 8.5h21v4h-21zM14 8.5v15" />
              <path d="M14 8.5H9.6a2.8 2.8 0 1 1 2.1-4.7C13 5 14 8.5 14 8.5Zm0 0h4.4a2.8 2.8 0 1 0-2.1-4.7C15 5 14 8.5 14 8.5Z" />
            </svg>
          </button>
        </div>
        <div class="battle-frame">
          <div id="battle-energy" class="battle-energy" aria-hidden="true">
            <div class="battle-energy-red"></div>
            <div class="battle-energy-yellow"></div>
            <div class="battle-energy-beam battle-energy-beam-yellow"></div>
            <div class="battle-energy-beam battle-energy-beam-red"></div>
            <div class="battle-energy-front"><i></i><b></b></div>
          </div>
          <div class="boss-hud">
            <div id="boss-health-bar" class="boss-health-bar" role="progressbar" aria-label="火山哥剩余生命" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
              <i id="boss-health-fill"></i>
              <strong id="boss-health-percent" class="boss-health-percent">100%</strong>
            </div>
          </div>

          <div id="battlefield" class="battlefield">
            <div id="net-back-layer" class="net-back-layer" aria-hidden="true"></div>
            <section class="team-side" aria-label="黄色战队">
              <div id="team-roster" class="team-roster"></div>
            </section>
            <span class="versus" aria-hidden="true">VS</span>
            <section class="boss-side" aria-label="火山哥">
              <div id="boss" class="boss" aria-hidden="true">
                <span class="boss-art-frame">
                  <img id="boss-art" class="boss-art" alt="" draggable="false" />
                </span>
              </div>
            </section>
            <div id="charge-layer" class="charge-layer" aria-hidden="true"></div>
            <div id="lightning-layer" class="lightning-layer" aria-hidden="true"></div>
            <div id="psychic-layer" class="psychic-layer" aria-hidden="true"></div>
            <div id="banana-layer" class="banana-layer" aria-hidden="true"></div>
            <div id="spray-layer" class="spray-layer" aria-hidden="true"></div>
            <div id="candy-layer" class="candy-layer" aria-hidden="true"></div>
            <div id="net-layer" class="net-layer" aria-hidden="true"></div>
            <div id="sonic-layer" class="sonic-layer" aria-hidden="true"></div>
            <div id="battle-effects" class="battle-effects" aria-hidden="true"></div>
            <div id="battle-text-layer" class="battle-text-layer" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    </section>

    <section class="combat-stats" aria-label="黄色战队战斗统计">
      <div class="combat-stat">
        <span class="combat-stat-label">黄色战队战斗力</span>
        <strong id="team-power-value">0</strong>
      </div>
      <div class="combat-stat" aria-label="全队每秒平均伤害">
        <span class="combat-stat-label dps-label">DPS</span>
        <strong id="dps-value">0.0</strong>
      </div>
    </section>

    <section class="board-stage" aria-label="连连看棋盘区域">
      <div class="board-layout">
        <div class="board-frame">
          <div id="board" class="board" role="grid" aria-label="7乘7连连看棋盘"></div>
          <svg id="path-layer" class="path-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div id="particle-layer" class="particle-layer" aria-hidden="true"></div>
        </div>
        <div class="utility-toolbar board-utility-toolbar" aria-label="游戏功能">
          <button class="utility-button ranking-button" type="button" aria-label="排行榜" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M3.5 23.5h21" />
              <path d="M4.5 23.5v-7h6v7m0 0v-12h7v12m0 0v-9h6v9" />
            </svg>
          </button>
          <button class="utility-button settings-button" type="button" aria-label="设置" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M14 9.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
              <path d="M11.8 3.5h4.4l.7 3a9.3 9.3 0 0 1 2.1 1.2l2.9-.9 2.2 3.8-2.2 2.1a9.2 9.2 0 0 1 0 2.6l2.2 2.1-2.2 3.8-2.9-.9a9.3 9.3 0 0 1-2.1 1.2l-.7 3h-4.4l-.7-3A9.3 9.3 0 0 1 9 19.3l-2.9.9-2.2-3.8 2.2-2.1a9.2 9.2 0 0 1 0-2.6L3.9 9.6l2.2-3.8 2.9.9a9.3 9.3 0 0 1 2.1-1.2l.7-3Z" />
            </svg>
          </button>
          <button class="utility-button interaction-button" type="button" aria-label="互动" disabled>
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <path d="M4.5 12.5h19v11h-19zM3.5 8.5h21v4h-21zM14 8.5v15" />
              <path d="M14 8.5H9.6a2.8 2.8 0 1 1 2.1-4.7C13 5 14 8.5 14 8.5Zm0 0h4.4a2.8 2.8 0 1 0-2.1-4.7C15 5 14 8.5 14 8.5Z" />
            </svg>
          </button>
        </div>
      </div>
    </section>

    <footer class="game-controls">
      <button id="hint-button" class="control primary" type="button">提示 <span id="hint-count">3</span></button>
      <button id="bomb-button" class="control bomb-control" type="button" aria-pressed="false" disabled><b id="bomb-label">炸弹</b> <span id="bomb-count">1</span></button>
    </footer>
    <p id="save-notice" class="save-notice" role="status" hidden></p>
    <dialog id="save-reset-dialog" class="restart-dialog" aria-labelledby="save-reset-title">
      <h2 id="save-reset-title">重置存档？</h2>
      <p>这会清空当前棋盘、队伍和炸弹，并覆盖本地与云存档；排行榜历史最高成绩会保留。</p>
      <div class="dialog-actions">
        <button id="save-reset-cancel" class="control" type="button" autofocus>取消</button>
        <button id="save-reset-confirm" class="control primary" type="button">确认重置</button>
      </div>
    </dialog>
    <dialog id="cloud-reset-dialog" class="restart-dialog" aria-labelledby="cloud-reset-title">
      <h2 id="cloud-reset-title">发现离线重开记录</h2>
      <p>无法确认这份离线重开记录是否属于当前账号。请选择恢复当前账号的云存档，或用本机的新进度覆盖它。</p>
      <div class="dialog-actions cloud-reset-actions">
        <button id="cloud-reset-restore" class="control" type="button">恢复云存档</button>
        <button id="cloud-reset-apply" class="control primary" type="button">同步离线重开</button>
      </div>
    </dialog>
    <dialog id="ranking-dialog" class="ranking-dialog" aria-labelledby="ranking-title">
      <div class="ranking-panel">
        <header class="ranking-header">
          <h2 id="ranking-title">排行榜</h2>
          <button id="ranking-close" class="ranking-close" type="button" aria-label="关闭排行榜">×</button>
        </header>
        <div class="ranking-tabs" role="tablist" aria-label="排行榜类型">
          <button id="ranking-tab-kills" type="button" role="tab" aria-selected="true" data-board="1">魔王击杀</button>
          <button id="ranking-tab-power" type="button" role="tab" aria-selected="false" data-board="2">战队战力</button>
        </div>
        <div class="ranking-body">
          <p id="ranking-status" class="ranking-status" role="status">正在加载排行榜…</p>
          <ol id="ranking-list" class="ranking-list" aria-label="排行榜前50名"></ol>
        </div>
        <footer id="my-rank" class="my-rank" aria-label="我的排名">
          <span class="rank-position rank-position-plain">—</span>
          <span class="rank-avatar rank-avatar-placeholder" aria-hidden="true">我</span>
          <span class="rank-name">登录后查看我的排名</span>
          <strong class="rank-score">—</strong>
        </footer>
      </div>
    </dialog>
    <dialog id="settings-dialog" class="ranking-dialog feature-dialog" aria-labelledby="settings-title">
      <div class="feature-panel settings-panel">
        <header class="ranking-header">
          <h2 id="settings-title">设置</h2>
          <button id="settings-close" class="ranking-close" type="button" aria-label="关闭设置">×</button>
        </header>
        <div class="feature-body settings-body">
          <section class="settings-card volume-card" aria-labelledby="volume-title">
            <div class="settings-card-heading">
              <div>
                <h3 id="volume-title">音量</h3>
              </div>
              <output id="volume-output" for="volume-slider">50%</output>
            </div>
            <input id="volume-slider" class="volume-slider" type="range" min="0" max="100" step="1" value="50" aria-label="游戏音量" />
          </section>
          <label class="settings-card setting-toggle" for="ultimate-cinematics-toggle">
            <span>
              <strong>必杀特写</strong>
            </span>
            <span class="switch-control">
              <input id="ultimate-cinematics-toggle" type="checkbox" role="switch" checked />
              <i aria-hidden="true"></i>
            </span>
          </label>
          <section class="settings-card reset-card" aria-label="存档操作">
            <button id="save-reset-button" class="control reset-save-control" type="button">重置存档</button>
          </section>
        </div>
      </div>
    </dialog>
    <dialog id="interaction-dialog" class="ranking-dialog feature-dialog" aria-labelledby="interaction-title">
      <div class="feature-panel interaction-panel">
        <header class="ranking-header">
          <h2 id="interaction-title">互动</h2>
          <button id="interaction-close" class="ranking-close" type="button" aria-label="关闭互动">×</button>
        </header>
        <div class="feature-body interaction-body">
          <div class="interaction-layout">
            <div class="interaction-left">
              <section class="interaction-card author-card" aria-label="本 Toy 作者">
                <span class="card-eyebrow">本 Toy 作者</span>
                <div class="author-profile">
                  <span id="author-avatar" class="author-avatar author-avatar-placeholder" aria-hidden="true">作</span>
                  <div>
                    <strong id="author-name">正在加载…</strong>
                  </div>
                </div>
                <p id="author-status" class="author-status" role="status">正在获取作者资料…</p>
                <button id="author-space-button" class="control primary author-space-button" type="button" disabled>查看主页</button>
              </section>
              <section class="interaction-card video-card" aria-labelledby="video-card-title">
                <span id="video-card-title" class="card-eyebrow">开发记录</span>
                <button id="development-video-button" class="video-placeholder" type="button" aria-label="观看开发记录" disabled>
                  <span class="video-cover-placeholder">
                    <img src="${DEVELOPMENT_COVER_URL}" alt="开发记录视频封面" decoding="async" />
                    <svg class="video-play-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="rgba(0,0,0,.55)" stroke="white" stroke-width="2"/><path d="m19 13 17 11-17 11Z" fill="white"/></svg>
                  </span>
                </button>
              </section>
            </div>
            <section class="interaction-card reward-card" aria-labelledby="reward-card-title">
              <h3 id="reward-card-title">互动奖励</h3>
              <div class="interaction-reward">
                ${GIFT_ICON}
                <h4><span class="reward-copy-line">一键三连获取</span><span class="reward-copy-line reward-amount">提示✖️3</span><span id="triple-reward-claimed" class="reward-claimed" hidden><span aria-hidden="true">✓</span> 已领取</span></h4>
              </div>
              <div class="interaction-reward">
                ${GIFT_ICON}
                <h4><span class="reward-copy-line">关注获取</span><span class="reward-copy-line reward-amount">炸弹✖️1</span><span id="following-reward-claimed" class="reward-claimed" hidden><span aria-hidden="true">✓</span> 已领取</span></h4>
              </div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
    <div id="session-panel" class="session-panel" hidden>
      <p>游戏已在其他页面运行，请关闭原页面后在这里继续。</p>
      <button id="session-retry" class="control primary" type="button">重新尝试进入</button>
    </div>

    <div id="loading-panel" class="loading-panel" role="status" aria-live="polite">
      <span class="loading-face" aria-hidden="true"><i></i><i></i><b></b></span>
      <strong>正在集结黄色战队</strong>
      <span>载入 17 位黄色伙伴…</span>
    </div>

    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
    <div id="transfer-layer" class="transfer-layer" aria-hidden="true"></div>
    <div id="ultimate-layer" class="ultimate-layer" aria-hidden="true" hidden></div>
    <p id="announcer" class="sr-only" aria-live="assertive"></p>
  </main>
`;

const shell = document.querySelector<HTMLElement>(".game-shell")!;
const battlefield = document.querySelector<HTMLDivElement>("#battlefield")!;
const teamRoster = document.querySelector<HTMLDivElement>("#team-roster")!;
const bossElement = document.querySelector<HTMLDivElement>("#boss")!;
const bossArtElement = document.querySelector<HTMLImageElement>("#boss-art")!;
const battleEnergy = document.querySelector<HTMLDivElement>("#battle-energy")!;
let energyPosition = 0;
let energyTarget: number | null = null;
let energyStart = 0;
let energyElapsed = 0;
let energyDuration = 240;
let energyFrameTime = 0;

const bossHealthBar = document.querySelector<HTMLDivElement>("#boss-health-bar")!;
const bossHealthFill = document.querySelector<HTMLElement>("#boss-health-fill")!;
const bossHealthPercent = document.querySelector<HTMLElement>("#boss-health-percent")!;
const teamPowerValue = document.querySelector<HTMLElement>("#team-power-value")!;
const dpsValue = document.querySelector<HTMLElement>("#dps-value")!;
const battleEffects = document.querySelector<HTMLDivElement>("#battle-effects")!;
const chargeLayer = document.querySelector<HTMLDivElement>("#charge-layer")!;
const lightningLayer = document.querySelector<HTMLDivElement>("#lightning-layer")!;
const psychicLayer = document.querySelector<HTMLDivElement>("#psychic-layer")!;
const candyLayer = document.querySelector<HTMLDivElement>("#candy-layer")!;
const bananaLayer = document.querySelector<HTMLDivElement>("#banana-layer")!;
const sprayLayer = document.querySelector<HTMLDivElement>("#spray-layer")!;
const netLayer = document.querySelector<HTMLDivElement>("#net-layer")!;
const netBackLayer = document.querySelector<HTMLDivElement>("#net-back-layer")!;
const sonicLayer = document.querySelector<HTMLDivElement>("#sonic-layer")!;
const transferLayer = document.querySelector<HTMLDivElement>("#transfer-layer")!;
const ultimateLayer = document.querySelector<HTMLDivElement>("#ultimate-layer")!;
const boardElement = document.querySelector<HTMLDivElement>("#board")!;
const pathLayer = document.querySelector<SVGSVGElement>("#path-layer")!;
const particleLayer = document.querySelector<HTMLDivElement>("#particle-layer")!;
const hintButton = document.querySelector<HTMLButtonElement>("#hint-button")!;
const hintCount = document.querySelector<HTMLElement>("#hint-count")!;
const bombButton = document.querySelector<HTMLButtonElement>("#bomb-button")!;
const bombCount = document.querySelector<HTMLElement>("#bomb-count")!;
const bombLabel = document.querySelector<HTMLElement>("#bomb-label")!;
const saveResetButton = document.querySelector<HTMLButtonElement>("#save-reset-button")!;
const saveResetDialog = document.querySelector<HTMLDialogElement>("#save-reset-dialog")!;
const cloudResetDialog = document.querySelector<HTMLDialogElement>("#cloud-reset-dialog")!;
const utilityButtons = [...document.querySelectorAll<HTMLButtonElement>(".utility-button")];
const rankingButtons = [...document.querySelectorAll<HTMLButtonElement>(".ranking-button")];
const settingsButtons = [...document.querySelectorAll<HTMLButtonElement>(".settings-button")];
const interactionButtons = [...document.querySelectorAll<HTMLButtonElement>(".interaction-button")];
const rankingDialog = document.querySelector<HTMLDialogElement>("#ranking-dialog")!;
const rankingClose = document.querySelector<HTMLButtonElement>("#ranking-close")!;
const rankingTabs = [...document.querySelectorAll<HTMLButtonElement>(".ranking-tabs [role=tab]")];
const rankingList = document.querySelector<HTMLOListElement>("#ranking-list")!;
const rankingStatus = document.querySelector<HTMLParagraphElement>("#ranking-status")!;
const myRankElement = document.querySelector<HTMLElement>("#my-rank")!;
const settingsDialog = document.querySelector<HTMLDialogElement>("#settings-dialog")!;
const settingsClose = document.querySelector<HTMLButtonElement>("#settings-close")!;
const volumeSlider = document.querySelector<HTMLInputElement>("#volume-slider")!;
const volumeOutput = document.querySelector<HTMLOutputElement>("#volume-output")!;
const ultimateCinematicsToggle = document.querySelector<HTMLInputElement>("#ultimate-cinematics-toggle")!;
const interactionDialog = document.querySelector<HTMLDialogElement>("#interaction-dialog")!;
const interactionClose = document.querySelector<HTMLButtonElement>("#interaction-close")!;
const tripleRewardClaimed = document.querySelector<HTMLSpanElement>("#triple-reward-claimed")!;
const followingRewardClaimed = document.querySelector<HTMLSpanElement>("#following-reward-claimed")!;
const authorAvatar = document.querySelector<HTMLElement>("#author-avatar")!;
const authorName = document.querySelector<HTMLElement>("#author-name")!;
const authorStatus = document.querySelector<HTMLParagraphElement>("#author-status")!;
const authorSpaceButton = document.querySelector<HTMLButtonElement>("#author-space-button")!;
const developmentVideoButton = document.querySelector<HTMLButtonElement>("#development-video-button")!;
let interactionRequest: { generation: number; promise: Promise<void>; refreshAfter: boolean } | null = null;
const saveNotice = document.querySelector<HTMLParagraphElement>("#save-notice")!;
const sessionPanel = document.querySelector<HTMLDivElement>("#session-panel")!;
const textLayer = document.querySelector<HTMLDivElement>("#battle-text-layer")!;
const loadingPanel = document.querySelector<HTMLDivElement>("#loading-panel")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
const announcer = document.querySelector<HTMLElement>("#announcer")!;

let state: GameState = createGameState();
let renderedBoard: GameState["board"] | null = null;
let lastAvailability = "";
const bossSkillView = new BossSkillView(shell, boardElement, battlefield, document.querySelector<HTMLElement>(".boss-side")!);
let preferences: GamePreferences = loadPreferences();

const audio = new AudioFeedback();
audio.setVolume(preferences.volume / 100);
const boardJobs = new BoardJobs();
const ultimateCinematic = new UltimateCinematic(ultimateLayer);
const lightningEffects = new LightningEffects(lightningLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
);
const chargeEffects = new ChargeEffects(chargeLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
  (characterId) => audio.playUltimateField(getCharacter(characterId).ultimate.fieldSoundUrl),
);
const psychicEffects = new PsychicEffects(psychicLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
);
const sonicEffects = new SonicEffects(sonicLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
);
const candyEffects = new CandyEffects(candyLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
);
const sprayEffects = new SprayEffects(sprayLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
  (characterId) => audio.playUltimateField(getCharacter(characterId).ultimate.fieldSoundUrl),
);
const bananaEffects = new BananaEffects(bananaLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
  (characterId) => audio.playUltimateField(getCharacter(characterId).ultimate.fieldSoundUrl),
);
const netEffects = new NetEffects(netLayer, netBackLayer, bossElement, (characterId) =>
  getEffectAvatar(characterId),
);
let selected: Coord | null = null;
let availablePair: AvailablePair | null = null;
let preparedBoard: { stage: number; promise: Promise<GeneratedBoard | null> } | null = null;
let bombTargeting = false;
let manualComboCount = 0;
let lastManualEliminationAtMs: number | null = null;
let pendingComboHint = false;
let lastBossEliminationAt = -Infinity;
let preserveBombModeDuringSettlement = false;
const battleText = new BattleText(textLayer, reducedMotionQuery);
const saves = new LocalSave(reportSaveNotice);
const session = new SessionGuard(showSessionBlocked, reportSaveNotice);
const cloud = new CloudSave(reportSaveNotice);
const leaderboards = new LeaderboardClient(cloud.rankEnabled, () => cloud.enableRanking(), reportSaveNotice);
let lastTickTime = performance.now();
let lastWallTime = Date.now();
let lastSavedAt = 0;
let lastLeaseCheck = 0;
let lifecycleSuspended = false;
let startupRunning = false;
let resumeRequested = false;
let boardRequestId: number | null = null;
let preparingId: number | null = null;
let lastDpsUpdateAtMs = -Infinity;
let gameGeneration = 0;
let hintGeneration = 0;
let toastGeneration = 0;
let rankingBoard: LeaderboardBoard = 1;
let rankingLoadGeneration = 0;
let rankingTrigger: HTMLButtonElement | null = null;
let settingsTrigger: HTMLButtonElement | null = null;
let interactionTrigger: HTMLButtonElement | null = null;
let authorLoadGeneration = 0;
let cachedAuthorProfile: ToyAuthorProfile | null = null;
let authorNavigateSupported = false;

boardElement.inert = true;

bossSkillView.onChainPress = () => {
  if (!isForeground() || !session.owned || document.querySelector("dialog[open]")) return;
  if (!canAdvanceBattle()) return;
  advanceToNow();
  if (!canAdvanceBattle()) return;
  const target = state;
  if (!hitBossChain(target)) return;
  audio.play("chain-hit");
  persist(true);
  bossSkillView.sync(target);
};

function sameCoord(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

function isForeground(): boolean {
  return !document.hidden && document.hasFocus() && !lifecycleSuspended;
}

function canAdvanceBattle(): boolean {
  return session.owned && !lifecycleSuspended && canFight(state);
}

function canUseBoard(): boolean {
  return session.owned && !lifecycleSuspended && state.pendingBossEliminations === 0 && canEliminate(state);
}

function focusBoardSelection(): void {
  (selected ? getTile(selected) : boardElement.querySelector<HTMLButtonElement>("button.tile:not(:disabled)"))?.focus({ preventScroll: true });
}

function tileSelector(coord: Coord): string {
  return `button.tile:not(:disabled)[data-row="${coord.row}"][data-col="${coord.col}"]`;
}

function unitSelector(characterId: CharacterId): string {
  return `.team-unit[data-character-id="${characterId}"]`;
}

function getTile(coord: Coord): HTMLButtonElement | null {
  return boardElement.querySelector<HTMLButtonElement>(tileSelector(coord));
}

function getUnitElement(characterId: CharacterId): HTMLElement | null {
  return teamRoster.querySelector<HTMLElement>(unitSelector(characterId));
}

function announce(message: string): void {
  announcer.textContent = "";
  window.setTimeout(() => {
    announcer.textContent = message;
  }, 20);
}

function hasBossKill(effects: readonly BattleEffect[]): boolean {
  return effects.some((effect) => effect.kind === "revive-start");
}

function syncBattleProgress(effects: readonly BattleEffect[]): void {
  if (!hasBossKill(effects)) return;
  void leaderboards.submit(state);
}

function updateControls(): void {
  tripleRewardClaimed.hidden = !state.interactionRewards.triple;
  followingRewardClaimed.hidden = !state.interactionRewards.following;
  const wasInert = boardElement.inert;
  fitNumericText(hintCount, BigInt(state.hintsRemaining), Math.max(24, hintButton.clientWidth - 65), { minimumFontSize: 10, allowLines: true });
  const inert = !canUseBoard();
  const hintDisabled = inert || bombTargeting || state.hintsRemaining === 0;
  if (hintButton.disabled !== hintDisabled) hintButton.disabled = hintDisabled;
  fitNumericText(bombCount, BigInt(state.bombCount), Math.max(24, bombButton.clientWidth - 65), { minimumFontSize: 10, allowLines: true });
  const utilityDisabled = state.phase !== "playing" || !session.owned || lifecycleSuspended;
  saveResetButton.disabled = utilityDisabled;
  for (const button of utilityButtons) button.disabled = utilityDisabled;
  authorSpaceButton.disabled = utilityDisabled || !authorNavigateSupported;
  developmentVideoButton.disabled = utilityDisabled || !authorNavigateSupported;
  bombButton.disabled = inert || state.bombCount === 0;
  bombButton.setAttribute("aria-pressed", String(bombTargeting));
  bombLabel.textContent = bombTargeting ? "取消炸弹" : "炸弹";
  if (wasInert !== inert) boardElement.inert = inert;
  if (isForeground() && wasInert && !boardElement.inert && document.activeElement === document.body) {
    focusBoardSelection();
  }
}

function statWidth(element: HTMLElement): number {
  const parent = element.parentElement!;
  const style = getComputedStyle(parent);
  return Math.max(1, parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
}

function updateDpsHud(force = false): void {
  if (!force && state.activeElapsedMs - lastDpsUpdateAtMs < 100) return;
  lastDpsUpdateAtMs = state.activeElapsedMs;
  const elapsed = BigInt(state.activeElapsedMs);
  const tenths = elapsed > 0n ? (state.totalDamage * 10_000n + elapsed / 2n) / elapsed : 0n;
  fitNumericText(dpsValue, tenths, statWidth(dpsValue), { fractionDigits: 1, minimumFontSize: 12, allowLines: true });
}

function updateTeamPowerHud(): void {
  const power = teamPower(state);
  fitNumericText(teamPowerValue, power, statWidth(teamPowerValue), { minimumFontSize: 12, allowLines: true });
}

function updateBossForm(): void {
  const damage = state.bossMaxHp - state.bossHp;
  const formIndex = Math.min(BOSS_FORMS.length - 1, Number(damage * BigInt(BOSS_FORMS.length) / state.bossMaxHp));
  if (bossElement.dataset.formIndex === String(formIndex)) return;

  const form = BOSS_FORMS[formIndex];
  bossElement.dataset.formIndex = String(formIndex);
  bossElement.dataset.form = form.id;
  bossArtElement.src = form.imageUrl;
  bossElement.closest(".boss-side")?.setAttribute("aria-label", form.name);
  bossElement.style.setProperty("--boss-art-scale", String(form.scale));
}

function paintBattleEnergy(): void {
  const edge = energyPosition * 100;
  // 两端收拢斜面，确保满血和击杀时没有另一方的残色。
  const tilt = Math.min(edge, 100 - edge, 3);
  battleEnergy.style.setProperty("--energy-edge", `${edge}%`);
  battleEnergy.style.setProperty("--energy-top", `${edge + tilt}%`);
  battleEnergy.style.setProperty("--energy-bottom", `${edge - tilt}%`);
  battleEnergy.style.setProperty("--energy-tilt", `${tilt}%`);
  battleEnergy.classList.toggle("has-energy-clash", energyPosition > 0 && energyPosition < 1);
}

function updateBattleEnergy(immediate = false): void {
  const target = Number((state.bossMaxHp - state.bossHp) * 1_000_000n / state.bossMaxHp) / 1_000_000;
  if (immediate || energyTarget === null || target === 1 || !isForeground() || reducedMotionQuery.matches) {
    energyTarget = energyPosition = energyStart = target;
    energyElapsed = energyDuration;
    paintBattleEnergy();
  } else if (target !== energyTarget) {
    energyDuration = target < energyTarget ? 250 : 240;
    energyStart = energyPosition;
    energyTarget = target;
    energyElapsed = 0;
  }
}

function animateBattleEnergy(now: number): void {
  const elapsed = Math.min(64, Math.max(0, now - energyFrameTime));
  energyFrameTime = now;
  if (energyTarget === null || energyPosition === energyTarget || !isForeground()
    || state.ultimateBatch !== null || state.bossReviveRemainingMs > 0) return;
  energyElapsed = Math.min(energyDuration, energyElapsed + elapsed);
  const progress = energyElapsed / energyDuration;
  energyPosition = progress === 1 ? energyTarget : energyStart + (energyTarget - energyStart) * (1 - (1 - progress) ** 3);
  paintBattleEnergy();
}

function updateBossHud(): void {
  const ratio = Number(state.bossHp * 1_000_000n / state.bossMaxHp) / 1_000_000;
  const percent = Number((state.bossHp * 100n + state.bossMaxHp - 1n) / state.bossMaxHp);
  updateBossForm();
  updateBattleEnergy();
  bossHealthFill.style.transform = `scaleX(${ratio})`;
  bossHealthPercent.textContent = `${percent}%`;
  bossHealthBar.setAttribute("aria-valuenow", String(percent));
  updateDpsHud(true);
  updateControls();
}

function createEmptyTile(coord: Coord): HTMLButtonElement {
  const empty = document.createElement("button");
  empty.type = "button";
  empty.className = "tile tile-empty";
  empty.dataset.row = String(coord.row);
  empty.dataset.col = String(coord.col);
  empty.setAttribute("role", "gridcell");
  empty.setAttribute("aria-label", `空格，第 ${coord.row + 1} 行第 ${coord.col + 1} 列`);
  empty.disabled = !bombTargeting;
  return empty;
}

function renderBoard(display = state): void {
  renderedBoard = display.board;
  availablePair = null;
  const size = display.board.length;
  boardElement.style.setProperty("--board-size", String(size));
  boardElement.setAttribute("aria-label", `${size}乘${size}连连看棋盘`);
  boardElement.setAttribute("aria-rowcount", String(size));
  boardElement.setAttribute("aria-colcount", String(size));
  const fragment = document.createDocumentFragment();
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const characterId = display.board[row][col];
      if (characterId === null) {
        fragment.append(createEmptyTile({ row, col }));
        continue;
      }

      if (characterId === DOUBAO_OBSTACLE) {
        const obstacle = createEmptyTile({ row, col });
        obstacle.className = "tile tile-obstacle";
        obstacle.disabled = true;
        obstacle.setAttribute("aria-label", `岩浆路障，不可消除，第 ${row + 1} 行第 ${col + 1} 列`);
        const image = document.createElement("img");
        image.src = OBSTACLE_IMAGE;
        image.alt = "";
        image.draggable = false;
        obstacle.append(image);
        fragment.append(obstacle);
        continue;
      }
      const character = getCharacter(characterId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tile";
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${character.name}，第 ${row + 1} 行第 ${col + 1} 列`);
      if (selected && selected.row === row && selected.col === col) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      const image = document.createElement("img");
      image.src = character.imageUrl;
      image.alt = "";
      image.draggable = false;
      button.append(image);
      fragment.append(button);
    }
  }
  boardElement.replaceChildren(fragment);
}

function getEffectAvatar(characterId: CharacterId): HTMLImageElement | null {
  return getUnitElement(characterId)?.querySelector<HTMLImageElement>(".team-avatar img") ?? null;
}

function renderTeam(display = state): void {
  updateTeamPowerHud();
  if (Object.keys(display.battleUnits).length === 0) {
    teamRoster.replaceChildren();
    return;
  }
  const fragment = document.createDocumentFragment();
  orderedUnits(display).forEach((unit) => {
    const character = getCharacter(unit.id);
    let member = getUnitElement(unit.id);
    if (!member) {
      member = document.createElement("article");
      member.className = "team-unit";
      member.dataset.characterId = unit.id;
      const avatar = document.createElement("span");
      avatar.className = "team-avatar";
      const image = document.createElement("img");
      image.src = character.imageUrl;
      image.alt = "";
      image.draggable = false;
      avatar.append(image);
      const tombstone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tombstone.setAttribute("viewBox", "0 0 40 40");
      tombstone.setAttribute("aria-hidden", "true");
      tombstone.classList.add("unit-tombstone");
      tombstone.innerHTML = `<path d="M10 32V16a10 10 0 0 1 20 0v16" fill="#b6b9c5" stroke="#515361" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M13 29V16a7 7 0 0 1 7-7" fill="none" stroke="#e8e9ef" stroke-width="2" stroke-linecap="round"/>
        <path d="M17 18h6m-3-3v8" fill="none" stroke="#666977" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M7 32h26v4H7z" fill="#969baa" stroke="#515361" stroke-width="2.5" stroke-linejoin="round"/>`;
      avatar.append(tombstone);
      const demon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      demon.setAttribute("viewBox", "0 0 40 40");
      demon.setAttribute("aria-hidden", "true");
      demon.classList.add("unit-betrayal-icon");
      demon.innerHTML = `<path d="M8 5l10 8h4L32 5l-1 15c0 9-6 15-11 17C15 35 9 29 9 20z" fill="currentColor"/>
        <path d="M13 20l5 2m9-2-5 2" fill="none" stroke="#f0dfff" stroke-width="3" stroke-linecap="round"/>`;
      avatar.append(demon);
      const level = document.createElement("span");
      level.className = "unit-level";
      member.append(avatar, level);
      fragment.append(member);
    }
    const stage = evolutionStage(unit.level);
    member.dataset.evolutionStage = String(stage);
    member.classList.toggle("is-crowned", stage > 0);
    const evolution = stage > 0 ? `，外观${stage}阶，数值强化${reinforcementCount(unit.level)}次` : "";
    const betrayed = display.bossSkills.shields.some((shield) => shield.characterId === unit.id);
    const exiled = display.bossSkills.exiled.includes(unit.id);
    member.classList.toggle("is-betrayed", betrayed);
    member.classList.toggle("is-exiled", exiled);
    if (betrayed || exiled) member.classList.remove("is-attacking", "is-ultimate", "is-recruited", "is-upgraded");
    member.setAttribute("aria-label", `${character.name}，等级 ${unit.level}${evolution}${betrayed ? "，已被策反" : exiled ? "，被火山射线移走，消除同角色后归队" : ""}`);
  });
  teamRoster.append(fragment);
  for (const unit of orderedUnits(display)) {
    const member = getUnitElement(unit.id)!;
    // 使用实际格子宽度；隐藏时不按零宽度排版，恢复可见后由 resize 重新计算。
    if (member.clientWidth === 0) continue;
    fitNumericText(member.querySelector<HTMLElement>(".unit-level")!, BigInt(unit.level), member.clientWidth, { prefix: "Lv.", minimumFontSize: 1, levelLabel: true });
  }
}

function setSelected(coord: Coord | null): void {
  if (selected) {
    const previousTile = getTile(selected);
    previousTile?.classList.remove("is-selected");
    previousTile?.setAttribute("aria-pressed", "false");
  }
  selected = coord;
  if (selected) {
    const nextTile = getTile(selected);
    nextTile?.classList.remove("is-wrong");
    nextTile?.classList.add("is-selected");
    nextTile?.setAttribute("aria-pressed", "true");
  }
}

function boardPoint(coord: Coord): ViewportPoint {
  const size = state.board.length;
  const frame = boardElement.getBoundingClientRect();
  const first = boardElement.children[0].getBoundingClientRect();
  const last = boardElement.children[size * size - 1].getBoundingClientRect();
  const firstX = first.left + first.width / 2;
  const firstY = first.top + first.height / 2;
  return {
    x: (firstX - frame.left + coord.col * (last.left + last.width / 2 - firstX) / (size - 1)) / frame.width * 100,
    y: (firstY - frame.top + coord.row * (last.top + last.height / 2 - firstY) / (size - 1)) / frame.height * 100,
  };
}

function drawPath(path: readonly PathPoint[]): void {
  const points = path.map((point) => {
    const { x, y } = boardPoint(point);
    return `${x},${y}`;
  }).join(" ");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", points);
  line.setAttribute("vector-effect", "non-scaling-stroke");
  pathLayer.append(line);
  removeAfterAnimation(line);
}

function clearBoardEffects(): void {
  pathLayer.replaceChildren();
  particleLayer.replaceChildren();
}

function clearBattleEffects(): void {
  lightningEffects.cancel();
  chargeEffects.cancel();
  psychicEffects.cancel();
  sonicEffects.cancel();
  sprayEffects.cancel();
  bananaEffects.cancel();
  candyEffects.cancel();
  netEffects.cancel();
  battleEffects.replaceChildren();
  battleText.clear();
  transferLayer.replaceChildren();
  battlefield.classList.remove("is-ultimate-impact");
  bossElement.classList.remove("is-hit", "is-ultimate-hit", "is-defeated");
}

function clearUltimateCinematic(): void {
  ultimateCinematic.cancel();
  shell.classList.remove("is-ultimate-cinematic");
}

function showUltimateImpact(): void {
  if (reducedMotionQuery.matches) return;
  const flash = document.createElement("i");
  flash.className = "ultimate-flash";
  transferLayer.append(flash);
  removeAfterAnimation(flash);
  battlefield.classList.add("is-ultimate-impact");
}

function createParticles(coords: readonly Coord[]): void {
  if (reducedMotionQuery.matches) return;
  const fragment = document.createDocumentFragment();
  for (const coord of coords) {
    const position = boardPoint(coord);
    for (let index = 0; index < 7; index += 1) {
      const particle = document.createElement("i");
      particle.className = "particle";
      particle.style.left = `${position.x}%`;
      particle.style.top = `${position.y}%`;
      particle.style.setProperty("--particle-x", `${(Math.random() - 0.5) * 58}px`);
      particle.style.setProperty("--particle-y", `${-12 - Math.random() * 42}px`);
      particle.style.setProperty("--particle-delay", `${Math.random() * 70}ms`);
      fragment.append(particle);
      removeAfterAnimation(particle);
    }
  }
  particleLayer.append(fragment);
}

function pairViewportCenter(first: Coord, second: Coord): ViewportPoint {
  const firstRect = getTile(first)?.getBoundingClientRect();
  const secondRect = getTile(second)?.getBoundingClientRect();
  if (!firstRect || !secondRect) {
    const boardRect = boardElement.getBoundingClientRect();
    return { x: boardRect.left + boardRect.width / 2, y: boardRect.top + boardRect.height / 2 };
  }
  return {
    x: (firstRect.left + firstRect.width / 2 + secondRect.left + secondRect.width / 2) / 2,
    y: (firstRect.top + firstRect.height / 2 + secondRect.top + secondRect.height / 2) / 2,
  };
}

function removeAfterAnimation(element: Element): void {
  const remove = (event: Event): void => {
    if (event.target === element) element.remove();
  };
  element.addEventListener("animationend", remove);
  element.addEventListener("animationcancel", remove);
}

function animateRecruitTransfer(characterId: CharacterId, origin: ViewportPoint): void {
  if (reducedMotionQuery.matches) return;
  const target = getUnitElement(characterId)?.querySelector<HTMLElement>(".team-avatar")?.getBoundingClientRect();
  if (!target) return;
  const character = getCharacter(characterId);
  const avatar = document.createElement("img");
  const size = Math.max(24, Math.min(44, target.width));
  avatar.className = "flying-avatar";
  avatar.src = character.imageUrl;
  avatar.alt = "";
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;
  avatar.style.left = `${origin.x - size / 2}px`;
  avatar.style.top = `${origin.y - size / 2}px`;
  avatar.style.setProperty("--transfer-x", `${target.left + target.width / 2 - origin.x}px`);
  avatar.style.setProperty("--transfer-y", `${target.top + target.height / 2 - origin.y}px`);
  transferLayer.append(avatar);
  removeAfterAnimation(avatar);
}

function animateUpgradeTransfer(characterId: CharacterId, origin: ViewportPoint): void {
  if (reducedMotionQuery.matches) return;
  const target = getUnitElement(characterId)?.getBoundingClientRect();
  if (!target) return;
  const energy = document.createElement("i");
  energy.className = "flying-energy";
  energy.style.left = `${origin.x - 7}px`;
  energy.style.top = `${origin.y - 7}px`;
  energy.style.setProperty("--transfer-x", `${target.left + target.width / 2 - origin.x}px`);
  energy.style.setProperty("--transfer-y", `${target.top + target.height / 2 - origin.y}px`);
  transferLayer.append(energy);
  removeAfterAnimation(energy);
}

function animateUnitState(characterId: CharacterId, className: string): void {
  if (reducedMotionQuery.matches) return;
  const unit = getUnitElement(characterId);
  if (!unit || unit.classList.contains(className)) return;
  if (className === "is-attacking" && unit.matches(".is-recruited, .is-upgraded, .is-ultimate")) return;
  unit.classList.remove("is-recruited", "is-upgraded", "is-attacking", "is-ultimate");
  unit.classList.add(className);
}

function showUpgradePop(characterId: CharacterId, damageIncrease: bigint, evolvedStage = 0): void {
  const unit = getUnitElement(characterId);
  if (!unit) return;
  const source = unit.getBoundingClientRect();
  const field = textLayer.getBoundingClientRect();
  const prefix = evolvedStage > 0 ? `进化 ${EVOLUTION_LABELS[evolvedStage]} · 伤害×${2 ** evolvedStage}` : "攻击 +";
  battleText.show(prefix, evolvedStage > 0 ? null : damageIncrease, `unit-upgrade-pop${evolvedStage > 0 ? " is-evolution-pop" : ""}`, source.left + source.width / 2 - field.left, source.top - field.top + 6);
  if (evolvedStage > 0 && !reducedMotionQuery.matches) {
    const avatar = unit.querySelector<HTMLElement>(".team-avatar")!;
    avatar.querySelector(".unit-crown-flash")?.remove();
    const flash = document.createElement("i");
    flash.className = "unit-crown-flash";
    flash.setAttribute("aria-hidden", "true");
    avatar.append(flash);
    removeAfterAnimation(flash);
  }
}

function animateBossHit(isUltimate: boolean): void {
  if (reducedMotionQuery.matches) return;
  // 恢复自动攻击后，普攻不能立刻覆盖尚未结束的大招重击。
  if (!isUltimate && bossElement.classList.contains("is-ultimate-hit")) return;
  const className = isUltimate ? "is-ultimate-hit" : "is-hit";
  if (bossElement.classList.contains(className)) return;
  bossElement.classList.remove("is-hit", "is-ultimate-hit");
  bossElement.classList.add(className);
}

function readBattleLayout(): BattleLayout {
  return { boss: bossElement.getBoundingClientRect(), field: battlefield.getBoundingClientRect() };
}

function showDamageNumber(amount: bigint, isUltimate: boolean, layout: BattleLayout): void {
  const { boss, field } = layout;
  battleText.show(isUltimate ? "大招 −" : "−", amount, isUltimate ? "damage-number damage-ultimate" : "damage-number", boss.left - field.left + boss.width * (0.2 + Math.random() * 0.6), boss.top - field.top + boss.height * (0.3 + Math.random() * 0.4));
}

function waitForActiveTime(durationMs: number): Promise<void> {
  const generation = gameGeneration;
  const startedAt = state.activeElapsedMs;
  return new Promise((resolve) => {
    const step = (): void => {
      if (generation !== gameGeneration || state.phase === "loading") {
        resolve();
        return;
      }
      if (state.phase === "playing" && state.activeElapsedMs - startedAt >= durationMs) resolve();
      else window.setTimeout(step, 100);
    };
    window.setTimeout(step, 100);
  });
}

async function showToast(message: string): Promise<void> {
  toastGeneration += 1;
  const generation = toastGeneration;
  toast.textContent = message;
  toast.hidden = false;
  await waitForActiveTime(1_250);
  if (generation === toastGeneration) toast.hidden = true;
}

function showEvolvedAttack(characterId: CharacterId, stage: number, layout: BattleLayout): void {
  const source = getUnitElement(characterId)?.querySelector<HTMLElement>(".team-avatar")?.getBoundingClientRect();
  if (!source) return;
  const x = source.left + source.width / 2 - layout.field.left;
  const y = source.top + source.height / 2 - layout.field.top;
  const dx = layout.boss.left + layout.boss.width / 2 - layout.field.left - x;
  const dy = layout.boss.top + layout.boss.height / 2 - layout.field.top - y;
  const effect = document.createElement("i");
  effect.className = stage === 1 ? "missile-pulse" : "laser-pulse";
  effect.dataset.evolutionStage = String(stage);
  effect.style.left = `${x}px`;
  effect.style.top = `${y}px`;
  if (stage === 1) {
    effect.style.setProperty("--missile-x", `${dx}px`);
    effect.style.setProperty("--missile-y", `${dy}px`);
    effect.style.setProperty("--missile-angle", `${Math.atan2(dy, dx)}rad`);
  } else {
    effect.style.width = `${Math.hypot(dx, dy)}px`;
    effect.style.setProperty("--beam-angle", `${Math.atan2(dy, dx)}rad`);
  }
  battleEffects.append(effect);
  // 飞弹与激光只承担视觉反馈，结束或取消动画均不再次结算伤害。
  removeAfterAnimation(effect);
}

function resolveWrong(first: Coord, second: Coord): void {
  audio.play("wrong");
  manualComboCount = 0;
  lastManualEliminationAtMs = null;
  setSelected(null);
  const firstTile = getTile(first);
  const secondTile = getTile(second);
  firstTile?.classList.add("is-wrong");
  secondTile?.classList.add("is-wrong");
  announce("这两个角色无法连接");
}

async function takeGeneratedBoard(stage: number): Promise<GeneratedBoard> {
  const generation = gameGeneration;
  const config = BOARD_STAGES[stage];
  const pending = preparedBoard?.stage === stage ? preparedBoard.promise : null;
  preparedBoard = null;
  const generated = (await pending) ?? await boardJobs.generate(config);
  if (generation === gameGeneration) {
    const nextStage = Math.min(stage + 1, BOARD_STAGES.length - 1);
    const promise = boardJobs.prefetch(BOARD_STAGES[nextStage]);
    preparedBoard = promise ? { stage: nextStage, promise } : null;
  }
  return generated;
}

function installBoard(generated: GeneratedBoard, stage: number, preserveBombMode = false): void {
  if (!preserveBombMode) setBombTargeting(false);
  hintGeneration += 1;
  state.board = generated.board;
  state.boardStage = stage;
  state.boardRemaining = countCharacters(generated.board);
  selected = null;
  shell.classList.remove("is-shuffling");
  clearBoardEffects();
  renderBoard();
}

function removeMatchedTile(coord: Coord): void {
  const tile = getTile(coord);
  if (!tile) return;
  const hadFocus = document.activeElement === tile;
  tile.disabled = true;
  tile.classList.remove("is-selected", "is-hinted", "is-wrong");
  tile.classList.add("is-removing");
  if (hadFocus) boardElement.querySelector<HTMLButtonElement>("button.tile:not(:disabled)")?.focus({ preventScroll: true });
}

function getAvailablePair(): AvailablePair | null {
  // 消除只会增加空位；缓存配对的两个端点仍在时，原连线一定仍然有效。
  if (availablePair
    && state.board[availablePair.first.row][availablePair.first.col] !== null
    && state.board[availablePair.second.row][availablePair.second.col] !== null) return availablePair;
  availablePair = findAvailablePair(state.board);
  return availablePair;
}

function recordManualElimination(): void {
  const now = state.activeElapsedMs;
  manualComboCount = lastManualEliminationAtMs === null || now - lastManualEliminationAtMs > COMBO_WINDOW_MS
    ? 1
    : manualComboCount + 1;
  lastManualEliminationAtMs = now;
  if (manualComboCount < 3) return;
  manualComboCount = 0;
  pendingComboHint = true;
}

function visualBombPath(first: Coord, second: Coord): PathPoint[] {
  if (first.row === second.row || first.col === second.col) return [first, second];
  return [first, { row: first.row, col: second.col }, second];
}

function resolveElimination(
  coords: readonly Coord[],
  source: EliminationSource,
  paths: readonly (readonly PathPoint[])[] = [],
  bombCenter?: Coord,
): boolean {
  advanceToNow();
  if (source === "boss-auto") {
    if (!session.owned || lifecycleSuspended || !isForeground() || !canEliminate(state)) return false;
  } else if (!canUseBoard()) return false;
  const selectedCharacter = selected ? state.board[selected.row]?.[selected.col] ?? null : null;
  const origins = new Map<CharacterId, ViewportPoint>();
  for (const coord of coords) {
    const id = state.board[coord.row]?.[coord.col];
    if (isCharacterCell(id) && !origins.has(id)) origins.set(id, pairViewportCenter(coord, coord));
  }
  const result = commitElimination(state, coords, source, {
    reducedMotion: reducedMotionQuery.matches,
    playCinematics: preferences.ultimateCinematics,
  });
  if (!result) return false;
  const killedBoss = hasBossKill(result.effects);
  persist(true, killedBoss);
  syncBattleProgress(result.effects);
  preserveBombModeDuringSettlement = source === "boss-auto" && bombTargeting;
  if (source !== "boss-auto"
    || !selectedCharacter
    || !selected
    || state.board[selected.row]?.[selected.col] !== selectedCharacter) setSelected(null);
  hintGeneration += 1;
  boardElement.querySelectorAll(".is-hinted").forEach((tile) => tile.classList.remove("is-hinted"));
  for (const coord of coords) removeMatchedTile(coord);
  for (const path of paths) drawPath(path);
  createParticles(coords);
  if (bombCenter) showBombExplosion(bombCenter);
  audio.play(source === "bomb" ? "bomb" : "match");
  renderTeam();
  for (const { characterId, before, level } of result.gains) {
    const origin = origins.get(characterId)!;
    if (unitUnavailable(state, characterId)) {
      announce(`${getCharacter(characterId).name}被策反，等级${level}，抵挡额度耗尽后归队`);
      continue;
    }
    if (before === 0) {
      animateRecruitTransfer(characterId, origin);
      animateUnitState(characterId, "is-recruited");
    } else {
      animateUpgradeTransfer(characterId, origin);
      animateUnitState(characterId, "is-upgraded");
    }
    const stage = evolutionStage(level);
    const evolved = stage > evolutionStage(before);
    if (level > Math.max(1, before)) showUpgradePop(characterId, normalAttackDamage(level) - normalAttackDamage(Math.max(1, before)), evolved ? stage : 0);
    announce(`${getCharacter(characterId).name}${before ? "升到" : "加入战队，等级"}${level}级${evolved ? `，进化${stage}阶` : ""}`);
  }
  if (source === "manual") recordManualElimination();
  presentEffects(result.effects);
  syncBattleView();
  pumpBoardSettlement();
  prepareCurrentCinematic();
  return true;
}

function setBombTargeting(active: boolean): void {
  bombTargeting = active;
  shell.classList.toggle("is-bomb-targeting", active);
  if (active) {
    setSelected(null);
    hintGeneration += 1;
    boardElement.querySelectorAll(".is-hinted").forEach((tile) => tile.classList.remove("is-hinted"));
    // 退场棋子在逻辑上已经是空格，选点时也必须可以把这里作为爆心。
    boardElement.querySelectorAll<HTMLButtonElement>(".is-removing").forEach((tile) => {
      const coord = tileCoord(tile);
      if (coord) tile.replaceWith(createEmptyTile(coord));
    });
  }
  boardElement.querySelectorAll<HTMLButtonElement>(".tile-empty").forEach((tile) => { tile.disabled = !active; });
  updateControls();
}

function toggleBomb(): void {
  advanceToNow();
  if (!canUseBoard() || state.bombCount === 0) return;
  setBombTargeting(!bombTargeting);
  if (bombTargeting) {
    announce("请选择炸弹落点；再次点击炸弹或按Esc取消");
    boardElement.querySelector<HTMLButtonElement>("button.tile:not(:disabled)")?.focus({ preventScroll: true });
  } else announce("已取消炸弹，库存未消耗");
}

function showBombExplosion(center: Coord): void {
  const point = boardPoint(center);
  const burst = document.createElement("i");
  burst.className = "bomb-blast";
  burst.style.left = `${point.x}%`;
  burst.style.top = `${point.y}%`;
  burst.style.width = `${250 / state.board.length}%`;
  particleLayer.append(burst);
  removeAfterAnimation(burst);
}

async function useBombAt(coord: Coord): Promise<void> {
  if (!bombTargeting || !canUseBoard() || state.bombCount === 0) return;
  const selection = selectBombTiles(state.board, coord);
  if (!selection || selection.removed.length === 0) {
    announce("这里没有可成对消除的棋子，请重新选择，炸弹未消耗");
    void showToast("请选择有棋子的爆炸范围");
    return;
  }
  setBombTargeting(false);
  const paths = selection.pairs.map(({ first, second }) => visualBombPath(first, second));
  resolveElimination(selection.removed, "bomb", paths, coord);
}

function tileCoord(button: HTMLButtonElement): Coord | null {
  const row = Number(button.dataset.row);
  const col = Number(button.dataset.col);
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null;
}

async function handleTileSelection(coord: Coord): Promise<void> {
  advanceToNow();
  if (!canUseBoard()) return;
  if (bombTargeting) {
    await useBombAt(coord);
    return;
  }
  const selectedId = state.board[coord.row][coord.col];
  if (!isCharacterCell(selectedId)) return;
  shell.classList.remove("is-shuffling");
  audio.play("click");

  if (!selected) {
    setSelected(coord);
    announce(`已选择${getCharacter(selectedId).name}`);
    return;
  }

  if (sameCoord(selected, coord)) {
    setSelected(null);
    announce("已取消选择");
    return;
  }

  const first = selected;
  const firstId = state.board[first.row][first.col];
  const secondId = state.board[coord.row][coord.col];
  const path = firstId === secondId ? findPath(state.board, first, coord) : null;
  if (!path) {
    resolveWrong(first, coord);
    return;
  }
  resolveElimination([first, coord], "manual", [path]);
}

async function useHint(): Promise<void> {
  advanceToNow();
  if (!canUseBoard() || bombTargeting || state.hintsRemaining <= 0) return;
  const pair = getAvailablePair();
  if (!pair) return;
  audio.play("click");
  state.hintsRemaining -= 1;
  persist(true);
  await showPairHint(pair);
}

async function showPairHint(pair: AvailablePair): Promise<void> {
  hintGeneration += 1;
  const generation = hintGeneration;
  boardElement.querySelectorAll(".is-hinted").forEach((tile) => tile.classList.remove("is-hinted"));
  const firstTile = getTile(pair.first);
  const secondTile = getTile(pair.second);
  firstTile?.classList.add("is-hinted");
  secondTile?.classList.add("is-hinted");
  updateControls();
  const id = state.board[pair.first.row][pair.first.col];
  if (isCharacterCell(id)) announce(`提示：${getCharacter(id).name}有一组可连接配对`);
  await waitForActiveTime(1_500);
  if (generation === hintGeneration) {
    firstTile?.classList.remove("is-hinted");
    secondTile?.classList.remove("is-hinted");
  }
}

function ensureBoardSettlement(): void {
  if (state.boardSettlement) return;
  state.boardSettlement = {
    id: state.nextEventId++, phase: "waiting", kind: "check", targetStage: state.boardStage, board: null,
  };
  persist(true);
  updateControls();
  pumpBoardSettlement();
}

function bossEliminationDelay(pending: number): number {
  if (pending > 20) return 100;
  if (pending > 5) return 200;
  return 350;
}

function pumpBossEliminations(): void {
  if (state.pendingBossEliminations === 0) {
    lastBossEliminationAt = -Infinity;
    return;
  }
  if (!isForeground() || mainDialogOpen() || !session.owned || lifecycleSuspended || !canEliminate(state)) return;
  const now = performance.now();
  if (now - lastBossEliminationAt < bossEliminationDelay(state.pendingBossEliminations)) return;
  const pair = findRandomAvailablePair(state.board);
  if (!pair) {
    ensureBoardSettlement();
    return;
  }
  if (!resolveElimination([pair.first, pair.second], "boss-auto", [pair.path])) return;
  lastBossEliminationAt = performance.now();
  updateControls();
}

function pumpComboHint(): void {
  if (!pendingComboHint
    || state.pendingBossEliminations > 0
    || state.lightningRuns.some((run) => !run.hasHit)
    || state.chargeRuns.some((run) => !run.hasHit)
    || state.psychicRuns.some((run) => !run.hasHit)
    || state.sonicRuns.some((run) => !run.hasHit)
    || state.sprayRuns.some((run) => !run.hasHit)
    || state.bananaRuns.some((run) => !run.hasHit)
    || state.candyRuns.some((run) => !run.hasHit)
    || state.netRuns.some((run) => !run.hasHit)
    || !isForeground()
    || mainDialogOpen()
    || !canUseBoard()) return;
  const pair = findRandomAvailablePair(state.board);
  if (!pair) {
    ensureBoardSettlement();
    return;
  }
  pendingComboHint = false;
  audio.play("click");
  void showPairHint(pair);
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    const timeout = window.setTimeout(() => resolve(), 5_000);
    const finish = (): void => { window.clearTimeout(timeout); resolve(); };
    image.src = url;
    if (typeof image.decode === "function") void image.decode().then(finish, finish);
    else {
      image.addEventListener("load", finish, { once: true });
      image.addEventListener("error", finish, { once: true });
    }
  });
}

function focusNextTile(current: HTMLButtonElement, rowDelta: number, colDelta: number): void {
  const coord = tileCoord(current);
  if (!coord) return;
  let row = coord.row;
  let col = coord.col;
  for (let step = 0; step < state.board.length; step += 1) {
    row = (row + rowDelta + state.board.length) % state.board.length;
    col = (col + colDelta + state.board.length) % state.board.length;
    const next = getTile({ row, col });
    if (next) {
      next.focus({ preventScroll: true });
      return;
    }
  }
}

boardElement.addEventListener("pointerdown", (event) => {
  if (!event.isPrimary || event.button !== 0 || boardElement.inert) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.tile:not(:disabled)");
  const coord = button ? tileCoord(button) : null;
  if (!button || !coord) return;
  event.preventDefault();
  button.focus({ preventScroll: true });
  void handleTileSelection(coord);
});

boardElement.addEventListener("click", (event) => {
  // 指针已在按下时处理；保留键盘和辅助技术产生的无指针 click。
  if (event.detail !== 0) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.tile");
  const coord = button ? tileCoord(button) : null;
  if (coord) void handleTileSelection(coord);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !bombTargeting || !canUseBoard()) return;
  event.preventDefault();
  setBombTargeting(false);
  bombButton.focus({ preventScroll: true });
  announce("已取消炸弹，库存未消耗");
});

boardElement.addEventListener("animationend", (event) => {
  const tile = event.target;
  if (!(tile instanceof HTMLButtonElement) || !tile.classList.contains("tile")) return;
  if (event.animationName === "tile-remove") {
    const coord = tileCoord(tile);
    if (coord) tile.replaceWith(createEmptyTile(coord));
  }
  else if (event.animationName === "wrong-flash") tile.classList.remove("is-wrong");
  else if (event.animationName === "shuffle-pop") shell.classList.remove("is-shuffling");
});

boardElement.addEventListener("keydown", (event) => {
  if (!canUseBoard()) return;
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button.tile");
  if (!button) return;
  const directions: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowRight: [0, 1],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
  };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    focusNextTile(button, direction[0], direction[1]);
  }
});

hintButton.addEventListener("click", () => void useHint());
bombButton.addEventListener("click", toggleBomb);

function finishBattleAnimation(event: AnimationEvent): void {
  if (event.target === battlefield && event.animationName === "battlefield-impact") {
    battlefield.classList.remove("is-ultimate-impact");
  } else if (event.target === bossElement) {
    if (event.animationName === "boss-hit") bossElement.classList.remove("is-hit");
    else if (event.animationName === "boss-ultimate-hit") bossElement.classList.remove("is-ultimate-hit");
  } else if (event.target instanceof HTMLElement && event.target.classList.contains("team-unit")) {
    const classes: Record<string, string> = {
      "unit-recruit": "is-recruited",
      "unit-upgrade": "is-upgraded",
      "unit-attack": "is-attacking",
      "unit-ultimate": "is-ultimate",
    };
    const className = classes[event.animationName];
    if (className) event.target.classList.remove(className);
  }
}

battlefield.addEventListener("animationend", finishBattleAnimation);
battlefield.addEventListener("animationcancel", finishBattleAnimation);


function reportSaveNotice(message: string): void {
  saveNotice.textContent = message;
  saveNotice.hidden = false;
  if (!sessionPanel.hidden) sessionPanel.querySelector("p")!.textContent = message;
}

function formatRankScore(score: number): string {
  const formatted = new Intl.NumberFormat("zh-CN").format(Math.min(score, LEADERBOARD_SCORE_MAX));
  return score >= LEADERBOARD_SCORE_MAX ? `${formatted}+` : formatted;
}

function createRankPosition(rank: number): HTMLSpanElement {
  const position = document.createElement("span");
  position.className = rank <= 3 ? `rank-position rank-medal rank-medal-${rank}` : "rank-position rank-position-plain";
  position.textContent = String(rank);
  position.setAttribute("aria-label", `第${rank}名`);
  return position;
}

function createRankAvatar(url: string | null, fallback: string): HTMLSpanElement {
  const avatar = document.createElement("span");
  avatar.className = "rank-avatar";
  if (!url) {
    avatar.classList.add("rank-avatar-placeholder");
    avatar.textContent = fallback;
    avatar.setAttribute("aria-hidden", "true");
    return avatar;
  }
  const image = document.createElement("img");
  image.src = url;
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    avatar.replaceChildren(fallback);
    avatar.classList.add("rank-avatar-placeholder");
  }, { once: true });
  avatar.append(image);
      const tombstone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tombstone.setAttribute("viewBox", "0 0 40 40");
      tombstone.setAttribute("aria-hidden", "true");
      tombstone.classList.add("unit-tombstone");
      tombstone.innerHTML = `<path d="M10 32V16a10 10 0 0 1 20 0v16" fill="#b6b9c5" stroke="#515361" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M13 29V16a7 7 0 0 1 7-7" fill="none" stroke="#e8e9ef" stroke-width="2" stroke-linecap="round"/>
        <path d="M17 18h6m-3-3v8" fill="none" stroke="#666977" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M7 32h26v4H7z" fill="#969baa" stroke="#515361" stroke-width="2.5" stroke-linejoin="round"/>`;
      avatar.append(tombstone);
  return avatar;
}

function renderMyRank(data: Pick<LeaderboardData, "mine" | "profile"> | null): void {
  const profile = data?.profile ?? leaderboards.currentProfile;
  const mine = data?.mine ?? null;
  const ranked = Boolean(profile && mine?.ranked);
  const position = ranked ? createRankPosition(mine!.rank) : document.createElement("span");
  if (!ranked) {
    position.className = "rank-position rank-position-plain rank-position-unranked";
    position.textContent = !profile ? "—" : mine ? "未上榜" : "暂不可用";
  }
  const avatar = createRankAvatar(profile?.avatar ?? null, "我");
  const name = document.createElement("span");
  name.className = "rank-name";
  name.textContent = profile?.nickname ?? "登录并授权后查看我的排名";
  const score = document.createElement("strong");
  score.className = "rank-score";
  if (profile && mine?.ranked) score.textContent = formatRankScore(mine.score);
  else if (profile) {
    const local = rankingBoard === 1 ? BigInt(state.bossKillCount) : teamPower(state);
    score.textContent = local >= BigInt(LEADERBOARD_SCORE_MAX)
      ? `${new Intl.NumberFormat("zh-CN").format(LEADERBOARD_SCORE_MAX)}+`
      : new Intl.NumberFormat("zh-CN").format(Number(local));
  } else score.textContent = "—";
  myRankElement.replaceChildren(position, avatar, name, score);
}

function renderRanking(data: LeaderboardData): void {
  const fragment = document.createDocumentFragment();
  for (const item of data.items) {
    const row = document.createElement("li");
    row.className = "ranking-row";
    if (data.profile && data.mine?.ranked && item.rank === data.mine.rank) row.classList.add("is-current-user");
    const name = document.createElement("span");
    name.className = "rank-name";
    name.textContent = item.nickname || "匿名玩家";
    name.title = item.nickname || "匿名玩家";
    const score = document.createElement("strong");
    score.className = "rank-score";
    score.textContent = formatRankScore(item.score);
    row.append(createRankPosition(item.rank), createRankAvatar(item.avatar || null, "黄"), name, score);
    fragment.append(row);
  }
  rankingList.replaceChildren(fragment);
  rankingStatus.hidden = data.items.length > 0;
  rankingStatus.textContent = data.items.length ? "" : "暂无上榜玩家";
  renderMyRank(data);
}

async function loadRanking(requestProfile: boolean): Promise<void> {
  const generation = ++rankingLoadGeneration;
  rankingList.replaceChildren();
  rankingStatus.hidden = false;
  rankingStatus.textContent = "正在加载排行榜…";
  renderMyRank(null);
  try {
    if (requestProfile) await leaderboards.authorize();
    const data = await leaderboards.load(rankingBoard, state);
    if (generation !== rankingLoadGeneration || !rankingDialog.open) return;
    renderRanking(data);
  } catch {
    if (generation !== rankingLoadGeneration || !rankingDialog.open) return;
    rankingStatus.hidden = false;
    rankingStatus.textContent = "排行榜暂时无法加载，请关闭后重新打开。";
    renderMyRank({ mine: null, profile: leaderboards.currentProfile });
  }
}

function syncPreferenceControls(): void {
  volumeSlider.value = String(preferences.volume);
  volumeOutput.value = `${preferences.volume}%`;
  volumeOutput.textContent = `${preferences.volume}%`;
  ultimateCinematicsToggle.checked = preferences.ultimateCinematics;
}

function updatePreferences(next: GamePreferences): void {
  preferences = next;
  savePreferences(preferences);
  audio.setVolume(preferences.volume / 100);
  syncPreferenceControls();
}

function renderAuthorLoading(): void {
  authorAvatar.className = "author-avatar author-avatar-placeholder";
  authorAvatar.textContent = "作";
  authorName.textContent = "正在加载…";
  authorStatus.hidden = false;
  authorStatus.textContent = "正在获取作者资料…";
}

function renderAuthorProfile(profile: ToyAuthorProfile): void {
  const image = new Image();
  image.alt = "";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    authorAvatar.className = "author-avatar author-avatar-placeholder";
    authorAvatar.textContent = "作";
  }, { once: true });
  image.src = profile.avatar;
  authorAvatar.className = "author-avatar";
  authorAvatar.replaceChildren(image);
  authorName.textContent = profile.nickname || "本 Toy 作者";
  authorStatus.hidden = true;
  authorStatus.textContent = "";
}

async function loadAuthorPanel(): Promise<void> {
  const generation = ++authorLoadGeneration;
  if (cachedAuthorProfile) renderAuthorProfile(cachedAuthorProfile);
  else renderAuthorLoading();
  const sdk = getToySdk();
  if (!sdk) {
    authorNavigateSupported = false;
    updateControls();
    if (!cachedAuthorProfile) {
      authorName.textContent = "作者资料暂不可用";
      authorStatus.textContent = "当前环境未提供 Toy SDK，请关闭后重试。";
    }
    return;
  }
  const [profileSupported, navigateSupported] = await Promise.all([
    sdk.isSupport("getAuthorProfile").catch(() => false),
    sdk.isSupport("navigate").catch(() => false),
  ]);
  if (generation !== authorLoadGeneration || !interactionDialog.open) return;
  authorNavigateSupported = navigateSupported;
  updateControls();
  if (cachedAuthorProfile || !profileSupported) {
    if (!cachedAuthorProfile) {
      authorName.textContent = "作者资料暂不可用";
      authorStatus.hidden = false;
      authorStatus.textContent = "当前环境不支持读取作者资料，请关闭后重试。";
    }
    return;
  }
  try {
    const result = await sdk.getAuthorProfile();
    if (generation !== authorLoadGeneration || !interactionDialog.open) return;
    if (result.status !== "ok" || !result.data || typeof result.data.nickname !== "string" || typeof result.data.avatar !== "string") {
      throw new Error("作者资料不可用");
    }
    cachedAuthorProfile = result.data;
    renderAuthorProfile(cachedAuthorProfile);
  } catch {
    if (generation !== authorLoadGeneration || !interactionDialog.open) return;
    authorName.textContent = "作者资料暂不可用";
    authorStatus.hidden = false;
    authorStatus.textContent = "作者资料加载失败，请关闭后重试。";
  }
}

function refreshInteractionRewards(refreshAfterPending = false): Promise<void> {
  if (!session.owned || lifecycleSuspended || state.phase !== "playing") return Promise.resolve();
  const generation = gameGeneration;
  if (interactionRequest?.generation === generation) {
    // 返回时可能仍是离开前的查询；合并返回事件，并在完成后再确认一次。
    interactionRequest.refreshAfter ||= refreshAfterPending;
    return interactionRequest.promise;
  }
  const current = (): boolean => generation === gameGeneration && session.owned && !lifecycleSuspended && state.phase === "playing";
  const apply = async (key: "triple" | "following", read: () => Promise<boolean>): Promise<void> => {
    try {
      const achieved = await read();
      if (!current()) return;
      if (achieved && !state.interactionRewards[key]) {
        state.interactionRewards[key] = true;
        if (key === "triple") state.hintsRemaining += 3;
        else state.bombCount += 1;
        persist(true, true);
        updateControls();
        if (isForeground()) showToast(key === "triple" ? "三连奖励：已补发 3 个提示" : "关注奖励：已补发 1 个炸弹");
      }
    } catch {
      // 查询失败不影响游戏，后续打开面板或返回页面时自动重试。
    }
  };
  const request = { generation, promise: Promise.resolve(), refreshAfter: false };
  interactionRequest = request;
  request.promise = Promise.allSettled([
    apply("triple", readTriple),
    apply("following", readFollowing),
  ]).then(() => {
    if (interactionRequest !== request) return;
    interactionRequest = null;
    if (request.refreshAfter && current()) void refreshInteractionRewards();
  });
  return request.promise;
}

function visibleTrigger(preferred: HTMLButtonElement | null, buttons: readonly HTMLButtonElement[]): HTMLButtonElement | undefined {
  return preferred && getComputedStyle(preferred).display !== "none"
    ? preferred
    : buttons.find((button) => getComputedStyle(button).display !== "none");
}

function mainDialogOpen(): boolean {
  return rankingDialog.open || settingsDialog.open || interactionDialog.open;
}

function choosePendingReset(): Promise<boolean> {
  return new Promise((resolve) => {
    const restore = document.querySelector<HTMLButtonElement>("#cloud-reset-restore")!;
    const apply = document.querySelector<HTMLButtonElement>("#cloud-reset-apply")!;
    let settled = false;
    const finish = (useLocalReset: boolean): void => {
      if (settled) return;
      settled = true;
      cloudResetDialog.close();
      restore.onclick = null;
      apply.onclick = null;
      resolve(useLocalReset);
    };
    restore.onclick = () => finish(false);
    apply.onclick = () => finish(true);
    cloudResetDialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); }, { once: true });
      cloudResetDialog.showModal();
  });
}

interface StartupSelection {
  saved: GameState | null;
  uploadImmediately: boolean;
}

async function selectStartupSave(local: GameState | null): Promise<StartupSelection> {
  cloud.deactivate();
  let result: CloudReadResult;
  try {
    result = await withCloudTimeout(cloud.read());
  } catch {
    reportSaveNotice("云存档暂时不可用，已进入本地模式；本次不会覆盖云端进度。");
    return { saved: local, uploadImmediately: false };
  }
  if (result.kind === "unavailable") {
    reportSaveNotice("当前环境无法使用云存档，已使用本地进度。");
    return { saved: local, uploadImmediately: false };
  }
  const pending = cloud.pendingReset;
  cloud.activate(result);
  if (cloud.rankEnabled) leaderboards.restoreEnabled();
  if (result.kind === "empty") return { saved: local, uploadImmediately: true };
  if (!pending) return { saved: result.snapshot.state, uploadImmediately: false };
  const sameArchive = pending.archiveId !== null && pending.archiveId === result.snapshot.manifest.archiveId;
  const useLocalReset = sameArchive || await choosePendingReset();
  if (useLocalReset) return { saved: local, uploadImmediately: true };
  cloud.clearPendingReset();
  return { saved: result.snapshot.state, uploadImmediately: false };
}

function resetClock(): void {
  lastTickTime = performance.now();
  lastWallTime = Date.now();
}

function persist(force = false, immediateCloud = false): void {
  if (!session.owned || state.phase !== "playing") return;
  const now = performance.now();
  if (!force && now - lastSavedAt < 1_000) return;
  saves.save(state);
  cloud.schedule(state, immediateCloud);
  lastSavedAt = now;
}

function showSessionBlocked(): void {
  gameGeneration += 1;
  state.phase = "blocked";
  audio.stopAll();
  audio.setMuted(true);
  clearBattleEffects();
  clearUltimateCinematic();
  loadingPanel.hidden = true;
  sessionPanel.hidden = false;
  shell.classList.remove("is-loading", "is-ultimate-cinematic", "is-boss-reviving");
  shell.dataset.phase = "blocked";
  bossSkillView.sync(state);
  updateControls();
}

function syncBattleView(): void {
  if (renderedBoard !== state.board) {
    setSelected(null);
    hintGeneration++;
    clearBoardEffects();
    renderBoard();
  }
  const availability = [...state.bossSkills.exiled, ...state.bossSkills.shields.map((shield) => shield.characterId)].join("|")
    + ":" + state.bossSkills.exiled.join("|");
  if (availability !== lastAvailability) {
    lastAvailability = availability;
    renderTeam();
  }
  bossSkillView.sync(state);
  const cinematic = state.ultimateBatch !== null;
  const reviving = state.bossReviveRemainingMs > 0;
  shell.classList.toggle("is-ultimate-cinematic", cinematic);
  shell.classList.toggle("is-boss-reviving", reviving);
  shell.classList.toggle("is-suspended", lifecycleSuspended);
  if (reviving && !bossElement.classList.contains("is-defeated")) {
    bossElement.style.animationDelay = `-${900 - state.bossReviveRemainingMs}ms`;
    bossElement.classList.add("is-defeated");
  } else if (!reviving) {
    bossElement.classList.remove("is-defeated");
    bossElement.style.animationDelay = "";
  }
  audio.setMuted(!isForeground());
  audio.setPaused(reviving || lifecycleSuspended);
  updateBossHud();
}

function presentEffects(effects: readonly BattleEffect[], present = isForeground()): void {
  if (!present) return;
  for (const effect of effects) {
    if (effect.kind === "attack") {
      if (unitUnavailable(state, effect.characterId)) continue;
      const stage = evolutionStage(effect.level);
      if (stage) showEvolvedAttack(effect.characterId, stage, readBattleLayout());
      else animateUnitState(effect.characterId, "is-attacking");
    } else if (effect.kind === "hit") {
      const ultimateEffect = getCharacter(effect.characterId).ultimate.effect;
      if (effect.ultimate && (ultimateEffect === "charge" || ultimateEffect === "psychic" || ultimateEffect === "sonic" || ultimateEffect === "spray" || ultimateEffect === "candy" || ultimateEffect === "net")) showUltimateImpact();
      animateBossHit(effect.ultimate && ultimateEffect !== "banana");
      showDamageNumber(effect.amount, effect.ultimate, readBattleLayout());
      audio.play(effect.ultimate ? "ultimate-impact" : "attack");
    } else if (effect.kind === "cast") {
      audio.playUltimate();
    } else if (effect.kind === "cinematic") {
      const character = getCharacter(effect.characterId);
      announce(`${character.name}释放${character.ultimate.name}`);
    } else if (effect.kind === "ultimate-field") {
      for (const id of effect.soundCharacters) audio.playUltimateField(getCharacter(id).ultimate.soundUrl);
      for (const id of effect.characters) animateUnitState(id, "is-ultimate");
      if (effect.characters.length) showUltimateImpact();
    } else if (effect.kind === "revive-start") {
      audio.setPaused(true);
      announce(`击败火山哥，获得1颗炸弹，现有${state.bombCount}颗`);
    } else if (effect.kind === "boss-laser") {
      audio.play("boss-laser");
    } else if (effect.kind === "boss-skill") {
      setSelected(null);
      hintGeneration++;
      boardElement.querySelectorAll(".is-hinted").forEach((tile) => tile.classList.remove("is-hinted"));
      announce(`火山哥释放${BOSS_SKILL_NAMES[effect.stage]}`);
    } else if (effect.kind === "shield-hit") {
      announce(`${getCharacter(effect.characterId).name}为火山哥抵挡${formatInteger(effect.amount)}伤害`);
    } else if (effect.kind === "revive-end") {
      audio.setPaused(false);
      announce(`火山哥满血复活，最大生命提升至${formatInteger(state.bossMaxHp)}`);
    }
  }
}

function advanceToNow(): void {
  const mono = performance.now();
  const wall = Date.now();
  const delta = mono - lastTickTime;
  const wallDelta = wall - lastWallTime;
  lastTickTime = mono;
  lastWallTime = wall;
  if (lifecycleSuspended || !session.owned || state.phase !== "playing") return;
  // 明确休眠/改钟或超过两分钟的未知空档不产生收益，也不推进演出。
  const admissible = delta >= 0 && delta <= 120_000 && wallDelta >= 0 && wallDelta <= 120_000 && Math.abs(wallDelta - delta) < 1_000;
  const effects = advanceBattle(state, admissible ? Math.round(delta) : 0, {
    playCinematics: preferences.ultimateCinematics,
  });
  if (effects.length) persist(true, hasBossKill(effects));
  else persist();
  syncBattleProgress(effects);
  // 大段后台补推进仅更新现状，避免返回时重放过去的特效和声音。
  presentEffects(effects, isForeground() && admissible && delta <= 250);
  syncBattleView();
  if (!admissible || delta > 250) updateBattleEnergy(true);
}

function prepareCurrentCinematic(): void {
  const batch = state.ultimateBatch;
  if (!batch || batch.phase !== "preparing" || lifecycleSuspended || !session.owned) {
    preparingId = null;
    return;
  }
  const cast = batch.casts[batch.index];
  if (preparingId === cast.id) return;
  preparingId = cast.id;
  const generation = gameGeneration;
  const accept = (): void => {
    if (generation !== gameGeneration || lifecycleSuspended || !session.owned || state.phase !== "playing") return;
    advanceToNow();
    const effects = acceptImageReady(state, cast.id);
    if (effects.length) {
      persist(true);
      presentEffects(effects);
      syncBattleView();
    }
  };
  const character = getCharacter(cast.characterId);
  if (ultimateCinematic.ready(character)) accept();
  else void ultimateCinematic.prepare(character).then((ready) => { if (ready) accept(); });
}

function pumpBoardSettlement(): void {
  if (!canAdvanceBattle()) return;
  const task = state.boardSettlement;
  if (!task) return;
  if (task.phase === "waiting") {
    if (remainingTileCount(state.board) === 0) {
      task.kind = "next";
      task.targetStage = Math.min(state.boardStage + 1, BOARD_STAGES.length - 1);
    } else if (!getAvailablePair()) {
      task.kind = "shuffle";
      task.targetStage = state.boardStage;
    } else {
      state.boardSettlement = null;
      preserveBombModeDuringSettlement = false;
      persist(true);
      updateControls();
      return;
    }
    task.phase = "generating";
    persist(true);
  }
  if (task.phase === "ready" && task.board) {
    const matrix = task.board;
    state.boardSettlement = null;
    boardRequestId = null;
    if (task.kind === "next") {
      state.hintsRemaining += HINT_COUNT;
      installBoard(
        { board: matrix, config: BOARD_STAGES[task.targetStage] },
        task.targetStage,
        preserveBombModeDuringSettlement,
      );
      announce(`${matrix.length}乘${matrix.length}的新棋盘已经生成，战队继续进攻`);
    } else {
      const selectedCharacter = selected ? state.board[selected.row]?.[selected.col] ?? null : null;
      state.board = matrix;
      if (!selectedCharacter
        || !selected
        || state.board[selected.row]?.[selected.col] !== selectedCharacter) setSelected(null);
      hintGeneration += 1;
      clearBoardEffects();
      renderBoard();
      if (task.kind !== "boss-shuffle") shell.classList.add("is-shuffling");
      if (task.kind === "boss-shuffle") {
        if (state.bossSkills.active?.stage === 1) state.bossSkills.active.applied = true;
        bossSkillView.sync(state);
      } else if (isForeground()) void showToast("没有可消配对，已自动洗牌");
    }
    preserveBombModeDuringSettlement = false;
    persist(true);
    updateControls();
    return;
  }
  if (task.phase !== "generating" || boardRequestId === task.id) return;
  boardRequestId = task.id;
  const generation = gameGeneration;
  const request = task.kind === "next"
    ? takeGeneratedBoard(task.targetStage).then((generated) => generated.board)
    : boardJobs.shuffle(state.board);
  void request.then((matrix) => {
    if (generation !== gameGeneration || state.boardSettlement?.id !== task.id || lifecycleSuspended || !session.owned) return;
    advanceToNow();
    if (state.boardSettlement?.id !== task.id) return;
    task.board = matrix;
    task.phase = "ready";
    persist(true);
    pumpBoardSettlement();
  }).catch(() => {
    if (generation !== gameGeneration || state.boardSettlement?.id !== task.id) return;
    // 保留原棋盘与待办，恢复或重试时继续，绝不重复成长收益。
    boardRequestId = null;
    reportSaveNotice("棋盘暂时未能生成，正在重试；已有进度已保留。");
  });
}

async function initializeGame(saved: GameState | null): Promise<void> {
  gameGeneration += 1;
  const generation = gameGeneration;
  state = saved ?? createGameState();
  state.phase = "loading";
  bossSkillView.sync(state);
  lifecycleSuspended = false;
  boardRequestId = null;
  preparingId = null;
  preparedBoard = null;
  selected = null;
  bombTargeting = false;
  manualComboCount = 0;
  lastManualEliminationAtMs = null;
  pendingComboHint = false;
  lastBossEliminationAt = -Infinity;
  preserveBombModeDuringSettlement = false;
  hintGeneration += 1;
  toastGeneration += 1;
  lastDpsUpdateAtMs = -Infinity;
  audio.stopAll();
  audio.setPaused(false);
  audio.setMuted(!isForeground());
  clearUltimateCinematic();
  clearBattleEffects();
  clearBoardEffects();
  teamRoster.replaceChildren();
  shell.classList.remove("is-shuffling", "is-boss-reviving", "is-bomb-targeting", "is-suspended");
  shell.classList.add("is-loading");
  shell.dataset.phase = "loading";
  loadingPanel.hidden = false;
  sessionPanel.hidden = true;
  toast.hidden = true;
  updateBossHud();
  updateBattleEnergy(true);
  renderTeam();
  const [generated] = await Promise.all([
    saved ? Promise.resolve(null) : takeGeneratedBoard(0),
    audio.preloadMatch(),
    audio.preloadBomb(),
    audio.preloadBossSounds(),
    audio.preloadWrong(),
    ...CHARACTERS.map((character) => preloadImage(character.imageUrl)),
    preloadImage(SPRAY_CAN_URL),
    preloadImage(CANNON_URL),
    preloadImage(BANANA_URL),
    preloadImage(JELLYFISH_NET_URL),
    ...CHARACTERS.flatMap((character) => character.ultimate.knife ? [preloadImage(character.ultimate.knife.imageUrl)] : []),
    ...CHARACTERS.flatMap((character) => character.ultimate.vehicle ? [preloadImage(character.ultimate.vehicle.imageUrl)] : []),
    ...CHARACTERS.flatMap((character) => character.ultimate.chew
      ? [preloadImage(character.ultimate.chew.openImageUrl), preloadImage(character.ultimate.chew.closedImageUrl)] : []),
    audio.preloadUltimates(CHARACTERS),
  ]);
  if (generation !== gameGeneration || lifecycleSuspended || !session.owned) return;
  if (generated) installBoard(generated, 0);
  else {
    renderBoard();
    const nextStage = Math.min(state.boardStage + 1, BOARD_STAGES.length - 1);
    const promise = boardJobs.prefetch(BOARD_STAGES[nextStage]);
    preparedBoard = promise ? { stage: nextStage, promise } : null;
  }
  if (reducedMotionQuery.matches) useReducedMotion(state);
  state.phase = "playing";
  shell.dataset.phase = "playing";
  shell.classList.remove("is-loading");
  loadingPanel.hidden = true;
  resetClock();
  persist(true, true);
  void refreshInteractionRewards();
  syncBattleView();
  prepareCurrentCinematic();
  pumpBoardSettlement();
  if (isForeground()) announce(saved ? "已恢复上次游玩进度" : "游戏开始，消除角色组建战队，击败火山哥获取炸弹");
  if (preferences.ultimateCinematics) void ultimateCinematic.preload(CHARACTERS);
}

async function openGame(): Promise<void> {
  if (startupRunning) return;
  startupRunning = true;
  try {
    if (!await session.acquire()) { showSessionBlocked(); return; }
    const selection = await selectStartupSave(saves.load());
    await initializeGame(selection.saved);
    if (selection.uploadImmediately && session.owned && state.phase === "playing") cloud.schedule(state, true);
  } catch {
    showSessionBlocked();
    reportSaveNotice("游戏暂时未能载入，已有存档仍保留，请重新尝试进入。");
  } finally {
    startupRunning = false;
    if (resumeRequested) { resumeRequested = false; void openGame(); }
  }
}

async function startNewGame(): Promise<void> {
  if (!session.owned || startupRunning) return;
  startupRunning = true;
  try {
    cloud.markPendingReset();
    saves.clear();
    await initializeGame(null);
    if (session.owned && state.phase === "playing") cloud.schedule(state, true);
  } catch {
    showSessionBlocked();
    reportSaveNotice("新棋盘暂时未能载入，请重新尝试进入。");
  } finally {
    startupRunning = false;
    if (resumeRequested) { resumeRequested = false; void openGame(); }
  }
}

function updateVisibility(): void {
  // 失焦只改变声音和呈现方式，逻辑状态仍保持 playing。
  audio.setMuted(!isForeground());
  advanceToNow();
  if (!isForeground()) {
    clearBattleEffects();
    ultimateCinematic.cancel();
    clearBoardEffects();
    for (const unit of teamRoster.querySelectorAll<HTMLElement>(".team-unit")) unit.classList.remove("is-recruited", "is-upgraded", "is-attacking", "is-ultimate");
  } else if (state.phase === "playing") {
    // 后台动画无需补播，直接重建当前盘面与演出。
    renderBoard();
    syncBattleView();
    updateBattleEnergy(true);
    void refreshInteractionRewards(true);
    if (interactionDialog.open) {
      void loadAuthorPanel();
    }
  }
  persist(true);
}

function suspendLifecycle(): void {
  if (lifecycleSuspended) return;
  advanceToNow();
  persist(true, true);
  lifecycleSuspended = true;
  gameGeneration += 1;
  audio.stopAll();
  audio.setMuted(true);
  session.release();
  shell.classList.add("is-suspended");
  updateControls();
}

function resumeLifecycle(): void {
  if (!lifecycleSuspended) return;
  resetClock();
  if (startupRunning) resumeRequested = true;
  else void openGame();
}

syncPreferenceControls();
volumeSlider.addEventListener("input", () => {
  const volume = Math.min(100, Math.max(0, Math.round(Number(volumeSlider.value))));
  updatePreferences({ ...preferences, volume });
});
ultimateCinematicsToggle.addEventListener("change", () => {
  updatePreferences({ ...preferences, ultimateCinematics: ultimateCinematicsToggle.checked });
  if (preferences.ultimateCinematics) {
    void audio.prepareUltimate();
    void audio.preloadUltimates(CHARACTERS);
    void ultimateCinematic.preload(CHARACTERS);
  }
});
saveResetButton.addEventListener("click", () => {
  if (!saveResetButton.disabled && !saveResetDialog.open) { saveResetDialog.showModal(); }
});
document.querySelector("#save-reset-cancel")!.addEventListener("click", () => saveResetDialog.close());
document.querySelector("#save-reset-confirm")!.addEventListener("click", () => {
  saveResetDialog.close();
  if (settingsDialog.open) settingsDialog.close();
  void startNewGame();
});
for (const button of rankingButtons) {
  button.addEventListener("click", () => {
    if (button.disabled || mainDialogOpen()) return;
    rankingTrigger = button;
    setBombTargeting(false);
    rankingBoard = 1;
    for (const tab of rankingTabs) {
      const selected = tab.dataset.board === "1";
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
      rankingDialog.showModal();
    void loadRanking(true);
  });
}
rankingClose.addEventListener("click", () => rankingDialog.close());
rankingDialog.addEventListener("close", () => {
  rankingLoadGeneration += 1;
  visibleTrigger(rankingTrigger, rankingButtons)?.focus({ preventScroll: true });
  rankingTrigger = null;
});
for (const tab of rankingTabs) {
  tab.addEventListener("click", () => {
    const board = Number(tab.dataset.board) as LeaderboardBoard;
    if (board !== 1 && board !== 2) return;
    rankingBoard = board;
    for (const item of rankingTabs) {
      const selected = item === tab;
      item.setAttribute("aria-selected", String(selected));
      item.tabIndex = selected ? 0 : -1;
    }
    void loadRanking(false);
  });
}
for (const button of settingsButtons) {
  button.addEventListener("click", () => {
    if (button.disabled || mainDialogOpen()) return;
    settingsTrigger = button;
    setBombTargeting(false);
    syncPreferenceControls();
      settingsDialog.showModal();
  });
}
settingsClose.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("close", () => {
  visibleTrigger(settingsTrigger, settingsButtons)?.focus({ preventScroll: true });
  settingsTrigger = null;
});
for (const button of interactionButtons) {
  button.addEventListener("click", () => {
    if (button.disabled || mainDialogOpen()) return;
    interactionTrigger = button;
    setBombTargeting(false);
      interactionDialog.showModal();
    void loadAuthorPanel();
    void refreshInteractionRewards();
  });
}
interactionClose.addEventListener("click", () => interactionDialog.close());
interactionDialog.addEventListener("close", () => {
  authorLoadGeneration += 1;
  visibleTrigger(interactionTrigger, interactionButtons)?.focus({ preventScroll: true });
  interactionTrigger = null;
});
authorSpaceButton.addEventListener("click", () => {
  if (authorSpaceButton.disabled) return;
  const sdk = getToySdk();
  if (!sdk) return;
  void sdk.navigate({ type: "space", id: AUTHOR_MID }).catch(() => void showToast("作者主页暂时无法打开"));
});
developmentVideoButton.addEventListener("click", () => {
  if (developmentVideoButton.disabled) return;
  const sdk = getToySdk();
  if (!sdk) return;
  void sdk.navigate({ type: "video", id: DEVELOPMENT_BVID }).catch(() => void showToast("开发视频暂时无法打开"));
});
document.querySelector("#session-retry")!.addEventListener("click", () => void openGame());
document.addEventListener("visibilitychange", updateVisibility);
window.addEventListener("blur", updateVisibility);
window.addEventListener("focus", updateVisibility);
window.addEventListener("pagehide", suspendLifecycle);
window.addEventListener("pageshow", resumeLifecycle);
document.addEventListener("freeze", suspendLifecycle);
document.addEventListener("resume", resumeLifecycle);
reducedMotionQuery.addEventListener("change", () => {
  if (!session.owned || lifecycleSuspended) return;
  advanceToNow();
  if (reducedMotionQuery.matches) {
    useReducedMotion(state);
    updateBattleEnergy(true);
  }
  persist(true);
});

const hudObserver = new ResizeObserver(() => {
  updateTeamPowerHud();
  updateDpsHud(true);
  updateControls();
});
hudObserver.observe(document.querySelector(".combat-stats")!);
window.addEventListener("resize", () => { renderTeam(); battleText.layout(); bossSkillView.sync(state); });
void document.fonts.ready.then(() => { renderTeam(); updateDpsHud(true); battleText.layout(); });

async function logicTick(): Promise<void> {
  try {
    if (!lifecycleSuspended && state.phase === "playing") {
      if (performance.now() - lastLeaseCheck >= 1_000) {
        lastLeaseCheck = performance.now();
        if (!await session.renew()) { if (state.phase === "playing") showSessionBlocked(); return; }
      }
      advanceToNow();
      prepareCurrentCinematic();
      pumpBoardSettlement();
      pumpBossEliminations();
      pumpComboHint();
    }
  } finally { window.setTimeout(() => void logicTick(), 50); }
}

function animationFrame(): void {
  const now = performance.now();
  animateBattleEnergy(now);
  if (isForeground() && state.phase === "playing") {
    // 活跃火山哥演出跟随显示帧推进同一引擎时钟，避免 50ms 逻辑轮询造成阶梯运动。
    if (!lifecycleSuspended && session.owned && bossSkillView.animating) advanceToNow();
    const field = state;
    ultimateCinematic.render(state.ultimateBatch);
    lightningEffects.sync(field.lightningRuns);
    chargeEffects.sync(field.chargeRuns);
    psychicEffects.sync(field.psychicRuns);
    sonicEffects.sync(field.sonicRuns);
    sprayEffects.sync(field.sprayRuns);
    bananaEffects.sync(field.bananaRuns);
    candyEffects.sync(field.candyRuns);
    netEffects.sync(field.netRuns);
  }
  requestAnimationFrame(animationFrame);
}

requestAnimationFrame(animationFrame);
void logicTick();
void openGame();
