'use strict';
/* ==========================================================================
   赵云与阿斗 —— 原生 HTML / CSS / JavaScript + Canvas 2D 塔防
   玩法：征兵（汉字/铲子）→ 布置到空白方块 → 合成升级 → 守住 20 回合
   本版新增：上下两块 5×8 棋盘（我方 / 人机）、铲子解锁、人机对手、多地图随机
   --------------------------------------------------------------------------
   目录：
     1. 配置区（所有关键数值集中在此，便于调整）
     2. 地图表（每方 5 行 × 8 列，敌方为我方的 180° 镜像）
     3. 静态数据（武将 / 技能 / 武器 / 段位）
     4. 工具函数
     5. 全局状态
     6. 路径与棋盘
     7. 单位（征兵 / 放置 / 撤回 / 合成 / 铲子）
     8. 怪物与回合
     9. 战斗（伤害 / 攻击 / 蓝条 / 技能）
    10. 特效与飘字
    11. 人机对手
    12. 主循环
    13. 渲染
    14. 交互
    15. UI 与启动
   ========================================================================== */

/* ============================== 1. 配置区 ============================== */
const CFG = {
  /* ---- 棋盘：我方 5 行×8 列 + 敌方 5 行×8 列，上下拼接 ---- */
  COLS: 8,
  ROWS_PER_SIDE: 5,
  ROWS: 10,
  CELL: 84,
  PAD: 64,                 // 画布留白：给「斗」留出棋盘外侧的空间
  GAP: 30,                 // 上下半场之间的分隔带（像素）
  BENCH_SIZE: 5,           // 下方召唤槽位数量
  BENCH_FAR: Infinity,     // 备战席格子到棋盘的距离（无限远：不攻击也不会被打）
  INITIAL_SLOTS: 6,        // 开场每方可放置的空白方块数量
  PATH_OUT: 0.00,          // 出生点偏移：0 = 怪物从路径起点格（传送门）出现
  ADOU_OUT: 0.00,          // 阿斗偏移：0 = 「斗」画在路径终点格内

  /* ---- 触控 / 手机 ---- */
  TOUCH: {
    DRAG_THRESHOLD: 8,     // 鼠标：超过这么多像素才算拖动（否则算点击）
    DRAG_THRESHOLD_TOUCH: 14, // 触屏：手指更抖，阈值放宽，避免「想点击却拖走了」
    HAPTIC: true,          // 触屏震动反馈（支持的设备才有）
    HAPTIC_DROP: 10,       // 成功落子/合成
    HAPTIC_BAD: 24,        // 非法落点
    HOLD_TO_DRAG: false    // true = 触屏需要长按 300ms 才开始拖动
  },

  /* ---- 阿斗 ---- */
  ADOU_MAX_HP: 3,
  LEAK_DAMAGE: 1,          // 普通怪到终点扣血
  BOSS_LEAK_DAMAGE: 2,     // Boss 到终点扣血

  /* ---- 经济 ---- */
  START_BUN: 15,           // 开场馒头
  SUMMON_COST_BASE: 10,    // 第一次召唤消耗
  SUMMON_COST_STEP: 5,     // 之后每次递增
  SUMMON_UNITS: 5,         // 每次召唤得到的单位数
  WAVE_INCOME_BASE: 10,    // 每回合结束奖励
  WAVE_INCOME_PER_WAVE: 2, // 每回合递增
  DISMISS_REFUND: 3,       // 遣散返还馒头
  SHOVEL_REFUND: 5,        // 遣散铲子返还馒头

  /* ---- 招募概率（刀/弓/枪/骑/武将 已由需求给出，铲子 11.2% 为补足 100%）---- */
  SHOVEL_CHANCE: 0.112,
  GENERAL_CHANCE: 0.235,
  SOLDIER_WEIGHTS: { 刀: 18.3, 弓: 16.5, 枪: 15.7, 骑: 14.8 },

  /* ---- 回合 ---- */
  TOTAL_WAVES: 20,
  ENEMIES_PER_WAVE: 10,
  BOSS_WAVES: [5, 10, 15], // 这 3 回合各把 1 只小怪换成 Boss（可配置）
  BOSS_SPAWN_INDEX: 4,     // 该回合第 5 只（0 基）替换为 Boss
  PREP_TIME: 12,           // 开局/回合间准备时间
  PREP_TIME_MIN: 6,
  SPAWN_INTERVAL: 0.85,    // 同回合怪物出场间隔（秒）

  /* ---- Boss 名字（按 BOSS_WAVES 顺序取；地图可用 bossNames 覆盖）---- */
  BOSS_NAMES: ['孙尚香', '黄月英', '貂蝉'],
  BOSS_COLORS: ['#c0392b', '#7b4bd6', '#c8891a'],   // 每个 Boss 的专属颜色
  BOSS_FONT: 0.30,                                  // Boss 竖排字号（相对格子）

  /* ---- 待放置区（营旁边 5 格）---- */
  HAND_REROLL: true,      // true = 征兵时先清空待放置区，再生成新的 5 个（不叠加）
  HAND_SIZE: 5,

  /* ---- 普通怪 ---- */
  ENEMY_BASE_HP: 26,
  ENEMY_HP_GROWTH: 1.13,   // 血量随回合数增长（移速恒定）
  ENEMY_SPEED: 0.62,       // 格 / 秒
  ENEMY_RADIUS: 0.30,
  ENEMY_DMG_FLASH: 0.12,

  /* ---- Boss ---- */
  BOSS_HP_MULT: 13,
  BOSS_SPEED_MULT: 0.8,
  BOSS_RADIUS: 0.42,
  BOSS_EXECUTE_RESIST: 0.25, // Boss 免疫斩杀，改为受到 25% 最大生命伤害

  /* ---- 小兵 ---- */
  SOLDIER_TYPES: ['刀', '弓', '枪', '骑'],
  SOLDIER_MAX_LEVEL: 5,
  SOLDIER_DMG_PER_LV: 0.80,
  SOLDIER_RATE_PER_LV: 0.25,
  SOLDIER_RANGE_PER_LV: 0.00,   // 小兵攻击范围不随等级变化（显示圆圈 = 实际能打到的范围）
  /* 射程一律「差一点点到整数格」：这样刚好打不到距离 2 / 3 / 4 / 5 格的敌人，
     但比整格略小，圆圈看上去仍是 2 / 3 / 4 / 5 格。
     想改成「能打到 N 格」把对应数值写成 N 即可。 */
  SOLDIER: {
    刀: { dmg: 13, rate: 0.95, range: 1.90, pattern: 'single' },                 // 打不到 2 格
    弓: { dmg: 8,  rate: 1.35, range: 4.90, pattern: 'single', proj: 'arrow' },  // 打不到 5 格
    枪: { dmg: 10, rate: 1.05, range: 3.90, pattern: 'line',   cone: 0.45 },     // 打不到 4 格
    骑: { dmg: 15, rate: 0.85, range: 2.90, pattern: 'multi',  targets: 2 }      // 打不到 3 格
  },

  /* ---- 武将 ---- */
  HERO_MAX_LEVEL_GOLD: 5,
  HERO_MAX_LEVEL_PURPLE: 3,
  HERO_DMG_PER_LV_GOLD: 0.70,
  HERO_DMG_PER_LV_PURPLE: 0.60,
  HERO_RATE_PER_LV_GOLD: 0.22,
  HERO_RATE_PER_LV_PURPLE: 0.20,
  HERO_RANGE_PER_LV: 0.10,
  HERO_KILLS_GOLD: [0, 6, 16, 30, 50],  // 达到累计击杀数即升级
  HERO_KILLS_PURPLE: [0, 10, 24],

  /* ---- 蓝条 ---- */
  MANA_MAX: 100,
  MANA_PER_HIT: 9,
  MANA_PER_KILL: 4,

  HERO_WEIGHT_PURPLE: 0.7,   // 紫将相对权重（金将权重 1）

  /* ---- 孔明火冲击波 ---- */
  FIRE_DOUBLE_MULT: 2,
  /* ---- 曹操技能上限 ---- */
  CAOCAO_ATK_CAP: 0.60,
  CAOCAO_SPD_CAP: 0.50,

  /* ---- 人机 ---- */
  AI: {
    THINK: 0.9,             // 每隔多少秒思考一次
    SUMMON_PER_TICK: 3      // 每次思考最多征兵次数
  }
};

/* ===================== 1.5 主界面配置（改这里就能改主界面数值） ===================== */
const UI_CFG = {
  gold: 461,                       // 金币
  stamina: { current: 25, max: 30, costPerGame: 1 },   // 体力：满 30，一局消耗 1
  rank: { index: 11, minor: 1, stars: 41 },            // 段位：默认「大帝 ★x41」
  player: { name: '无名小将', id: 10086, avatar: '赵' }, // 用户信息占位
  reward: { win: { gold: 20, star: 1 }, lose: { gold: 5, star: -1 } }, // 胜负奖励
  settings: { sfx: true, bgm: true, vibrate: true },    // 设置（占位，未接入音频）
  persist: false                   // true = 把金币/体力/段位存进 localStorage
};

/* 段位表：从低到高；前 11 个段位各含 5 个小段位，每个小段位 5 颗星；「大帝」只用星星累计 */
const RANK_NAMES = ['士兵', '军士', '校尉', '少将', '中将', '上将', '大将', '元帅', '诸侯', '霸主', '君主', '大帝'];
const RANK_MINORS = ['I', 'II', 'III', 'IV', 'V'];
const STARS_PER_MINOR = 5;
const MINORS_PER_RANK = 5;
const FINAL_RANK = RANK_NAMES.length - 1;

/* ============================== 2. 地图表 ============================== */
/* 一张地图只描述「我方半场」的 5 行 × 8 列矩阵：
     0 = 路径（怪物行走，不能放置）
     1 = 空白格（可放置）
     2 = 未开发格（需要用铲子开垦成 1）
   行 0 靠近中线、行 4 靠近我方底线（渲染时行 0 在上）。
   敌方半场自动生成为我方半场的 180° 镜像；
   路径折点与出生点由矩阵自动推导（见 derivePathFromMatrix / buildMap）。 */
const MAPS = [
  {
    name: '云梦泽',
    desc: '对角官道，左右两列夹击',
    bossNames: ['孙尚香', '黄月英', '貂蝉'],
    pal: {
      bg1: '#cbb3a8', bg2: '#b09084',
      pathP: '#8e4a38', pathPDark: '#75392a', pathPLite: '#a05a45',
      pathE: '#7d4535', pathEDark: '#663628', pathELite: '#8f5340',
      lockP: '#796663', lockPDark: '#6b5956',
      lockE: '#6e5c59', lockEDark: '#615050',
      slot: '#f4e9d5', slotEdge: '#a98d6f',
      grid: 'rgba(72,48,42,0.35)', frame: '#5b3b47'
    },
    /* 行1~行5：2=未开发 0=路径 1=空白格 */
    matrix: [
      [2, 2, 2, 2, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 2, 2, 0],
      [0, 2, 1, 1, 1, 2, 2, 0],
      [0, 2, 1, 1, 1, 2, 2, 0],
      [0, 2, 2, 2, 2, 2, 2, 0]     // 行5：列0=敌方出生点，列7=我方「斗」
    ]
  }
];
/* 图例（调试用） */
const MAP_LEGEND = { 0: '路径', 1: '空白格', 2: '未开发' };

/* ============================== 3. 静态数据 ============================== */

/* 武将：chars = 由哪两个单字合成 */
const HEROES = [
  { name: '张飞', chars: ['张', '飞'], quality: 'gold',   dmg: 24, rate: 1.05, range: 2.15, pattern: 'aoe',    weapon: '丈八蛇矛' },
  { name: '关羽', chars: ['关', '羽'], quality: 'gold',   dmg: 40, rate: 0.80, range: 2.70, pattern: 'aoe',    weapon: '青龙偃月刀' },
  { name: '赵云', chars: ['赵', '云'], quality: 'gold',   dmg: 11, rate: 2.00, range: 2.40, pattern: 'single', hits: 3, weapon: '龙胆亮银枪' },
  { name: '马超', chars: ['马', '超'], quality: 'gold',   dmg: 32, rate: 1.00, range: 3.30, pattern: 'single', weapon: '虎头湛金枪' },
  { name: '刘备', chars: ['刘', '备'], quality: 'gold',   dmg: 15, rate: 1.50, range: 2.10, pattern: 'single', hits: 2, weapon: '双股剑' },
  { name: '孔明', chars: ['孔', '明'], quality: 'gold',   dmg: 25, rate: 0.90, range: 3.00, pattern: 'splash', splash: 1.10, weapon: '白羽扇' },
  { name: '曹操', chars: ['曹', '操'], quality: 'purple', dmg: 19, rate: 1.00, range: 2.10, pattern: 'single', weapon: '倚天剑' },
  { name: '曹植', chars: ['曹', '植'], quality: 'gold',   dmg: 21, rate: 0.95, range: 3.00, pattern: 'splash', splash: 1.10, weapon: '墨羽笔' },
  { name: '关平', chars: ['关', '平'], quality: 'purple', dmg: 19, rate: 1.00, range: 2.10, pattern: 'single', weapon: '青龙刀' },
  { name: '关兴', chars: ['关', '兴'], quality: 'purple', dmg: 19, rate: 1.10, range: 2.15, pattern: 'multi', targets: 2, weapon: '丈八蛇矛' }
];
const HERO_BY_NAME = {};
HEROES.forEach(h => { HERO_BY_NAME[h.name] = h; });

/* 武将技能（蓝条满自动释放） */
const SKILLS = {
  张飞: { name: '当阳桥大吼', desc: '眩晕范围内敌人 2 秒',              stun: 2.0, rangeMult: 1.7 },
  关羽: { name: '青龙偃月斩', desc: '横扫范围内全部敌人，400% 伤害',    dmgMult: 4.0, rangeMult: 2.0 },
  赵云: { name: '七进七出',   desc: '连刺 6 名敌人，各 300% 伤害',      dmgMult: 3.0, targets: 6, rangeMult: 1.9 },
  马超: { name: '三雷飞枪',   desc: '雷枪斩杀 3 名敌人（Boss 免斩）',   targets: 3, rangeMult: 2.6 },
  刘备: { name: '仁德之光',   desc: '阿斗回 1 血，全军攻速 +40% 持续 6 秒', heal: 1, buff: 0.40, buffTime: 6 },
  孔明: { name: '火冲击波',   desc: '全路径火焰，命中者受伤翻倍 5 秒',   dmgMult: 3.0, doubleTime: 5 },
  曹操: { name: '奸雄汲取',   desc: '吸取最近 5 名敌人血量强化自身',     targets: 5, dmgMult: 2.0, atkPer: 0.05, spdPer: 0.04, rangeMult: 3.0 },
  曹植: { name: '水冲击波',   desc: '全路径水浪击退（每次 +1 格，7 次后重置）', dmgMult: 1.0 },
  关平: { name: '破军斩',     desc: '向前方劈出刀气，300% 伤害',         dmgMult: 3.0, rangeMult: 2.2 },
  关兴: { name: '烈焰突袭',   desc: '对范围内所有敌人造成 300% 伤害',     dmgMult: 3.0, rangeMult: 1.6 }
};

/* 技能栏展示用（解锁系统本次不实现） */
const SKILL_SLOT_ORDER = ['张飞', '关羽', '赵云', '马超', '刘备', '孔明', '曹操', '曹植', '关平', '关兴'];

/* ---- 段位计算：赢一局 +1 星，输一局 -1 星 ---- */
function rankText() {
  const r = UI_CFG.rank;
  if (r.index >= FINAL_RANK) return RANK_NAMES[FINAL_RANK];
  return RANK_NAMES[clamp(r.index, 0, FINAL_RANK - 1)] + ' ' + RANK_MINORS[clamp(r.minor, 1, MINORS_PER_RANK) - 1];
}
function starText() {
  const r = UI_CFG.rank;
  if (r.index >= FINAL_RANK) return '★x' + Math.max(0, r.stars);
  const s = clamp(Math.round(r.stars), 1, STARS_PER_MINOR);
  return '★'.repeat(s) + '☆'.repeat(STARS_PER_MINOR - s);
}
function rankTotal() {
  const r = UI_CFG.rank;
  return (clamp(r.index, 0, FINAL_RANK) * MINORS_PER_RANK + (clamp(r.minor, 1, MINORS_PER_RANK) - 1)) * STARS_PER_MINOR + (clamp(r.stars, 1, STARS_PER_MINOR) - 1);
}
function setRankFromTotal(t) {
  const r = UI_CFG.rank;
  t = Math.max(0, Math.round(t));
  const perRank = MINORS_PER_RANK * STARS_PER_MINOR;
  const idx = Math.floor(t / perRank);
  if (idx >= FINAL_RANK) {                    // 进入「大帝」后只用星星累计
    r.index = FINAL_RANK; r.minor = 1; r.stars = t - FINAL_RANK * perRank;
    return;
  }
  const within = t % perRank;
  r.index = idx;
  r.minor = Math.floor(within / STARS_PER_MINOR) + 1;
  r.stars = (within % STARS_PER_MINOR) + 1;
}
function addStars(d) {
  const r = UI_CFG.rank;
  if (r.index >= FINAL_RANK) r.stars = Math.max(0, r.stars + d);   // 大帝：无限累计
  else setRankFromTotal(rankTotal() + d);
  saveUI(); refreshMenuUI();
}

/* ---- 主界面数值持久化（默认关闭，UI_CFG.persist = true 打开） ---- */
function saveUI() {
  if (!UI_CFG.persist) return;
  try {
    localStorage.setItem('zhaoyun_ui', JSON.stringify({
      gold: UI_CFG.gold, stamina: UI_CFG.stamina, rank: UI_CFG.rank, settings: UI_CFG.settings
    }));
  } catch (e) { /* file:// 或隐私模式可能不可用，忽略 */ }
}
function loadUI() {
  if (!UI_CFG.persist) return;
  try {
    const s = JSON.parse(localStorage.getItem('zhaoyun_ui') || 'null');
    if (s) {
      if (typeof s.gold === 'number') UI_CFG.gold = s.gold;
      if (s.stamina) Object.assign(UI_CFG.stamina, s.stamina);
      if (s.rank) Object.assign(UI_CFG.rank, s.rank);
      if (s.settings) Object.assign(UI_CFG.settings, s.settings);
    }
  } catch (e) { /* ignore */ }
}

/* ============================== 4. 工具函数 ============================== */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240517);
const pick = arr => arr[(Math.random() * arr.length) | 0];

/* 按权重随机取武将 */
function randomHero() {
  const pool = HEROES.map(h => ({ h, w: h.quality === 'purple' ? CFG.HERO_WEIGHT_PURPLE : 1 }));
  let total = 0; pool.forEach(p => total += p.w);
  let r = Math.random() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.h; }
  return HEROES[0];
}

/* 按权重随机取小兵类型 */
function randomSoldierType() {
  const W = CFG.SOLDIER_WEIGHTS;
  let total = 0; CFG.SOLDIER_TYPES.forEach(t => total += (W[t] || 0));
  let r = Math.random() * total;
  for (const t of CFG.SOLDIER_TYPES) { r -= (W[t] || 0); if (r <= 0) return t; }
  return '刀';
}

/* ============================== 5. 全局状态 ============================== */
const G = {
  screen: 'menu',        // menu | game
  paused: false,
  result: null,          // 'win' | 'lose'
  resultReason: '',
  time: 0,
  wave: 0,               // 已开始的回合数
  phase: 'prep',         // prep | wave | over
  prepTimer: 0,
  spawnQueue: [],
  spawnTimer: 0,
  map: MAPS[0],
  board: [],             // [r][c] 全局格子
  sides: { P: null, E: null },
  effects: [],
  floats: [],
  sel: null,             // {src:'bench',i} | {src:'board',c,r}
  drag: null,            // 正在拖拽：{src, unit}
  dragTarget: null,      // 当前落点
  aiTimer: 0,
  lastSummary: null,     // 最近一局统计（回顾界面用）
  rewardInfo: null,
  uid: 1
};

function makeSide(id, isAI) {
  return {
    id, isAI,
    bench: new Array(CFG.BENCH_SIZE).fill(null),
    bun: CFG.START_BUN,
    summonCount: 0,
    adouHp: CFG.ADOU_MAX_HP,
    enemies: [],
    kills: 0,
    leaks: 0,
    dismissed: 0
  };
}

/* ============================== 6. 路径与棋盘 ============================== */
const PATH = { P: null, E: null };

function mirrorPt(x, y) { return { x: CFG.COLS - x, y: CFG.ROWS_PER_SIDE - y }; }
function localToGlobalCell(c, r) { return { c: c, r: r + CFG.ROWS_PER_SIDE }; }
function mirrorCellGlobal(c, r) { return { c: CFG.COLS - 1 - c, r: CFG.ROWS_PER_SIDE - 1 - r }; }

function buildPolyline(pts) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  const cells = new Set();
  for (let d = 0; d <= total; d += 0.06) {
    const p = polyPos({ pts, segs, total }, d);
    const c = Math.floor(p.x), r = Math.floor(p.y);
    if (c >= 0 && c < CFG.COLS && r >= 0 && r < CFG.ROWS) cells.add(r * CFG.COLS + c);
  }
  return { pts, segs, total, cells };
}

function polyPos(poly, d) {
  d = clamp(d, 0, poly.total);
  for (let i = 0; i < poly.segs.length; i++) {
    const s = poly.segs[i];
    if (d <= s.start + s.len || i === poly.segs.length - 1) {
      const t = s.len > 0 ? clamp((d - s.start) / s.len, 0, 1) : 0;
      return {
        x: s.a.x + (s.b.x - s.a.x) * t,
        y: s.a.y + (s.b.y - s.a.y) * t,
        angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)
      };
    }
  }
  const last = poly.pts[poly.pts.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}
const pathPos = (side, d) => polyPos(PATH[side], d);

const cellPX = (c, r) => ({ x: CFG.PAD + c * CFG.CELL, y: CFG.PAD + r * CFG.CELL + (r >= CFG.ROWS_PER_SIDE ? CFG.GAP : 0) });
const cellCenter = (c, r) => { const p = cellPX(c, r); return { x: p.x + CFG.CELL / 2, y: p.y + CFG.CELL / 2 }; };
const gpToPx = (x, y) => ({ x: CFG.PAD + x * CFG.CELL, y: CFG.PAD + y * CFG.CELL + (y >= CFG.ROWS_PER_SIDE ? CFG.GAP : 0) });
const cellOwner = r => (r < CFG.ROWS_PER_SIDE ? 'E' : 'P');
const cellOf = (c, r) => (G.board[r] ? G.board[r][c] : null);

/* ---- 从 5×8 矩阵推导路径折点 ----
   矩阵里 0 的格子必须连成一条不自交的链；从「最靠下」的端点出发走到另一个端点。
   首尾按「朝地图外侧」的方向各延伸一段：起点=出生点，终点=阿斗所在的外侧基础点。 */
function derivePathFromMatrix(mx) {
  const key = (c, r) => r * CFG.COLS + c;
  const set = new Set();
  for (let r = 0; r < CFG.ROWS_PER_SIDE; r++) for (let c = 0; c < CFG.COLS; c++) {
    if (mx[r] && mx[r][c] === 0) set.add(key(c, r));
  }
  const nb = (c, r) => [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]]
    .filter(([a, b]) => a >= 0 && a < CFG.COLS && b >= 0 && b < CFG.ROWS_PER_SIDE && set.has(key(a, b)));
  const cells = [];
  set.forEach(k => cells.push({ c: k % CFG.COLS, r: Math.floor(k / CFG.COLS) }));
  const ends = cells.filter(x => nb(x.c, x.r).length <= 1);
  if (!cells.length) return [];
  let start = ends[0] || cells[0];
  ends.forEach(e => {
    if (e.r > start.r || (e.r === start.r && e.c < start.c)) start = e;
  });
  const order = [start];
  const seen = new Set([key(start.c, start.r)]);
  let cur = start, guard = 0;
  while (guard++ < 999) {
    const nx = nb(cur.c, cur.r).find(([a, b]) => !seen.has(key(a, b)));
    if (!nx) break;
    cur = { c: nx[0], r: nx[1] };
    seen.add(key(cur.c, cur.r));
    order.push(cur);
  }
  /* 外侧方向：能出界就往左右出，否则往上下出 */
  const outDir = cell => {
    if (cell.c === 0) return { x: -1, y: 0 };
    if (cell.c === CFG.COLS - 1) return { x: 1, y: 0 };
    if (cell.r === 0) return { x: 0, y: -1 };
    return { x: 0, y: 1 };
  };
  const pts = order.map(x => ({ x: x.c + 0.5, y: x.r + 0.5 }));
  if (pts.length) {
    const dIn = outDir(order[0]);
    pts.unshift({ x: pts[0].x + dIn.x * CFG.PATH_OUT, y: pts[0].y + dIn.y * CFG.PATH_OUT });
    const dOut = outDir(order[order.length - 1]);
    const last = pts[pts.length - 1];
    const adouPt = { x: last.x + dOut.x * CFG.ADOU_OUT, y: last.y + dOut.y * CFG.ADOU_OUT };
    pts.push(adouPt);                 // 终点 = 阿斗所在地（棋盘外侧基础点）
  }
  return pts;
}

function buildMap(def) {
  G.map = def;
  G.board = [];
  for (let r = 0; r < CFG.ROWS; r++) {
    const row = [];
    for (let c = 0; c < CFG.COLS; c++) row.push({ c, r, kind: 'locked', owner: cellOwner(r), unit: null });
    G.board.push(row);
  }
  const mx = def.matrix;
  /* 1. 按矩阵铺我方半场（局部 → 全局：行 r → 全局行 r + ROWS_PER_SIDE） */
  for (let r = 0; r < CFG.ROWS_PER_SIDE; r++) for (let c = 0; c < CFG.COLS; c++) {
    const v = (mx[r] && mx[r][c] !== undefined) ? mx[r][c] : 2;
    const g = localToGlobalCell(c, r);
    G.board[g.r][g.c].kind = v === 0 ? 'path' : (v === 1 ? 'slot' : 'locked');
    const m = mirrorCellGlobal(c, r);
    G.board[m.r][m.c].kind = v === 0 ? 'path' : (v === 1 ? 'slot' : 'locked');
  }
  /* 2. 路径折点（我方 + 敌方镜像） */
  const half = derivePathFromMatrix(mx);
  const ptsP = half.map(p => ({ x: p.x, y: p.y + CFG.ROWS_PER_SIDE }));
  const ptsE = half.map(p => mirrorPt(p.x, p.y));
  PATH.P = buildPolyline(ptsP);
  PATH.E = buildPolyline(ptsE);
  PATH.adouP = ptsP[ptsP.length - 1];
  PATH.adouE = ptsE[ptsE.length - 1];
  PATH.spawnP = ptsP[0];
  PATH.spawnE = ptsE[0];
}

/* 控制台打印矩阵与棋盘，方便核对布局 */
function printMap() {
  const def = G.map;
  console.log('%c[地图] ' + def.name + '（我方半场 5×8 矩阵：0=路径 1=空白 2=未开发）',
    'font-weight:bold');
  const rows = [];
  for (let r = 0; r < CFG.ROWS_PER_SIDE; r++) {
    rows.push(def.matrix[r].map(v => v + ' ' + (v === 0 ? '路' : v === 1 ? '空' : '锁')).join(' | '));
  }
  console.log(rows.join('\n'));
  console.log('矩阵：\n' + def.matrix.map(row => '[' + row.join(', ') + ']').join('\n'));
  /* 完整棋盘（上=敌方，下=我方） */
  const sym = { path: '路', slot: '空', locked: '锁' };
  let board = '';
  for (let r = 0; r < CFG.ROWS; r++) {
    let line = '';
    for (let c = 0; c < CFG.COLS; c++) line += sym[G.board[r][c].kind] + ' ';
    board += 'r' + r + ' ' + line + (r < CFG.ROWS_PER_SIDE ? '  ← 敌方半场' : (r === CFG.ROWS_PER_SIDE ? '  ← 我方半场' : '')) + '\n';
  }
  console.log('棋盘：\n' + board);
  let path = 0, slot = 0, locked = 0;
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const k = G.board[r][c].kind;
    if (k === 'path') path++; else if (k === 'slot') slot++; else locked++;
  }
  console.log('统计：路径 ' + path + ' 格 / 空白 ' + slot + ' 格 / 未开发 ' + locked + ' 格；' +
    '我方出生点 ' + JSON.stringify(PATH.spawnP) + ' → 我方阿斗 ' + JSON.stringify(PATH.adouP) +
    '；敌方出生点 ' + JSON.stringify(PATH.spawnE) + ' → 敌方阿斗 ' + JSON.stringify(PATH.adouE));
  return def.matrix;
}

/* ============================== 7. 单位 ============================== */
const newUnitBase = () => ({
  cell: null, bench: -1, cd: Math.random() * 0.3, mana: 0,
  kills: 0, atkBonus: 0, spdBonus: 0,
  buffUntil: 0, buffAmt: 0, pushPower: 1, facing: -Math.PI / 2, hitFlash: 0, side: 'P'
});

function createSoldier(type, level) {
  return Object.assign(newUnitBase(), {
    id: G.uid++, kind: 'soldier', type, char: type,
    level: level || 1, maxLevel: CFG.SOLDIER_MAX_LEVEL
  });
}
function createChar(ch, level) {
  const hero = HEROES.find(h => h.chars.includes(ch));
  return Object.assign(newUnitBase(), {
    id: G.uid++, kind: 'char', char: ch, type: null, name: '',
    pair: null, heroName: '',
    quality: hero ? hero.quality : 'gold',
    level: level || 1, maxLevel: CFG.SOLDIER_MAX_LEVEL
  });
}
function createHero(name) {
  const h = HERO_BY_NAME[name];
  return Object.assign(newUnitBase(), {
    id: G.uid++, kind: 'hero', char: name, name, pair: null, heroName: name,
    quality: h.quality, level: 1,
    maxLevel: h.quality === 'gold' ? CFG.HERO_MAX_LEVEL_GOLD : CFG.HERO_MAX_LEVEL_PURPLE
  });
}
function createShovel() {
  return Object.assign(newUnitBase(), { id: G.uid++, kind: 'shovel', char: '铲', type: null, level: 1, maxLevel: 1, pair: null, heroName: '' });
}

/* ---- 武将「组合体」：两个字各占一格，互相 pair，作为一个整体攻击/升级 ---- */
function isPaired(u) { return !!(u && u.kind === 'char' && u.pair && u.pair.pair === u); }
function isHeroish(u) { return !!(u && (u.kind === 'hero' || isPaired(u))); }
function heroDefOf(u) { return isHeroish(u) && u.name ? HERO_BY_NAME[u.name] : null; }
function heroNameForChars(a, b) {
  if (!a || !b || a === b) return '';
  const h = HEROES.find(x => x.chars.includes(a) && x.chars.includes(b));
  return h ? h.name : '';
}
function heroMaxLevel(name) {
  const h = HERO_BY_NAME[name];
  if (!h) return CFG.SOLDIER_MAX_LEVEL;
  return h.quality === 'gold' ? CFG.HERO_MAX_LEVEL_GOLD : CFG.HERO_MAX_LEVEL_PURPLE;
}
/* 组合体里由「武将名的第一个字」负责攻击 */
function isPairLead(u) {
  if (!isPaired(u)) return false;
  const h = HERO_BY_NAME[u.heroName];
  return !!h && u.char === h.chars[0];
}
function linkPair(a, b) {
  const nm = heroNameForChars(a.char, b.char);
  if (!nm) return false;
  const maxLv = heroMaxLevel(nm);
  const lv = Math.min(maxLv, Math.max(a.level || 1, b.level || 1));
  a.pair = b; b.pair = a;
  a.heroName = nm; b.heroName = nm;
  a.name = nm; b.name = nm;
  a.level = lv; b.level = lv;
  a.maxLevel = maxLv; b.maxLevel = maxLv;
  const k = Math.max(a.kills || 0, b.kills || 0);
  a.kills = k; b.kills = k;
  a.mana = 0; b.mana = 0;
  a.pushPower = 1; b.pushPower = 1;
  a.facing = b.facing = -Math.PI / 2;
  return true;
}
function unlinkPair(u) {
  const p = u && u.pair;
  if (!p) return false;
  u.pair = null; p.pair = null;
  u.heroName = ''; p.heroName = '';
  u.name = ''; p.name = '';
  u.mana = 0; p.mana = 0;
  u.cd = Math.random() * 0.3; p.cd = Math.random() * 0.3;
  return true;
}
/* 组合体的等级/击杀同步 */
function setPairLevel(u, lv) {
  if (!u) return;
  const maxLv = heroMaxLevel(u.heroName);
  const v = Math.min(maxLv, lv);
  u.level = v;
  if (u.pair) u.pair.level = v;
}
function addPairMana(u, amount) {
  u.mana = Math.min(CFG.MANA_MAX, u.mana + amount);
  if (u.pair) u.pair.mana = u.mana;
}
function resetPairMana(u) {
  u.mana = 0;
  if (u.pair) u.pair.mana = 0;
}

/* ---- 数值 ---- */
function unitDmg(u) {
  let base, per;
  if (u.kind === 'soldier') { base = CFG.SOLDIER[u.type].dmg; per = CFG.SOLDIER_DMG_PER_LV; }
  else {
    const h = heroDefOf(u);
    if (!h) return 0;
    base = h.dmg;
    per = h.quality === 'gold' ? CFG.HERO_DMG_PER_LV_GOLD : CFG.HERO_DMG_PER_LV_PURPLE;
  }
  return base * (1 + per * (u.level - 1)) * (1 + u.atkBonus);
}
function unitRate(u) {
  let base, per;
  if (u.kind === 'soldier') { base = CFG.SOLDIER[u.type].rate; per = CFG.SOLDIER_RATE_PER_LV; }
  else {
    const h = heroDefOf(u);
    if (!h) return 0;
    base = h.rate;
    per = h.quality === 'gold' ? CFG.HERO_RATE_PER_LV_GOLD : CFG.HERO_RATE_PER_LV_PURPLE;
  }
  let r = base * (1 + per * (u.level - 1)) * (1 + u.spdBonus);
  if (G.time < u.buffUntil) r *= (1 + u.buffAmt);
  return r;
}
function unitRange(u) {
  let base, per;
  if (u.kind === 'soldier') { base = CFG.SOLDIER[u.type].range; per = CFG.SOLDIER_RANGE_PER_LV; }
  else {
    const h = heroDefOf(u);
    if (!h) return 0;
    base = h.range; per = CFG.HERO_RANGE_PER_LV;
  }
  return base + per * (u.level - 1);
}
function unitPattern(u) {
  if (u.kind === 'soldier') return CFG.SOLDIER[u.type];
  const h = heroDefOf(u);
  return h || null;
}
/* 单位是否在棋盘上（备战席 = 离棋盘「无限远」的普通格子） */
function isOnBoard(u) { return !!(u && u.cell); }

/* 单位所在的位置（格坐标）
   备战席的 5 个格子被当作「离棋盘无限远的普通格子」：
   距离 = Infinity，于是怪物永远打不到它、它也永远打不到怪，
   但等级 / 合成 / 升级 / 范围显示这些「格子内的逻辑」完全照常。 */
function unitCenter(u) {
  if (!isOnBoard(u)) return { x: CFG.BENCH_FAR, y: CFG.BENCH_FAR };
  /* 组合体占用两格：整体以「两个字的中点」为准（攻击、技能、范围圆圈都一致） */
  if (isPaired(u) && u.pair.cell) {
    return {
      x: (u.cell.c + u.pair.cell.c) / 2 + 0.5,
      y: (u.cell.r + u.pair.cell.r) / 2 + 0.5
    };
  }
  return { x: u.cell.c + 0.5, y: u.cell.r + 0.5 };
}
/* 能不能在棋盘上画出特效/飘字：只有真的落在棋盘上才行 */
function canDrawAt(u) { const c = unitCenter(u); return isFinite(c.x) && isFinite(c.y); }

/* ---- 位置管理（严格：一个单位要么在棋盘格，要么在召唤槽，二者互斥）---- */
const sideOf = u => G.sides[u.side] || G.sides.P;

function boardClear(u) {
  if (!u || !u.cell) return;
  const cell = cellOf(u.cell.c, u.cell.r);
  if (cell && cell.unit === u) cell.unit = null;
  u.cell = null;
}
function benchFree(S) { return S.bench.filter(x => !x).length; }
function benchIndexOf(S, u) { return S.bench.indexOf(u); }
function benchRemove(S, u) {
  if (!u) return;
  const i = S.bench.indexOf(u);
  if (i >= 0) S.bench[i] = null;
  u.bench = -1;
}
function benchAdd(S, u, at) {
  let i = (typeof at === 'number' && at >= 0 && at < S.bench.length && !S.bench[at]) ? at : S.bench.indexOf(null);
  if (i < 0) return false;
  if (S.bench[i] === u) return true;
  boardClear(u);           // 保证不会同时存在于棋盘
  u.bench = i;
  u.side = S.id;           // 阵营必须跟着槽位走
  S.bench[i] = u;
  return true;
}
/* 放到棋盘：先清理旧位置（修复「一个兵可以重复放置」） */
function boardPlace(S, u, c, r) {
  const cell = cellOf(c, r);
  if (!cell || cell.kind !== 'slot' || cell.unit) return false;
  boardClear(u);
  benchRemove(S, u);
  cell.unit = u;
  u.cell = { c, r };
  u.side = S.id;
  return true;
}
/* 从棋盘撤回召唤槽（修复「已放置的兵不能回到召唤位置」） */
function withdrawToBench(S, u, at) {
  if (benchFree(S) <= 0 && !(typeof at === 'number' && at >= 0 && !S.bench[at])) return false;
  if (isPaired(u)) unlinkPair(u);        // 撤回即拆开组合体
  boardClear(u);
  return benchAdd(S, u, at);
}
/* 遣散 */
function dismissUnit(S, u) {
  const hero = isHeroish(u);
  const refund = u.kind === 'shovel' ? CFG.SHOVEL_REFUND : CFG.DISMISS_REFUND * Math.max(1, u.level) * (hero ? 4 : 1);
  if (isPaired(u)) unlinkPair(u);
  boardClear(u);
  benchRemove(S, u);
  S.bun += refund;
  S.dismissed++;
  return refund;
}

/* ---- 召唤 / 征兵 ---- */
function summonCost(S) { return CFG.SUMMON_COST_BASE + CFG.SUMMON_COST_STEP * S.summonCount; }

function rollSummon() {
  const r = Math.random();
  if (r < CFG.SHOVEL_CHANCE) return createShovel();
  if (r < CFG.SHOVEL_CHANCE + CFG.GENERAL_CHANCE) return createChar(pick(randomHero().chars));
  return createSoldier(randomSoldierType(), 1);
}

function doSummon(S) {
  if (G.screen !== 'game' || G.paused || G.phase === 'over') return false;
  const cost = summonCost(S);
  if (S.bun < cost) { if (!S.isAI) toast('馒头不足，无法征兵'); return false; }
  /* 待放置区：满员/已有兵时不叠加 —— 先清空，再生成新的 5 个 */
  const had = S.bench.filter(Boolean).length;
  if (CFG.HAND_REROLL && had > 0) {
    clearHand(S);
    if (!S.isAI && had >= CFG.HAND_SIZE) toast('营地已满，清空后重新征兵 ×5');
  } else if (benchFree(S) < CFG.SUMMON_UNITS) {
    if (!S.isAI) toast('营地空位不足');
    return false;
  }
  S.bun -= cost;
  S.summonCount++;
  for (let i = 0; i < CFG.SUMMON_UNITS; i++) benchAdd(S, rollSummon());
  if (!S.isAI) { renderBench(); updateHUD(); }
  return true;
}

/* ---- 待放置区（手牌）管理 ---- */
function clearHand(S) {
  for (let i = 0; i < S.bench.length; i++) {
    const u = S.bench[i];
    if (u) {
      if (isPaired(u)) unlinkPair(u);
      u.bench = -1; u.cell = null;
    }
    S.bench[i] = null;
  }
}
/* 手牌内部交换位置 */
function swapBench(S, i, j) {
  if (i === j) return false;
  if (i < 0 || j < 0 || i >= S.bench.length || j >= S.bench.length) return false;
  const a = S.bench[i], b = S.bench[j];
  S.bench[i] = b; S.bench[j] = a;
  if (a) a.bench = j;
  if (b) b.bench = i;
  return true;
}
/* 棋盘单位与手牌互换（拖到已占用的手牌格且不能合成时） */
function swapBoardBench(S, u, i) {
  const other = S.bench[i];
  if (!other || !u.cell) return false;
  const c = u.cell.c, r = u.cell.r;
  boardClear(u);
  boardClear(other);
  // 手牌槽位严格交接：先让 other 出槽，再让 u 入槽
  other.bench = -1;
  S.bench[i] = null;
  S.bench[i] = u; u.bench = i; u.side = S.id;
  G.board[r][c].unit = other; other.cell = { c, r }; other.side = S.id;
  return true;
}
/* 棋盘两个单位互换 */
function swapBoardUnits(a, b) {
  if (!a || !b || !a.cell || !b.cell) return false;
  const ca = { c: a.cell.c, r: a.cell.r }, cb = { c: b.cell.c, r: b.cell.r };
  boardClear(a); boardClear(b);
  G.board[ca.r][ca.c].unit = b; b.cell = ca;
  G.board[cb.r][cb.c].unit = a; a.cell = cb;
  return true;
}
/* 单位攻击范围（格）：与小兵/武将实际 range 一致，用于显示 */
function unitRangeText(u) {
  if (!u) return '';
  const r = unitRange(u);
  return (Math.round(r * 10) / 10) + ' 格';
}

/* ---- 铲子解锁 ---- */
function useShovel(S, shovel, c, r) {
  const cell = cellOf(c, r);
  if (!cell) return false;
  if (cell.owner !== S.id) { if (!S.isAI) toast('这是敌方区域'); return false; }
  if (cell.kind === 'path') { if (!S.isAI) toast('路径上不能放置'); return false; }
  if (cell.kind === 'slot') { if (!S.isAI) toast('这里已经是空白方块'); return false; }
  cell.kind = 'slot';
  boardClear(shovel);
  benchRemove(S, shovel);
  const p = cellCenter(c, r);
  G.floats.push({ x: (p.x - CFG.PAD) / CFG.CELL, y: (p.y - CFG.PAD - (r >= CFG.ROWS_PER_SIDE ? CFG.GAP : 0)) / CFG.CELL, text: '解锁！', life: 1.1, maxLife: 1.1, color: '#ffd25e', size: 22 });
  if (!S.isAI) { renderBench(); updateUI(); }
  return true;
}

/* ---- 合并 ---- */
function canMerge(a, b) {
  if (!a || !b || a === b) return false;
  if (a.kind === 'char' && b.kind === 'char') {
    if (isPaired(a) || isPaired(b)) return false;                  // 已经是组合体
    if (a.char === b.char) return a.level === b.level && a.level < CFG.SOLDIER_MAX_LEVEL;  // 相同单字 → 升级
    return !!heroNameForChars(a.char, b.char);                     // 不同单字 → 组合体
  }
  if (a.kind === 'soldier' && b.kind === 'soldier')
    return a.type === b.type && a.level === b.level && a.level < a.maxLevel;
  if (a.kind === 'hero' && b.kind === 'hero')
    return a.name === b.name && a.level < a.maxLevel;
  return false;
}

/* 相邻的、属于本方且空着的可放置格 */
function adjacentFreeCells(cell, S) {
  const out = [];
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
    const c = cell.c + dc, r = cell.r + dr;
    if (c < 0 || c >= CFG.COLS || r < 0 || r >= CFG.ROWS) return;
    const cell2 = G.board[r][c];
    if (cell2.owner === S.id && cell2.kind === 'slot' && !cell2.unit) out.push({ c, r });
  });
  return out;
}

/* 从待放置区把单位放上棋盘：组合体会「整体上阵」占相邻两格；
   没有相邻空格时退化为拆开（只放一个字），保证不会出现半个组合体 */
function placeFromHand(S, u, c, r) {
  if (!u) return false;
  if (isPaired(u) && u.pair.bench >= 0) {
    const spots = adjacentFreeCells({ c, r }, S);
    if (spots.length) {
      if (!boardPlace(S, u, c, r)) return false;
      const s = spots[0];
      boardPlace(S, u.pair, s.c, s.r);
      return true;                       // 两个字各占一格，保持组合体
    }
    unlinkPair(u);
    if (!S.isAI) toast('周围没有相邻空格，组合体已拆开，先放下一个字');
    return boardPlace(S, u, c, r);
  }
  return boardPlace(S, u, c, r);
}

/* 自愈：组合体两个字必须待在同一个区域（都在棋盘或都在待放置区），否则拆开 */
function repairPairs() {
  const fix = u => { if (u && isPaired(u) && (!!u.cell !== !!u.pair.cell)) unlinkPair(u); };
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) fix(G.board[r][c].unit);
  ['P', 'E'].forEach(id => G.sides[id].bench.forEach(fix));
}

/* 把两个字组成「组合体」：各占一格（地图上必须相邻；一在棋盘一在手牌时自动放到相邻空格） */
function linkPairSmart(S, a, b) {
  if (!a || !b || a === b) return false;
  if (isPaired(a) || isPaired(b)) return false;
  if (!heroNameForChars(a.char, b.char)) return false;
  const placed = u => !!(u.cell || u.bench >= 0);
  if (!placed(a) || !placed(b)) return false;        // 必须在棋盘或待放置区里
  if (a.cell && b.cell) {
    const adj = Math.abs(a.cell.c - b.cell.c) + Math.abs(a.cell.r - b.cell.r) === 1;
    if (!adj) return false;                       // 地图上必须相邻才能组合
    if (!linkPair(a, b)) return false;
    heroLinkFx(a, b);
    return true;
  }
  if (!a.cell && !b.cell) {                       // 都在待放置区
    if (!linkPair(a, b)) return false;
    heroLinkFx(a, b);
    return true;
  }
  // 一个在棋盘、一个在手牌 → 把手牌那个放到相邻空格
  const onBoard = a.cell ? a : b;
  const inHand = a.cell ? b : a;
  const spots = adjacentFreeCells(onBoard.cell, S);
  if (!spots.length) return false;
  const spot = spots[0];
  boardPlace(S, inHand, spot.c, spot.r);
  if (!linkPair(onBoard, inHand)) return false;
  heroLinkFx(onBoard, inHand);
  return true;
}

function heroLinkFx(a, b) {
  const ca = unitCenter(a), cb = unitCenter(b);
  if (!isFinite(ca.x) || !isFinite(cb.x)) return;      // 都在备战席（无限远）→ 不画棋盘特效
  const mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2;
  const gold = a.quality === 'gold';
  G.floats.push({ x: mx, y: my - 0.3, text: a.heroName, life: 1.4, maxLife: 1.4, color: gold ? '#e8a12a' : '#9a6cf0', size: 26 });
  G.effects.push({ type: 'ring', x: mx, y: my, r0: 0.2, r1: 1.4, life: 0.6, maxLife: 0.6, color: gold ? '#ffd25e' : '#c39bff' });
}

function mergeInto(dst, src) {
  // src 合并进 dst（dst 位置保留，src 消失）；两者可以分别在棋盘或召唤槽
  const S = sideOf(dst);
  if (!canMerge(src, dst)) return false;
  if (src.kind === 'char' && dst.kind === 'char') {
    if (heroNameForChars(src.char, dst.char)) return linkPairSmart(S, dst, src);   // 组合体：两个字各占一格
    // 相同单字 → 升级（src 消失）
    dst.level = Math.min(CFG.SOLDIER_MAX_LEVEL, dst.level + 1);
    dst.kills += src.kills || 0;
    dst.hitFlash = 0.35;
    boardClear(src); benchRemove(S, src);
    const pp = unitCenter(dst);
    if (canDrawAt(dst)) G.floats.push({ x: pp.x, y: pp.y, text: dst.char + ' Lv.' + dst.level, life: 1.0, maxLife: 1.0, color: '#ffd25e', size: 22 });
    return true;
  }
  dst.level = Math.min(dst.maxLevel, dst.level + 1);
  dst.atkBonus = Math.max(dst.atkBonus, src.atkBonus);
  dst.spdBonus = Math.max(dst.spdBonus, src.spdBonus);
  dst.kills += src.kills;
  boardClear(src); benchRemove(S, src);
  dst.hitFlash = 0.35;
  const p = unitCenter(dst);
  if (p.x > -50) G.floats.push({ x: p.x, y: p.y, text: 'Lv.' + dst.level, life: 1.0, maxLife: 1.0, color: '#ffd25e', size: 22 });
  return true;
}

/* 集齐武将单字 → 自动组成「组合体」（地图上相邻的两个字；或待放置区里的两个字） */
function autoMergeHeroes(S) {
  repairPairs();                       // 先修掉可能出现的「半个组合体」
  let changed = true, guard = 0;
  while (changed && guard++ < 30) {
    changed = false;
    const free = [];
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const u = G.board[r][c].unit;
      if (u && u.side === S.id && u.kind === 'char' && !isPaired(u)) free.push(u);
    }
    /* 1) 棋盘上相邻的两个单字 */
    let hit = null;
    for (const a of free) {
      for (const b of free) {
        if (a === b) continue;
        if (!heroNameForChars(a.char, b.char)) continue;
        if (Math.abs(a.cell.c - b.cell.c) + Math.abs(a.cell.r - b.cell.r) !== 1) continue;
        hit = [a, b]; break;
      }
      if (hit) break;
    }
    if (hit && linkPair(hit[0], hit[1])) { heroLinkFx(hit[0], hit[1]); changed = true; continue; }
    /* 2) 待放置区里的两个单字 */
    const hand = S.bench.filter(u => u && u.kind === 'char' && !isPaired(u));
    let hit2 = null;
    for (const a of hand) {
      for (const b of hand) {
        if (a === b) continue;
        if (!heroNameForChars(a.char, b.char)) continue;
        hit2 = [a, b]; break;
      }
      if (hit2) break;
    }
    if (hit2 && linkPair(hit2[0], hit2[1])) { heroLinkFx(hit2[0], hit2[1]); changed = true; continue; }
  }
}

/* 状态自检：确保没有单位同时存在于两处 / 槽位越界 */
function validateState() {
  const problems = [];
  const seen = new Set();
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const u = G.board[r][c].unit;
    if (!u) continue;
    if (seen.has(u.id)) problems.push('单位 ' + u.id + ' 在棋盘上出现多次');
    seen.add(u.id);
    if (!u.cell || u.cell.c !== c || u.cell.r !== r) problems.push('单位 ' + u.id + ' 的 cell 坐标不一致');
    if (u.bench !== -1) problems.push('单位 ' + u.id + ' 同时在召唤槽');
  }
  ['P', 'E'].forEach(id => {
    const S = G.sides[id];
    S.bench.forEach((u, i) => {
      if (!u) return;
      if (seen.has(u.id)) problems.push('单位 ' + u.id + ' 同时存在于两处');
      seen.add(u.id);
      if (u.bench !== i) problems.push('单位 ' + u.id + ' 槽位索引错误');
      if (u.cell) problems.push('单位 ' + u.id + ' 同时在棋盘');
      if (u.side !== id) problems.push('单位 ' + u.id + ' 阵营错误');
    });
    if (S.bench.length !== CFG.BENCH_SIZE) problems.push('召唤槽长度错误');
  });
  /* 组合体（两个单字互为 pair）一致性检查 */
  const checkPair = u => {
    if (!u || !u.pair) return;
    const p = u.pair;
    if (p.pair !== u) problems.push('组合体 ' + u.id + ' 的 pair 不是双向的');
    if (!p.cell && p.bench < 0) problems.push('组合体 ' + u.id + ' 的另一半已不存在');
    if (u.heroName !== p.heroName) problems.push('组合体 ' + u.id + ' 武将名不一致');
    if (u.level !== p.level) problems.push('组合体 ' + u.id + ' 等级不一致');
    if (u.name !== u.heroName) problems.push('组合体 ' + u.id + ' 的 name 未同步');
    if (u.char === p.char) problems.push('组合体 ' + u.id + ' 两个字相同');
    if (!!u.cell !== !!p.cell) problems.push('组合体 ' + u.id + ' 一个字在棋盘、另一个不在（应在同一区域）');
    if ((u.bench >= 0) !== (p.bench >= 0)) problems.push('组合体 ' + u.id + ' 槽位状态不一致');
  };
  ['P', 'E'].forEach(id => {
    const S = G.sides[id];
    S.bench.forEach(u => checkPair(u));
  });
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) checkPair(G.board[r][c].unit);
  if (problems.length) console.warn('[状态自检]', problems);
  return problems;
}

/* ============================== 8. 怪物与回合 ============================== */
/* 第几号 Boss（0/1/2）：由 BOSS_WAVES 的顺序决定，名字/颜色取自地图或全局配置 */
function bossIndexOfWave(wave) {
  const i = CFG.BOSS_WAVES.indexOf(wave);
  return i < 0 ? -1 : i;
}
function bossNames() { return (G.map && G.map.bossNames) || CFG.BOSS_NAMES; }

function makeEnemy(side, isBoss, bossIdx) {
  const hp = Math.round(CFG.ENEMY_BASE_HP * Math.pow(CFG.ENEMY_HP_GROWTH, G.wave - 1) * (isBoss ? CFG.BOSS_HP_MULT : 1));
  const names = bossNames();
  const idx = isBoss ? (bossIdx >= 0 ? bossIdx : 0) : -1;
  return {
    id: G.uid++, side,
    dist: 0, hp, maxHp: hp, boss: !!isBoss,
    bossIdx: idx,
    bossName: isBoss ? (names[idx % names.length] || 'BOSS') : '',
    bossColor: isBoss ? CFG.BOSS_COLORS[idx % CFG.BOSS_COLORS.length] : '',
    speed: CFG.ENEMY_SPEED * (isBoss ? CFG.BOSS_SPEED_MULT : 1),
    radius: isBoss ? CFG.BOSS_RADIUS : CFG.ENEMY_RADIUS,
    stun: 0, doubleUntil: 0, flash: 0, alive: true
  };
}

function startWave() {
  if (G.phase === 'wave' || G.phase === 'over') return;
  G.wave++;
  G.phase = 'wave';
  const bi = bossIndexOfWave(G.wave);
  const isBossWave = bi >= 0;
  G.spawnQueue = [];
  for (let i = 0; i < CFG.ENEMIES_PER_WAVE; i++) {
    G.spawnQueue.push({
      isBoss: isBossWave && i === CFG.BOSS_SPAWN_INDEX,
      bossIdx: bi,
      t: i * CFG.SPAWN_INTERVAL
    });
  }
  G.spawnTimer = 0;
  const bn = isBossWave ? (bossNames()[bi] || 'BOSS') : '';
  callout(isBossWave ? '第 ' + G.wave + ' 回合 · ' + bn + ' 来袭' : '第 ' + G.wave + ' 回合');
  updateHUD();
}

function endWave() {
  const income = CFG.WAVE_INCOME_BASE + CFG.WAVE_INCOME_PER_WAVE * G.wave;
  G.sides.P.bun += income;
  G.sides.E.bun += income;
  if (G.wave >= CFG.TOTAL_WAVES) { finish('win', '守满 20 回合'); return; }
  G.phase = 'prep';
  G.prepTimer = Math.max(CFG.PREP_TIME_MIN, CFG.PREP_TIME - Math.floor(G.wave * 0.7));
  if (G.sides.P.bun >= summonCost(G.sides.P)) toast('第 ' + G.wave + ' 回合结束，+ ' + income + ' 馒头');
  updateHUD();
}

function leakEnemy(S, e) {
  const dmg = e.boss ? CFG.BOSS_LEAK_DAMAGE : CFG.LEAK_DAMAGE;
  S.adouHp = Math.max(0, S.adouHp - dmg);
  S.leaks++;
  const pp = pathPos(S.id, e.dist);
  const p = gpToPx(pp.x, pp.y);
  G.floats.push({
    x: (p.x - CFG.PAD) / CFG.CELL,
    y: (p.y - CFG.PAD - (pp.y >= CFG.ROWS_PER_SIDE ? CFG.GAP : 0)) / CFG.CELL,
    text: '-' + dmg, life: 1.0, maxLife: 1.0, color: '#ff5a4e', size: 28
  });
  e.alive = false;
  if (S.id === 'P') shake = 0.35;
  updateHUD();
  checkOver();
}

function checkOver() {
  if (G.phase === 'over') return;
  if (G.sides.E.adouHp <= 0) { finish('win', '人机阿斗阵亡'); return; }
  if (G.sides.P.adouHp <= 0) { finish('lose', '我方阿斗阵亡'); return; }
}

function finish(result, reason) {
  if (G.phase === 'over') return;
  G.result = result;
  G.resultReason = reason || '';
  G.phase = 'over';

  /* 结算奖励：赢 +1 星 / 输 -1 星，金币按 UI_CFG.reward 发放 */
  const rw = result === 'win' ? UI_CFG.reward.win : UI_CFG.reward.lose;
  UI_CFG.gold += rw.gold;
  addStars(rw.star);
  G.lastSummary = {
    map: G.map.name,
    result: result === 'win' ? '胜利' : '失败',
    wave: G.wave,
    kills: G.sides.P.kills,
    aiKills: G.sides.E.kills,
    gold: rw.gold,
    star: rw.star
  };
  G.rewardInfo = rw;
  saveUI();
  showResult(result);
}

/* ============================== 9. 战斗 ============================== */
function enemiesInRange(S, cx, cy, range) {
  const out = [];
  for (const e of S.enemies) {
    if (!e.alive) continue;
    const p = pathPos(S.id, e.dist);
    if (dist2(cx, cy, p.x, p.y) <= range) out.push(e);
  }
  out.sort((a, b) => b.dist - a.dist);
  return out;
}

function damageEnemy(e, dmg, src) {
  if (!e.alive) return 0;
  let d = dmg;
  if (e.doubleUntil > G.time) d *= CFG.FIRE_DOUBLE_MULT;
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  e.flash = CFG.ENEMY_DMG_FLASH;
  if (e.hp <= 0) killEnemy(e, src);
  return d;
}

function killEnemy(e, src) {
  if (!e.alive) return;
  e.alive = false;
  const S = G.sides[e.side];
  S.kills++;
  const p = pathPos(e.side, e.dist);
  const col = e.boss ? '#ffd25e' : '#ffffff';
  for (let i = 0; i < (e.boss ? 10 : 4); i++) {
    const a = Math.random() * TAU, sp = 0.4 + Math.random() * 0.8;
    G.effects.push({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, maxLife: 0.5, color: col, r: e.boss ? 5 : 3 });
  }
  if (src && isHeroish(src)) {
    src.kills++;
    if (src.pair) src.pair.kills = src.kills;
    addPairMana(src, CFG.MANA_PER_KILL);
    checkHeroLevel(src);
  }
}

function checkHeroLevel(u) {
  const arr = u.quality === 'gold' ? CFG.HERO_KILLS_GOLD : CFG.HERO_KILLS_PURPLE;
  let lv = 1;
  for (let i = 0; i < arr.length; i++) if (u.kills >= arr[i]) lv = i + 1;
  if (lv > u.level && u.level < u.maxLevel) {
    setPairLevel(u, Math.min(u.maxLevel, lv));      // 组合体两个字一起升级
    if (!canDrawAt(u)) return;                      // 备战席（无限远）不画棋盘特效
    const p = unitCenter(u);
    G.floats.push({ x: p.x, y: p.y, text: (u.name || u.char) + ' Lv.' + u.level, life: 1.3, maxLife: 1.3, color: '#ffd25e', size: 20 });
    G.effects.push({ type: 'ring', x: p.x, y: p.y, r0: 0.2, r1: 1.2, life: 0.6, maxLife: 0.6, color: '#ffd25e' });
  }
}

function unitAttack(u) {
  const S = sideOf(u);
  const pat = unitPattern(u);
  const c = unitCenter(u);
  const range = unitRange(u);
  const dmg = unitDmg(u);
  const list = enemiesInRange(S, c.x, c.y, range);
  if (!list.length) return false;

  const primary = list[0];
  const pp = pathPos(S.id, primary.dist);
  u.facing = Math.atan2(pp.y - c.y, pp.x - c.x);

  let hitCount = 0;
  if (pat.pattern === 'single') {
    const hits = pat.hits || 1;
    for (let i = 0; i < hits; i++) if (primary.alive) { damageEnemy(primary, dmg, u); hitCount++; }
    if (pat.proj === 'arrow') {
      G.effects.push({ type: 'arrow', x: c.x, y: c.y, tx: pp.x, ty: pp.y, life: 0.16, maxLife: 0.16 });
    } else {
      G.effects.push({ type: 'slash', x: c.x, y: c.y, angle: u.facing, life: 0.18, maxLife: 0.18, r: 0.75, color: u.kind === 'hero' ? '#ffe9a8' : '#5b3b47' });
    }
  } else if (pat.pattern === 'multi') {
    const n = pat.targets || 2;
    for (let i = 0; i < Math.min(n, list.length); i++) if (list[i].alive) { damageEnemy(list[i], dmg, u); hitCount++; }
    G.effects.push({ type: 'slash', x: c.x, y: c.y, angle: u.facing, life: 0.18, maxLife: 0.18, r: range * 0.9, color: u.kind === 'hero' ? '#ffe9a8' : '#5b3b47', wide: 1.1 });
  } else if (pat.pattern === 'line') {
    const cone = pat.cone || 0.4;
    for (const e of list) {
      const ep = pathPos(S.id, e.dist);
      const a = Math.atan2(ep.y - c.y, ep.x - c.x);
      const diff = Math.abs(((a - u.facing + Math.PI * 3) % TAU) - Math.PI);
      if (diff <= cone) { damageEnemy(e, dmg, u); hitCount++; }
    }
    G.effects.push({ type: 'beam', x: c.x, y: c.y, angle: u.facing, len: range, life: 0.16, maxLife: 0.16, color: '#efe0d0' });
  } else if (pat.pattern === 'aoe') {
    for (const e of list) { damageEnemy(e, dmg, u); hitCount++; }
    G.effects.push({ type: 'ring', x: c.x, y: c.y, r0: range * 0.3, r1: range, life: 0.28, maxLife: 0.28, color: u.name === '张飞' ? '#ffd25e' : '#ffe9a8' });
  } else if (pat.pattern === 'splash') {
    damageEnemy(primary, dmg, u); hitCount++;
    const sr = pat.splash || 1;
    for (const e of list) {
      if (e === primary || !e.alive) continue;
      const ep = pathPos(S.id, e.dist);
      if (dist2(ep.x, ep.y, pp.x, pp.y) <= sr) { damageEnemy(e, dmg * 0.6, u); hitCount++; }
    }
    G.effects.push({ type: 'ink', x: pp.x, y: pp.y, r: sr, life: 0.35, maxLife: 0.35 });
  }

  if (hitCount > 0 && isHeroish(u)) {
    addPairMana(u, CFG.MANA_PER_HIT);
    if (u.mana >= CFG.MANA_MAX) castSkill(u);
  }
  return hitCount > 0;
}

function castSkill(u) {
  resetPairMana(u);
  const sk = SKILLS[u.name];
  if (!sk) return;
  const S = sideOf(u);
  const c = unitCenter(u);
  const range = unitRange(u);
  const dmg = unitDmg(u);
  G.floats.push({ x: c.x, y: c.y - 0.5, text: sk.name, life: 1.3, maxLife: 1.3, color: '#8fd3ff', size: 20 });
  G.effects.push({ type: 'skillRing', x: c.x, y: c.y, life: 0.7, maxLife: 0.7, color: '#8fd3ff' });

  switch (u.name) {
    case '张飞': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).forEach(e => { e.stun = Math.max(e.stun, sk.stun); });
      G.effects.push({ type: 'ring', x: c.x, y: c.y, r0: 0.3, r1: range * sk.rangeMult, life: 0.7, maxLife: 0.7, color: '#ffb347' });
      break;
    }
    case '关羽': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).forEach(e => damageEnemy(e, dmg * sk.dmgMult, u));
      G.effects.push({ type: 'ring', x: c.x, y: c.y, r0: 0.4, r1: range * sk.rangeMult, life: 0.55, maxLife: 0.55, color: '#ff6f61' });
      break;
    }
    case '赵云': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).slice(0, sk.targets).forEach(e => {
        const ep = pathPos(S.id, e.dist);
        G.effects.push({ type: 'beam', x: c.x, y: c.y, angle: Math.atan2(ep.y - c.y, ep.x - c.x), len: dist2(c.x, c.y, ep.x, ep.y), life: 0.25, maxLife: 0.25, color: '#cfe9ff' });
        damageEnemy(e, dmg * sk.dmgMult, u);
      });
      break;
    }
    case '马超': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).slice(0, sk.targets).forEach(e => {
        const ep = pathPos(S.id, e.dist);
        G.effects.push({ type: 'bolt', x: c.x, y: c.y, tx: ep.x, ty: ep.y, life: 0.35, maxLife: 0.35 });
        if (e.boss) damageEnemy(e, e.maxHp * CFG.BOSS_EXECUTE_RESIST, u);
        else { e.hp = 0; killEnemy(e, u); }
      });
      break;
    }
    case '刘备': {
      if (S.adouHp < CFG.ADOU_MAX_HP) S.adouHp++;
      for (let r = 0; r < CFG.ROWS; r++) for (let cc = 0; cc < CFG.COLS; cc++) {
        const t = G.board[r][cc].unit;
        if (t && t.side === S.id) { t.buffAmt = sk.buff; t.buffUntil = G.time + sk.buffTime; }
      }
      S.bench.forEach(b => { if (b) { b.buffAmt = sk.buff; b.buffUntil = G.time + sk.buffTime; } });
      G.effects.push({ type: 'ring', x: c.x, y: c.y, r0: 0.3, r1: 5, life: 0.9, maxLife: 0.9, color: '#7ee787' });
      updateHUD();
      break;
    }
    case '孔明': {
      S.enemies.forEach(e => { if (e.alive) { damageEnemy(e, dmg * sk.dmgMult, u); e.doubleUntil = G.time + sk.doubleTime; } });
      G.effects.push({ type: 'pathWave', side: S.id, life: 1.1, maxLife: 1.1, color: '#ff7a3c' });
      break;
    }
    case '曹植': {
      const push = u.pushPower;
      S.enemies.forEach(e => {
        if (!e.alive) return;
        damageEnemy(e, dmg * sk.dmgMult, u);
        e.dist = Math.max(0, e.dist - push * (e.boss ? 0.5 : 1));
      });
      G.effects.push({ type: 'pathWave', side: S.id, life: 1.0, maxLife: 1.0, color: '#59c8f5' });
      G.floats.push({ x: c.x, y: c.y + 0.7, text: '击退 ' + push + ' 格', life: 1.0, maxLife: 1.0, color: '#59c8f5', size: 18 });
      u.pushPower = push >= 7 ? 1 : push + 1;
      break;
    }
    case '曹操': {
      const list = enemiesInRange(S, c.x, c.y, range * sk.rangeMult).slice(0, sk.targets);
      list.forEach(e => {
        const ep = pathPos(S.id, e.dist);
        G.effects.push({ type: 'drain', x: c.x, y: c.y, tx: ep.x, ty: ep.y, life: 0.45, maxLife: 0.45 });
        damageEnemy(e, dmg * sk.dmgMult, u);
      });
      u.atkBonus = Math.min(CFG.CAOCAO_ATK_CAP, u.atkBonus + sk.atkPer * list.length);
      u.spdBonus = Math.min(CFG.CAOCAO_SPD_CAP, u.spdBonus + sk.spdPer * list.length);
      break;
    }
    case '关平': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).forEach(e => {
        const ep = pathPos(S.id, e.dist);
        const a = Math.atan2(ep.y - c.y, ep.x - c.x);
        const diff = Math.abs(((a - u.facing + Math.PI * 3) % TAU) - Math.PI);
        if (diff <= 0.55) damageEnemy(e, dmg * sk.dmgMult, u);
      });
      G.effects.push({ type: 'beam', x: c.x, y: c.y, angle: u.facing, len: range * sk.rangeMult, life: 0.4, maxLife: 0.4, color: '#c39bff', width: 14 });
      break;
    }
    case '关兴': {
      enemiesInRange(S, c.x, c.y, range * sk.rangeMult).forEach(e => damageEnemy(e, dmg * sk.dmgMult, u));
      G.effects.push({ type: 'ring', x: c.x, y: c.y, r0: 0.3, r1: range * sk.rangeMult, life: 0.5, maxLife: 0.5, color: '#ff8a5c' });
      break;
    }
  }
}

/* ============================== 10. 特效与飘字 ============================== */
function updateEffects(dt) {
  for (const f of G.floats) { f.life -= dt; f.y -= dt * 0.8; }
  G.floats = G.floats.filter(f => f.life > 0);
  for (const e of G.effects) {
    e.life -= dt;
    if (e.type === 'spark') { e.x += e.vx * dt; e.y += e.vy * dt; e.vx *= 0.94; e.vy *= 0.94; }
  }
  G.effects = G.effects.filter(e => e.life > 0);
}

/* ============================== 11. 人机对手 ============================== */
function bestLockedCell(S, range) {
  let best = null, bestScore = -1;
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const cell = G.board[r][c];
    if (cell.owner !== S.id || cell.kind !== 'locked') continue;
    // 评分：以该格为中心，路径在攻击范围内的格子数越多越好
    let score = 0;
    for (const idx of PATH[S.id].cells) {
      const pr = Math.floor(idx / CFG.COLS), pc = idx % CFG.COLS;
      if (Math.hypot(pc + 0.5 - (c + 0.5), pr + 0.5 - (r + 0.5)) <= range) score++;
    }
    // 略微偏好靠近中线的位置
    if (S.id === 'P') score += (CFG.ROWS - 1 - r) * 0.01;
    else score += r * 0.01;
    if (score > bestScore) { bestScore = score; best = { c, r }; }
  }
  return best;
}
/* 人机放置：优先放在能覆盖更多路径的空白方块 */
function bestSlotFor(S, u) {
  const slots = emptySlotsOf(S);
  if (!slots.length) return null;
  const range = unitRange(u);
  let best = slots[0], bestScore = -1;
  for (const cell of slots) {
    let score = 0;
    for (const idx of PATH[S.id].cells) {
      const pr = Math.floor(idx / CFG.COLS), pc = idx % CFG.COLS;
      if (Math.hypot(pc + 0.5 - (cell.c + 0.5), pr + 0.5 - (cell.r + 0.5)) <= range) score++;
    }
    if (score > bestScore) { bestScore = score; best = cell; }
  }
  return best;
}

function boardUnitsOf(S) {
  const out = [];
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const u = G.board[r][c].unit;
    if (u && u.side === S.id) out.push(u);
  }
  return out;
}
function emptySlotsOf(S) {
  const out = [];
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const cell = G.board[r][c];
    if (cell.owner === S.id && cell.kind === 'slot' && !cell.unit) out.push(cell);
  }
  return out;
}
function wouldCompleteHero(S, ch) {
  return boardUnitsOf(S).some(u => u.kind === 'char' && u.char !== ch &&
    HEROES.some(h => h.chars.includes(u.char) && h.chars.includes(ch)));
}

function aiTick(dt) {
  const S = G.sides.E;
  if (!S || G.phase === 'over') return;
  G.aiTimer -= dt;
  if (G.aiTimer > 0) return;
  G.aiTimer = CFG.AI.THINK;

  /* 1. 征兵 */
  let guard = 0;
  while (benchFree(S) >= CFG.SUMMON_UNITS && S.bun >= summonCost(S) && guard++ < CFG.AI.SUMMON_PER_TICK) doSummon(S);

  /* 2. 召唤槽 → 合成到棋盘同类单位 */
  for (let i = 0; i < S.bench.length; i++) {
    const b = S.bench[i];
    if (!b || b.kind === 'shovel') continue;
    const target = boardUnitsOf(S).find(u => canMerge(b, u));
    if (target) mergeInto(target, b);
  }

  /* 3. 棋盘内部合并 */
  let merged = true;
  while (merged) {
    merged = false;
    const list = boardUnitsOf(S);
    outer:
    for (const a of list) for (const b of list) {
      if (a !== b && canMerge(a, b) && mergeInto(b, a)) { merged = true; break outer; }
    }
  }

  /* 4. 放置到空白方块 */
  let placed = true;
  let guardPlace = 0;
  while (placed && guardPlace++ < 30) {
    placed = false;
    const slots = emptySlotsOf(S);
    if (!slots.length) break;
    let pickUnit = S.bench.find(u => u && u.kind === 'char' && !isPaired(u) && wouldCompleteHero(S, u.char));
    if (!pickUnit) pickUnit = S.bench.find(u => u && u.kind === 'soldier');
    if (!pickUnit) pickUnit = S.bench.find(u => u && u.kind === 'char');
    if (pickUnit) {
      /* 单字优先放在「另一半」旁边的空格，凑成组合体 */
      let best = null;
      if (pickUnit.kind === 'char' && !isPaired(pickUnit)) {
        const partner = boardUnitsOf(S).find(x => x.kind === 'char' && !isPaired(x) &&
          x.char !== pickUnit.char && heroNameForChars(x.char, pickUnit.char));
        if (partner && partner.cell) {
          const spots = adjacentFreeCells(partner.cell, S);
          if (spots.length) best = spots[0];
        }
      }
      if (!best) best = bestSlotFor(S, pickUnit);
      if (best) placed = placeFromHand(S, pickUnit, best.c, best.r);   // 只有真的放下才算数
    }
  }

  /* 5. 铲子：手上有铲子就开地（开地总是正收益） */
  let shovel = S.bench.find(u => u && u.kind === 'shovel');
  let guardShovel = 0;
  while (shovel && guardShovel++ < 4) {
    const target = bestLockedCell(S, 2.4);
    if (!target) break;
    if (!useShovel(S, shovel, target.c, target.r)) break;
    shovel = S.bench.find(u => u && u.kind === 'shovel');
  }

  /* 6. 清理凑不出武将的孤字，腾出格子 */
  const chars = boardUnitsOf(S).filter(u => u.kind === 'char');
  const isJunk = ch => !HEROES.some(h => h.chars.includes(ch.char) &&
    (boardUnitsOf(S).some(x => x.kind === 'char' && x !== ch && x.char !== ch.char && h.chars.includes(x.char)) ||
     S.bench.some(x => x && x.kind === 'char' && x !== ch && x.char !== ch.char && h.chars.includes(x.char))));
  if (emptySlotsOf(S).length === 0) {
    const junk = chars.find(isJunk);
    if (junk && S.bench.some(u => u && (u.kind === 'soldier' || u.kind === 'char'))) dismissUnit(S, junk);
  }
  if (benchFree(S) < CFG.SUMMON_UNITS) {
    const jb = S.bench.find(u => u && u.kind === 'char' && isJunk(u));
    if (jb) dismissUnit(S, jb);
  }

  autoMergeHeroes(S);
  validateState();
}

/* ============================== 12. 主循环 ============================== */
let shake = 0;
let lastT = 0;

function update(dt) {
  if (G.paused || G.screen !== 'game') { updateEffects(dt); return; }
  if (G.phase !== 'over') {
    G.time += dt;
    if (shake > 0) shake = Math.max(0, shake - dt);
  }

  if (G.phase === 'prep') {
    G.prepTimer -= dt;
    if (G.prepTimer <= 0) startWave();
  }

  if (G.phase === 'wave' && G.spawnQueue.length) {
    G.spawnTimer += dt;
    while (G.spawnQueue.length && G.spawnTimer >= G.spawnQueue[0].t) {
      const s = G.spawnQueue.shift();
      G.sides.P.enemies.push(makeEnemy('P', s.isBoss, s.bossIdx));
      G.sides.E.enemies.push(makeEnemy('E', s.isBoss, s.bossIdx));
    }
  }

  ['P', 'E'].forEach(id => {
    const S = G.sides[id];
    if (G.phase === 'over') return;
    for (const e of S.enemies) {
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.stun > 0) { e.stun -= dt; continue; }
      e.dist += e.speed * dt;
      if (e.dist >= PATH[id].total) leakEnemy(S, e);
      if (G.phase === 'over') break;
    }
    S.enemies = S.enemies.filter(e => e.alive);
  });

  if (G.phase !== 'over') {
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const u = G.board[r][c].unit;
      if (!u || u.kind === 'shovel') continue;
      if (u.kind === 'char' && !isPaired(u)) continue;     // 未组合的单字不攻击
      if (isPaired(u) && !isPairLead(u)) continue;          // 组合体由首字代表出战（整体算一个单位）
      if (u.hitFlash > 0) u.hitFlash -= dt;
      u.cd -= dt;
      if (u.cd <= 0) {
        if (unitAttack(u)) u.cd = 1 / unitRate(u);
        else u.cd = 0.08;
      }
    }
    aiTick(dt);
  }

  if (G.phase === 'wave' && G.spawnQueue.length === 0 &&
      G.sides.P.enemies.length === 0 && G.sides.E.enemies.length === 0) endWave();

  if (G.phase !== 'over') checkOver();      // 任一方阿斗血量归零立即结算

  updateEffects(dt);
}

/* ============================== 13. 渲染 ============================== */
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawChar(ch, x, y, size, color, stroke, strokeW) {
  ctx.font = '700 ' + size + 'px "Microsoft YaHei","PingFang SC","Heiti SC",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.lineWidth = strokeW || size * 0.18;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.strokeText(ch, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(ch, x, y);
}

const DECOR = (function () {
  const r = mulberry32(99);
  const grass = [];
  for (let i = 0; i < 30; i++) grass.push({ x: r() * W, y: r() * H, s: 0.6 + r() * 0.8 });
  return { grass };
})();

function drawBackground() {
  const pal = G.map.pal;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.bg1);
  g.addColorStop(0.5, pal.bg2);
  g.addColorStop(1, pal.bg1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/* 路径格纹理：每格固定随机，画几道深/浅短痕，做出粗糙感 */
const TILE_TEX = (function () {
  const r = mulberry32(4242);
  const arr = [];
  for (let i = 0; i < CFG.ROWS * CFG.COLS; i++) {
    const n = 4 + Math.floor(r() * 4);
    const marks = [];
    for (let k = 0; k < n; k++) {
      marks.push({ x: 0.10 + r() * 0.80, y: 0.12 + r() * 0.76, w: 0.10 + r() * 0.28, a: r() * 0.7 - 0.35, dark: r() > 0.5 });
    }
    arr.push(marks);
  }
  return arr;
})();

function drawTiles() {
  const pal = G.map.pal;
  const S = CFG.CELL;
  /* 1. 逐格填色：路径 / 空白 / 未开发 */
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const cell = G.board[r][c];
    const p = cellPX(c, r);
    const isP = cell.owner === 'P';
    if (cell.kind === 'path') {
      /* 路径：深红褐色方块 + 粗糙纹理，连成清晰路线 */
      ctx.fillStyle = isP ? pal.pathP : pal.pathE;
      ctx.fillRect(p.x, p.y, S, S);
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x, p.y, S, S);
      ctx.clip();
      TILE_TEX[r * CFG.COLS + c].forEach(m => {
        ctx.globalAlpha = m.dark ? 0.30 : 0.22;
        ctx.fillStyle = m.dark ? (isP ? pal.pathPDark : pal.pathEDark) : (isP ? pal.pathPLite : pal.pathELite);
        ctx.fillRect(p.x + m.x * S, p.y + m.y * S, m.w * S, 3 + (m.a + 0.35) * 4);
      });
      ctx.restore();
    } else if (cell.kind === 'slot') {
      ctx.fillStyle = pal.slot;
      ctx.fillRect(p.x, p.y, S, S);
    } else {
      /* 未开发：与路径相近但更灰更暗，纯色无纹理 */
      ctx.fillStyle = isP ? pal.lockP : pal.lockE;
      ctx.fillRect(p.x, p.y, S, S);
      ctx.fillStyle = isP ? pal.lockPDark : pal.lockEDark;
      ctx.fillRect(p.x, p.y + S - 4, S, 4);
    }
    /* 极细的格子分隔线，让路径与未开发格能区分开 */
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, S - 1, S - 1);
  }
  /* 2. 空白格：实心奶白 + 稍亮的边（无圆点/圆圈装饰） */
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const cell = G.board[r][c];
    if (cell.kind !== 'slot') continue;
    const p = cellPX(c, r);
    ctx.strokeStyle = pal.slotEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 2, p.y + 2, S - 4, S - 4);
    if (cell.kind === 'slot' && !cell.unit && canPlaceNow(cell)) {
      ctx.strokeStyle = '#e0a33a';
      ctx.lineWidth = 3;
      ctx.strokeRect(p.x + 2.5, p.y + 2.5, S - 5, S - 5);
    }
  }
  /* 3. 中线分隔带 */
  const bandY = CFG.PAD + CFG.ROWS_PER_SIDE * S;
  ctx.save();
  const bg = ctx.createLinearGradient(0, bandY, 0, bandY + CFG.GAP);
  bg.addColorStop(0, 'rgba(120,140,90,0.85)');
  bg.addColorStop(1, 'rgba(96,116,72,0.85)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, bandY, W, CFG.GAP);
  ctx.strokeStyle = 'rgba(60,40,50,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, bandY + 0.5); ctx.lineTo(W, bandY + 0.5);
  ctx.moveTo(0, bandY + CFG.GAP - 0.5); ctx.lineTo(W, bandY + CFG.GAP - 0.5);
  ctx.stroke();
  for (let i = 0; i < 26; i++) {
    const x = 10 + i * (W - 20) / 25;
    ctx.strokeStyle = 'rgba(70,96,52,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, bandY + CFG.GAP - 6);
    ctx.quadraticCurveTo(x + 3, bandY + CFG.GAP - 14, x + 6, bandY + CFG.GAP - 18);
    ctx.stroke();
  }
  ctx.restore();
  /* 4. 地图外框加粗（边界感） */
  ctx.save();
  ctx.strokeStyle = pal.frame;
  ctx.lineWidth = 5;
  ctx.strokeRect(CFG.PAD - 2.5, CFG.PAD - 2.5, CFG.COLS * S + 5, CFG.ROWS_PER_SIDE * S + 5);
  ctx.strokeRect(CFG.PAD - 2.5, CFG.PAD + CFG.ROWS_PER_SIDE * S + CFG.GAP - 2.5,
    CFG.COLS * S + 5, CFG.ROWS_PER_SIDE * S + 5);
  ctx.restore();
}

/* 当前是否有单位被选中（用于高亮可放置的空白格） */
function canPlaceNow(cell) {
  if (cell.owner !== 'P' || cell.unit) return false;
  if (!G.sel || G.sel.src !== 'bench') return false;
  const u = G.sides.P.bench[G.sel.i];
  return !!u && u.kind !== 'shovel';
}

function drawGates() {
  /* 出生点：画一个传送门（漩涡 + 光晕），怪物从这里出来 */
  ['P', 'E'].forEach(side => {
    const p = gpToPx(PATH[side].pts[0].x, PATH[side].pts[0].y);
    const R = CFG.CELL * 0.42;
    const t = G.time || 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    // 光晕
    const gg = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.6);
    gg.addColorStop(0, 'rgba(120,200,255,0.55)');
    gg.addColorStop(0.6, 'rgba(90,150,240,0.25)');
    gg.addColorStop(1, 'rgba(90,150,240,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, TAU); ctx.fill();
    // 底盘
    ctx.fillStyle = 'rgba(28,26,44,0.85)';
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    // 漩涡（三条旋转弧线）
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.strokeStyle = k === 0 ? '#9fe4ff' : (k === 1 ? '#7fb6ff' : '#c9a6ff');
      ctx.lineWidth = 3 - k * 0.5;
      ctx.arc(0, 0, R * (0.82 - k * 0.22), t * (2.2 + k) + k * 2.1, t * (2.2 + k) + k * 2.1 + 3.4);
      ctx.stroke();
    }
    // 中心亮点
    ctx.fillStyle = 'rgba(240,250,255,' + (0.65 + 0.25 * Math.sin(t * 4)) + ')';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, TAU); ctx.fill();
    ctx.restore();
  });

  /* 双方阿斗：黑色「斗」字，画在路径最后一格（终点格）内 */
  ['P', 'E'].forEach(side => {
    const poly = PATH[side];
    const last = poly.pts[poly.pts.length - 1];
    const e = gpToPx(last.x, last.y);
    const S = G.sides[side];
    const dead = S.adouHp <= 0;
    const isP = side === 'P';
    ctx.save();
    ctx.globalAlpha = dead ? 0.45 : 1;
    drawChar('斗', e.x, e.y, CFG.CELL * 0.60, '#141414', 'rgba(252,248,238,0.95)', CFG.CELL * 0.12);
    ctx.restore();
    // 血量圆点
    ctx.save();
    for (let i = 0; i < CFG.ADOU_MAX_HP; i++) {
      ctx.globalAlpha = i < S.adouHp ? 0.95 : 0.28;
      ctx.beginPath();
      ctx.arc(e.x - 14 + i * 14, e.y - CFG.CELL * 0.42, 4.5, 0, TAU);
      ctx.fillStyle = i < S.adouHp ? '#e2564f' : '#8a6a72';
      ctx.fill();
    }
    ctx.restore();
    // 归属文字（贴在格子下沿/上沿）
    ctx.save();
    ctx.globalAlpha = 0.9;
    drawChar(isP ? '我方' : '敌方', e.x, e.y + (isP ? CFG.CELL * 0.42 : -CFG.CELL * 0.42),
      12, '#3b2b22', 'rgba(252,248,238,0.9)', 3);
    ctx.restore();
  });
}

function drawUnitBox(u, x, y, size, alpha) {
  const s = size;
  const paired = isPaired(u);
  const heroLike = u.kind === 'hero' || paired;
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  roundRect(x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.88, 10);
  if (u.kind === 'shovel') {
    ctx.fillStyle = '#e9dfd2';
  } else if (heroLike) {
    const g = ctx.createLinearGradient(x, y - s / 2, x, y + s / 2);
    if (u.quality === 'gold') { g.addColorStop(0, '#fff3d0'); g.addColorStop(1, '#f0cf90'); }
    else { g.addColorStop(0, '#f0e6ff'); g.addColorStop(1, '#d3bdf7'); }
    ctx.fillStyle = g;
  } else if (u.kind === 'char') {
    ctx.fillStyle = u.quality === 'gold' ? '#fff0cc' : '#efe4ff';
  } else {
    ctx.fillStyle = '#fffaf0';
  }
  ctx.fill();
  ctx.lineWidth = paired ? 4 : 3;
  ctx.strokeStyle = heroLike ? (u.quality === 'gold' ? '#a5761f' : '#6b3fbe')
    : (u.kind === 'shovel' ? '#6b5a4a' : '#7d5f69');
  ctx.stroke();

  if (u.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, u.hitFlash * 2.5);
    ctx.fillStyle = '#fff';
    roundRect(x - s * 0.44, y - s * 0.44, s * 0.88, s * 0.88, 10);
    ctx.fill();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  }

  let color, txt, fontSize;
  if (u.kind === 'hero') { color = u.quality === 'gold' ? '#b1761a' : '#7b4bd6'; txt = u.name; fontSize = s * 0.30; }
  else if (u.kind === 'char') { color = u.quality === 'gold' ? '#c8891a' : '#7b4bd6'; txt = u.char; fontSize = s * 0.52; }
  else if (u.kind === 'shovel') { color = '#5b4636'; txt = '铲'; fontSize = s * 0.50; }
  else { color = '#241d22'; txt = u.char; fontSize = s * 0.52; }
  drawChar(txt, x, y + 2, fontSize, color, 'rgba(255,255,255,0.75)', fontSize * 0.17);

  /* 组合体：武将名统一画在两格中间（见 drawUnits），卡面只保留字本身 */

  // 等级：卡牌右上角数字（小兵 / 金将 / 紫将 / 拆开的单字都用数字；组合体只画在首字上）
  if (showLevelBadge(u)) {
    const bx = x + s * 0.30, by = y - s * 0.30, rad = s * 0.145;
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, TAU);
    ctx.fillStyle = u.quality === 'purple' ? 'rgba(90,50,150,0.95)' : 'rgba(60,40,25,0.9)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = u.quality === 'purple' ? '#d9c2ff' : '#ffe6a8';
    ctx.stroke();
    drawChar(String(u.level), bx, by + 1, s * 0.185, '#fff8e0', 'rgba(30,15,20,0.85)', 3);
  }

  // 蓝条（组合体共用一条）
  if (heroLike) {
    const bw = s * 0.62, bh = 5;
    const bx = x - bw / 2, by = y + s * 0.29;
    ctx.fillStyle = 'rgba(40,30,45,0.55)';
    roundRect(bx, by, bw, bh, 2.5); ctx.fill();
    ctx.fillStyle = u.mana >= CFG.MANA_MAX ? '#7ee0ff' : '#4aa8e8';
    roundRect(bx + 1, by + 1, Math.max(0, (bw - 2) * (u.mana / CFG.MANA_MAX)), bh - 2, 2); ctx.fill();
  }
  ctx.restore();
}

function drawWeaponArrow(u, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(u.facing);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6, -30);
  ctx.lineTo(10, -30);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, -34); ctx.lineTo(19, -30); ctx.lineTo(10, -26);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(90,60,70,0.55)';
  ctx.stroke();
  ctx.restore();
}

function drawUnits() {
  /* 先画组合体：两个字之间的连线 + 中间的武将名牌（表示这是一个整体） */
  const pairLabels = [];
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const u = G.board[r][c].unit;
    if (!u || !isPaired(u)) continue;
    if (u.id > u.pair.id) continue;                 // 每对只画一次
    if (!u.pair.cell) continue;                     // 另一半不在棋盘上（不应出现，防御性判断）
    const a = cellCenter(c, r);
    const b = cellCenter(u.pair.cell.c, u.pair.cell.r);
    const gold = u.quality === 'gold';
    ctx.save();
    ctx.strokeStyle = gold ? 'rgba(200,137,26,0.9)' : 'rgba(123,75,214,0.9)';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
    pairLabels.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, name: u.heroName, level: u.level, gold });
  }
  for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
    const u = G.board[r][c].unit;
    if (!u) continue;
    const p = cellCenter(c, r);
    /* 组合体：选一个等于选中整体（两格一起高亮 + 外框包住两格） */
    const isSel = G.sel && G.sel.src === 'board' && G.sel.c === c && G.sel.r === r;
    const isPairSel = isSel && isPaired(u) && u.pair.cell;
    if (isPairSel) {
      const q = cellCenter(u.pair.cell.c, u.pair.cell.r);
      ctx.save();
      ctx.strokeStyle = '#ffd25e';
      ctx.lineWidth = 4;
      const x0 = Math.min(p.x, q.x) - CFG.CELL * 0.46, y0 = Math.min(p.y, q.y) - CFG.CELL * 0.46;
      roundRect(x0, y0, Math.abs(p.x - q.x) + CFG.CELL * 0.92, Math.abs(p.y - q.y) + CFG.CELL * 0.92, 12);
      ctx.stroke();
      ctx.restore();
    } else if (isSel) {
      ctx.save();
      ctx.strokeStyle = '#ffd25e';
      ctx.lineWidth = 4;
      roundRect(p.x - CFG.CELL * 0.46, p.y - CFG.CELL * 0.46, CFG.CELL * 0.92, CFG.CELL * 0.92, 12);
      ctx.stroke();
      ctx.restore();
    }
    if ((isPaired(u) && isPairLead(u)) || u.kind === 'hero') drawWeaponArrow(u, p.x, p.y);
    drawUnitBox(u, p.x, p.y, CFG.CELL, u.side === 'E' ? 0.94 : 1);
  }
  /* 组合体名牌：画在两格正中间（在卡牌之后，保证清晰可读） */
  for (const L of pairLabels) {
    const w = 26 + L.name.length * 15, h = 21;
    ctx.save();
    roundRect(L.x - w / 2, L.y - h / 2, w, h, 6);
    ctx.fillStyle = L.gold ? 'rgba(58,38,10,0.92)' : 'rgba(42,22,72,0.92)';
    ctx.fill();
    ctx.strokeStyle = L.gold ? '#ffd98a' : '#d9c2ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    drawChar(L.name + ' Lv.' + L.level, L.x, L.y + 1, 13, L.gold ? '#ffe6a8' : '#e8dcff', 'rgba(20,10,25,0.9)', 2.5);
    ctx.restore();
  }
}

function drawEnemies() {
  ['P', 'E'].forEach(side => {
    const S = G.sides[side];
    for (const e of S.enemies) {
      if (!e.alive) continue;
      const gp = pathPos(side, e.dist);
      const p = gpToPx(gp.x, gp.y);
      const R = e.radius * CFG.CELL;

      if (!e.boss) {
        /* 普通小兵：不画圆圈，只用一个黑色「兵」字 */
        ctx.save();
        ctx.globalAlpha = e.flash > 0 ? 0.55 : 1;
        drawChar('兵', p.x, p.y, CFG.CELL * 0.52, '#141414', 'rgba(252,248,238,0.85)', CFG.CELL * 0.075);
        ctx.restore();
        if (e.stun > 0) {
          ctx.save();
          ctx.fillStyle = '#e8b52c';
          for (let i = 0; i < 3; i++) {
            const a = G.time * 4 + i * TAU / 3;
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(a) * R * 0.9, p.y - R * 1.1 + Math.sin(a) * 5, 4, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
        if (e.doubleUntil > G.time) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,120,60,0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, R + 8, 0, TAU); ctx.stroke();
          ctx.restore();
        }
        const bw = 34, bh = 4;
        ctx.fillStyle = 'rgba(30,18,24,0.55)';
        roundRect(p.x - bw / 2, p.y - R - 16, bw, bh, 2); ctx.fill();
        const rr = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = rr > 0.5 ? '#8fd36a' : rr > 0.25 ? '#e8c04a' : '#e2564f';
        roundRect(p.x - bw / 2 + 1, p.y - R - 15, Math.max(0, (bw - 2) * rr), bh - 2, 1); ctx.fill();
        continue;
      }

      /* Boss：名字竖排 + 专属颜色（本次先保证视觉区分） */
      const name = e.bossName || 'BOSS';
      const col = e.bossColor || '#c0392b';
      const fs = CFG.CELL * CFG.BOSS_FONT;
      const lineH = fs * 1.06;
      const totalH = name.length * lineH;
      const topY = p.y - totalH / 2 + lineH / 2;
      ctx.save();
      // 光晕底
      const gg = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, fs * 2.1);
      gg.addColorStop(0, 'rgba(255,240,200,0.55)');
      gg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(p.x, p.y, fs * 2.1, 0, TAU); ctx.fill();
      // 竖排名字
      ctx.globalAlpha = e.flash > 0 ? 0.6 : 1;
      for (let i = 0; i < name.length; i++) {
        drawChar(name[i], p.x, topY + i * lineH, fs, col, 'rgba(252,248,238,0.95)', fs * 0.26);
      }
      ctx.restore();
      // 眩晕 / 双倍伤害标记
      if (e.stun > 0) {
        ctx.save();
        ctx.fillStyle = '#e8b52c';
        for (let i = 0; i < 3; i++) {
          const a = G.time * 4 + i * TAU / 3;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * fs * 0.9, p.y - totalH / 2 - 12 + Math.sin(a) * 5, 4, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      if (e.doubleUntil > G.time) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,120,60,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(R + 14, fs * 1.1), 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // 血条
      const bw = CFG.CELL * 0.86, bh = 7;
      const by = p.y - totalH / 2 - 20;
      ctx.fillStyle = 'rgba(30,18,24,0.7)';
      roundRect(p.x - bw / 2, by, bw, bh, 3); ctx.fill();
      const ratio = clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = col;
      roundRect(p.x - bw / 2 + 1, by + 1, Math.max(0, (bw - 2) * ratio), bh - 2, 2); ctx.fill();
    }
  });
}

function drawEffects() {
  for (const e of G.effects) {
    const t = 1 - e.life / e.maxLife;
    ctx.save();
    if (e.type === 'ring' || e.type === 'skillRing') {
      const r = (e.r1 !== undefined ? e.r0 + (e.r1 - e.r0) * t : 0.4 + t * 1.4) * CFG.CELL;
      const p = gpToPx(e.x, e.y);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = e.type === 'skillRing' ? 4 : 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
    } else if (e.type === 'slash') {
      const p = gpToPx(e.x, e.y);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 9 * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, e.r * CFG.CELL * (0.8 + t * 0.4), e.angle - 0.7, e.angle + 0.7);
      ctx.stroke();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (e.type === 'beam') {
      const p = gpToPx(e.x, e.y);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = e.color || '#fff';
      ctx.lineWidth = e.width || 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(e.angle) * e.len * CFG.CELL, p.y + Math.sin(e.angle) * e.len * CFG.CELL);
      ctx.stroke();
    } else if (e.type === 'arrow') {
      const p = gpToPx(e.x, e.y), q = gpToPx(e.tx, e.ty);
      const k = clamp(t * 1.6, 0, 1);
      const x = p.x + (q.x - p.x) * k, y = p.y + (q.y - p.y) * k;
      ctx.translate(x, y); ctx.rotate(Math.atan2(q.y - p.y, q.x - p.x));
      ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = '#efe0d0';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(4, -4); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill();
    } else if (e.type === 'ink') {
      const p = gpToPx(e.x, e.y);
      ctx.globalAlpha = (1 - t) * 0.75;
      ctx.fillStyle = '#2b2233';
      ctx.beginPath(); ctx.arc(p.x, p.y, e.r * CFG.CELL * (0.5 + t * 0.6), 0, TAU); ctx.fill();
      ctx.fillStyle = '#7b4bd6';
      ctx.beginPath(); ctx.arc(p.x, p.y, e.r * CFG.CELL * (0.3 + t * 0.4), 0, TAU); ctx.fill();
    } else if (e.type === 'bolt') {
      const p = gpToPx(e.x, e.y), q = gpToPx(e.tx, e.ty);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#cfe9ff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      for (let i = 1; i <= 5; i++) {
        const k = i / 5;
        const nx = p.x + (q.x - p.x) * k + (i < 5 ? (Math.random() - 0.5) * 26 : 0);
        const ny = p.y + (q.y - p.y) * k + (i < 5 ? (Math.random() - 0.5) * 26 : 0);
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    } else if (e.type === 'drain') {
      const p = gpToPx(e.x, e.y), q = gpToPx(e.tx, e.ty);
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#c39bff';
      ctx.lineWidth = 4;
      const k = 1 - t;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y);
      ctx.lineTo(q.x + (p.x - q.x) * k, q.y + (p.y - q.y) * k);
      ctx.stroke();
    } else if (e.type === 'spark') {
      const p = gpToPx(e.x, e.y);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, e.r * (1 - t * 0.5), 0, TAU); ctx.fill();
    } else if (e.type === 'pathWave') {
      const poly = PATH[e.side];
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.strokeStyle = e.color;
      ctx.lineWidth = CFG.CELL * 0.78 * (1 - t * 0.5);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      const upto = poly.total * clamp(t * 1.2, 0, 1);
      let started = false;
      for (let d = 0; d <= upto; d += 0.25) {
        const pp = polyPos(poly, d);
        const px = gpToPx(pp.x, pp.y);
        if (!started) { ctx.moveTo(px.x, px.y); started = true; } else ctx.lineTo(px.x, px.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFloats() {
  for (const f of G.floats) {
    const p = gpToPx(f.x, f.y);
    ctx.save();
    ctx.globalAlpha = clamp(f.life / f.maxLife * 1.6, 0, 1);
    drawChar(f.text, p.x, p.y, f.size || 20, f.color, 'rgba(50,25,35,0.85)', (f.size || 20) * 0.22);
    ctx.restore();
  }
}

/* ---- 攻击范围预览：选中/拖动某个汉字时，把它能打到的范围画出来 ---- */
function canShowRange(u) {
  if (!u) return false;
  if (u.kind === 'shovel') return false;
  if (u.kind === 'char' && !isPaired(u)) return false;   // 单字不攻击，不显示范围
  return true;
}
function rangePreviewTargets() {
  const out = [];   // [{c,r,cx,cy,range,color}]  cx/cy 可选：圆圈中心（组合体取两格中点）
  /* 拖动中：只在鼠标所在格预览，避免满屏圆圈 */
  if (G.drag) {
    const u = G.drag.unit;
    if (!canShowRange(u)) return out;
    const t = G.dragTarget;
    if (t && (t.type === 'cell' || t.type === 'cell-merge' || t.type === 'cell-swap')) {
      return [{ c: t.c, r: t.r, range: unitRange(u), color: isHeroish(u) ? '#7b4bd6' : '#2f7ec4' }];
    }
    return out;
  }
  const src = G.sel;
  if (!src) return out;
  const S = G.sides.P;
  const u = src.src === 'bench' ? S.bench[src.i] : (cellOf(src.c, src.r) || {}).unit;
  if (!canShowRange(u)) return out;
  const color = isHeroish(u) ? '#7b4bd6' : '#2f7ec4';
  if (src.src === 'board') {
    if (u.cell) {
      /* 组合体：无论点哪个字，都以「两个字的中点」为圆心显示同一个范围 */
      const cen = unitCenter(u);
      const t = { c: u.cell.c, r: u.cell.r, range: unitRange(u), color };
      if (isPaired(u)) { t.cx = cen.x; t.cy = cen.y; }
      out.push(t);
    }
  } else {
    /* 手牌单位：在每一个可放置的空闲格子上预览范围
       组合体需要两格，所以只预览「有相邻空格」的落点 */
    for (let r = 0; r < CFG.ROWS; r++) for (let c = 0; c < CFG.COLS; c++) {
      const cell = G.board[r][c];
      if (cell.owner !== 'P' || cell.kind !== 'slot' || cell.unit) continue;
      if (isPaired(u) && !adjacentFreeCells({ c, r }, S).length) continue;
      out.push({ c, r, range: unitRange(u), color });
    }
  }
  return out;
}

function drawRangePreview() {
  const list = rangePreviewTargets();
  if (!list.length) return;
  ctx.save();
  list.forEach(t => {
    const p = (t.cx !== undefined && t.cy !== undefined) ? gpToPx(t.cx, t.cy) : cellCenter(t.c, t.r);
    const rad = t.range * CFG.CELL;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = t.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.setLineDash([7, 6]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = t.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  });
  ctx.restore();
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!G.board.length) return;
  const sx = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
  const sy = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawBackground();
  drawTiles();
  drawRangePreview();
  drawGates();
  drawUnits();
  drawEnemies();
  drawEffects();
  drawFloats();
  drawDropHint();
  ctx.restore();
}

/* 拖动时高亮落点 */
function drawDropHint() {
  if (!G.drag || !G.dragTarget) return;
  const t = G.dragTarget;
  ctx.save();
  if (t.type === 'cell') {
    const p = cellPX(t.c, t.r);
    ctx.lineWidth = 4;
    ctx.strokeStyle = t.ok ? '#3fae4a' : '#d8443c';
    ctx.setLineDash([9, 6]);
    roundRect(p.x + 3, p.y + 3, CFG.CELL - 6, CFG.CELL - 6, 9);
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================== 14. 交互 ============================== */
function canvasCellFromEvent(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (W / rect.width);
  const y = (ev.clientY - rect.top) * (H / rect.height);
  const c = Math.floor((x - CFG.PAD) / CFG.CELL);
  let r = Math.floor((y - CFG.PAD) / CFG.CELL);
  const p5 = CFG.PAD + CFG.ROWS_PER_SIDE * CFG.CELL;
  if (y >= p5 + CFG.GAP) r = Math.floor((y - CFG.PAD - CFG.GAP) / CFG.CELL);
  else if (y >= p5) return null;      // 中线分隔带
  if (c < 0 || c >= CFG.COLS || r < 0 || r >= CFG.ROWS) return null;
  return { c, r };
}

function selectBench(i) {
  const S = G.sides.P;
  const u = S.bench[i];
  if (G.sel && G.sel.src === 'bench' && G.sel.i === i) G.sel = null;
  else if (u) G.sel = { src: 'bench', i };
  else if (G.sel && G.sel.src === 'board') {
    // 点空槽位 = 把棋盘上的单位撤回召唤槽
    const bu = cellOf(G.sel.c, G.sel.r).unit;
    if (bu && withdrawToBench(S, bu, i)) { G.sel = null; toast('已撤回待放置区'); }
  } else if (G.sel && G.sel.src === 'bench') {
    const from = S.bench[G.sel.i];
    if (from) {
      if (isPaired(from) && from.pair !== S.bench[i]) {
        unlinkPair(from);
        toast('已拆开组合体，两个字各自独立（保留等级）');
      }
      if (swapBench(S, G.sel.i, i)) G.sel = { src: 'bench', i };
    }
  }
  renderBench(); updateHint();
}

function handleBoardClick(ev) {
  if (suppressClick) return;          // 刚结束的拖拽/点击手势，忽略随后的 click
  if (G.screen !== 'game' || G.paused || G.phase === 'over') return;
  const pos = canvasCellFromEvent(ev);
  if (!pos) { G.sel = null; renderBench(); updateHint(); return; }   // 边界/棋盘外：关闭范围
  const { c, r } = pos;
  const cell = G.board[r][c];
  const S = G.sides.P;

  /* 点路径 / 未开发格 / 外框：只关闭攻击范围显示，不弹提示 */
  if (cell.owner !== 'P' || cell.kind !== 'slot') {
    if (G.sel) { G.sel = null; renderBench(); updateHint(); }
    return;
  }

  if (G.sel && G.sel.src === 'bench') {
    const u = S.bench[G.sel.i];
    if (!u) { G.sel = null; renderBench(); updateHint(); return; }
    if (u.kind === 'shovel') {
      // 铲子点在已经是空白格的位置：不算错，静默取消
      if (useShovel(S, u, c, r)) { G.sel = null; renderBench(); updateHint(); }
      return;
    }
    if (cell.unit) {
      if (canMerge(u, cell.unit)) {
        mergeInto(cell.unit, u);
        G.sel = null; renderBench(); updateHint(); autoMergeHeroes(S);
      } else if (isPaired(u) && u.pair === cell.unit) {
        toast('这是同一个组合体的另一半，拖动其中一个字到别的格子即可拆开');
      } else toast('两者不能合成，拖到待放置区内的汉字上可以交换位置');
      return;
    }
    if (isPaired(u)) { unlinkPair(u); toast('已拆开组合体（保留等级）'); }
    if (placeFromHand(S, u, c, r)) { G.sel = null; renderBench(); updateHint(); autoMergeHeroes(S); }
    return;
  }

  if (G.sel && G.sel.src === 'board') {
    const src = cellOf(G.sel.c, G.sel.r).unit;
    if (!src) { G.sel = null; renderBench(); updateHint(); return; }
    if (G.sel.c === c && G.sel.r === r) { G.sel = null; renderBench(); updateHint(); return; }
    if (cell.unit) {
      if (canMerge(src, cell.unit)) {
        mergeInto(cell.unit, src);
        G.sel = null; renderBench(); updateHint(); autoMergeHeroes(S); return;
      }
      // 点到自己组合体的另一半：不拆
      if (isPaired(src) && src.pair === cell.unit) { G.sel = null; renderBench(); updateHint(); return; }
      if (isPaired(src)) { unlinkPair(src); toast('已拆开组合体（保留等级）'); }
      swapBoardUnits(src, cell.unit);
      G.sel = null; renderBench(); updateHint(); return;
    }
    if (isPaired(src)) { unlinkPair(src); toast('已拆开组合体（保留等级）'); }
    boardClear(src);
    cell.unit = src;
    src.cell = { c, r };
    G.sel = null; renderBench(); updateHint(); autoMergeHeroes(S);
    return;
  }

  if (cell.unit) { G.sel = { src: 'board', c, r }; renderBench(); updateHint(); }
}

/* ============================== 14.5 拖拽（指针事件，桌面 + 手机通用） ============================== */
let suppressClick = false;
let pointerDownInfo = null;
let pointerKind = 'mouse';       // 'mouse' | 'touch' | 'pen'

/* 触屏震动反馈（不支持的设备直接忽略） */
function haptic(kind) {
  if (!CFG.TOUCH.HAPTIC) return;
  if (pointerKind === 'mouse') return;
  if (!navigator || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(kind === 'bad' ? CFG.TOUCH.HAPTIC_BAD : CFG.TOUCH.HAPTIC_DROP); } catch (e) { }
}
/* 当前指针类型对应的拖动阈值 */
function dragThreshold() {
  return pointerKind === 'touch' ? CFG.TOUCH.DRAG_THRESHOLD_TOUCH : CFG.TOUCH.DRAG_THRESHOLD;
}

function dragUnitOf(src) {
  if (!src) return null;
  const S = G.sides.P;
  return src.src === 'bench' ? S.bench[src.i] : (cellOf(src.c, src.r) || {}).unit;
}

function setDragTarget(t) {
  const prev = G.dragTarget;
  G.dragTarget = t;
  const ghostOk = !!(t && (t.type === 'slot' || t.type === 'cell' || t.type === 'cell-merge' || t.type === 'cell-swap' || t.type === 'bench' || t.type === 'camp'));
  const g = document.getElementById('dragGhost');
  if (g) g.classList.toggle('bad', !!(t && !ghostOk));
  const prevBench = prev && prev.type === 'bench';
  const nowBench = t && t.type === 'bench';
  if (prevBench || nowBench) renderBench();     // 高亮待放置区的落点
}

function beginDrag(src, ev) {
  const u = dragUnitOf(src);
  if (!u) return false;
  G.drag = { src, unit: u };
  G.dragTarget = null;
  if (src.src === 'bench') renderBench();
  const g = document.getElementById('dragGhost');
  if (g) {
    g.textContent = u.kind === 'hero' ? u.name : u.char;
    g.classList.remove('hidden', 'bad');
    g.classList.toggle('general', u.kind !== 'soldier');
  }
  moveDrag(ev);
  updateHint();
  return true;
}

function moveDrag(ev) {
  if (!G.drag) return;
  const g = document.getElementById('dragGhost');
  if (g) {
    g.style.left = ev.clientX + 'px';
    g.style.top = ev.clientY + 'px';
  }
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  let target = null;
  if (el) {
    const benchEl = el.closest ? el.closest('[data-bench]') : null;
    const campEl = el.closest ? el.closest('#btnCamp') : null;
    if (benchEl) {
      const i = parseInt(benchEl.getAttribute('data-bench'), 10);
      target = { type: 'bench', i };
    } else if (campEl) {
      target = { type: 'camp' };
    } else if (el.id === 'board') {
      const pos = canvasCellFromEvent(ev);
      if (pos) {
        const cell = G.board[pos.r][pos.c];
        const u = G.drag.unit;
        let ok = false, kind = 'bad';
        if (cell.owner !== 'P') { ok = false; }
        else if (u.kind === 'shovel') { ok = cell.kind === 'locked'; kind = ok ? 'cell' : 'bad'; }
        else if (cell.unit) { ok = canMerge(u, cell.unit) || cell.unit !== u; kind = ok ? (canMerge(u, cell.unit) ? 'cell-merge' : 'cell-swap') : 'bad'; }
        else if (cell.kind === 'slot') { ok = true; kind = 'cell'; }
        target = { type: 'cell', c: pos.c, r: pos.r, ok, kind, cellHasUnit: !!cell.unit };
        if (kind !== 'cell') target.type = kind === 'cell-merge' ? 'cell-merge' : (kind === 'cell-swap' ? 'cell-swap' : 'cell');
      }
    }
  }
  setDragTarget(target);
}

/* 落点处理：返回是否消耗掉了这次拖动 */
function dropDrag(target) {
  const drag = G.drag;
  if (!drag || !target) return false;
  const S = G.sides.P;
  const u = drag.unit;
  const from = drag.src;
  /* 拖着组合体中的一个字移动 = 拆开（两个字各自独立，等级保留） */
  const partner = u.pair;
  const isPartnerCell = partner && partner.cell && target.type && target.type.indexOf('cell') === 0 &&
    target.c === partner.cell.c && target.r === partner.cell.r;
  const isPartnerSlot = partner && partner.bench >= 0 && target.type === 'bench' && target.i === partner.bench;
  const splitIfNeeded = () => {
    if (isPaired(u)) {
      unlinkPair(u);
      toast('已拆开组合体，两个字各自独立（保留等级）');
    }
  };

  if (target.type === 'camp') {
    if (from.src === 'board') { dismissUnit(S, u); updateUI(); toast('已回收该单位'); return true; }
    return false;
  }

  if (target.type === 'bench') {
    const i = target.i;
    if (isPartnerSlot) return false;                       // 拖到自己的另一半：什么都不做
    if (from.src === 'bench') {
      if (from.i === i) return false;
      const other = S.bench[i];
      splitIfNeeded();
      if (!other) { swapBench(S, from.i, i); updateUI(); return true; }
      if (canMerge(u, other)) { mergeInto(other, u); updateUI(); autoMergeHeroes(S); return true; }
      swapBench(S, from.i, i); updateUI(); return true;      // 不能合成 → 交换位置
    }
    // 棋盘 → 手牌
    const other = S.bench[i];
    if (!other) { if (withdrawToBench(S, u, i)) { updateUI(); toast('已撤回待放置区'); return true; } return false; }
    if (canMerge(u, other)) { mergeInto(other, u); updateUI(); autoMergeHeroes(S); return true; }
    splitIfNeeded();
    if (swapBoardBench(S, u, i)) { updateUI(); return true; }   // 不能合成 → 交换位置
    return false;
  }

  if (target.type === 'cell' || target.type === 'cell-merge' || target.type === 'cell-swap') {
    const c = target.c, r = target.r;
    const cell = G.board[r][c];
    /* 拖到路径上 / 敌方区域：什么都不提示，直接回到原位 */
    if (cell.owner !== 'P' || cell.kind === 'path') return false;
    if (isPartnerCell) return false;                       // 拖到自己的另一半：保持组合
    if (u.kind === 'shovel') {
      if (cell.kind === 'locked') return useShovel(S, u, c, r);
      return false;
    }
    if (cell.unit) {
      if (canMerge(u, cell.unit)) { mergeInto(cell.unit, u); updateUI(); autoMergeHeroes(S); return true; }
      splitIfNeeded();
      if (from.src === 'board') { swapBoardUnits(u, cell.unit); updateUI(); return true; }
      if (swapBoardBench(S, cell.unit, from.i)) { updateUI(); return true; }  // 手牌与地图互换
      return false;
    }
    if (cell.kind !== 'slot') {
      if (!S.isAI) toast('未解锁区域：需要用铲子开垦');
      return false;
    }
    splitIfNeeded();
    if (from.src === 'bench') {
      if (placeFromHand(S, u, c, r)) { updateUI(); autoMergeHeroes(S); return true; }
      return false;
    }
    // 棋盘内移动
    boardClear(u);
    cell.unit = u;
    u.cell = { c, r };
    updateUI(); autoMergeHeroes(S);
    return true;
  }
  return false;
}

function endDrag(ev, cancelled) {
  if (!G.drag) return;
  const target = G.dragTarget;
  const g = document.getElementById('dragGhost');
  if (g) g.classList.add('hidden');
  if (cancelled) {
    G.drag = null; G.dragTarget = null;
    renderBench(); updateHint();
    return;
  }
  suppressClick = true;
  const consumed = dropDrag(target);      // 注意：此时 G.drag 仍然有效
  G.drag = null;
  G.dragTarget = null;
  if (!consumed) {
    if (target && target.type === 'cell' && G.board[target.r][target.c].owner !== 'P') toast('这是敌方区域');
    if (target) haptic('bad');
    renderBench(); updateHint();
  } else {
    haptic('drop');
    updateHint();
  }
}

/* 没有移动 = 单击：选中并显示攻击范围 */
function tapSelect(src) {
  if (!src) return;
  suppressClick = true;
  if (src.src === 'bench') selectBench(src.i);
  else { G.sel = { src: 'board', c: src.c, r: src.r }; renderBench(); updateHint(); }
}

function onPointerDown(ev) {
  suppressClick = false;                 // 新手势开始，解除上一次的点击屏蔽
  if (G.screen !== 'game' || G.paused || G.phase === 'over') return;
  if (ev.pointerType) pointerKind = ev.pointerType;
  if (ev.pointerType === 'mouse' && ev.button !== undefined && ev.button !== 0) return;
  const el = ev.target;
  const benchEl = el && el.closest ? el.closest('[data-bench]') : null;
  let src = null;
  if (benchEl) {
    const i = parseInt(benchEl.getAttribute('data-bench'), 10);
    if (G.sides.P.bench[i]) src = { src: 'bench', i };
  } else if (el && el.id === 'board') {
    const pos = canvasCellFromEvent(ev);
    if (pos) {
      const cell = G.board[pos.r][pos.c];
      if (cell.unit && cell.owner === 'P') src = { src: 'board', c: pos.c, r: pos.r };
    }
  }
  pointerDownInfo = src ? { src, x: ev.clientX, y: ev.clientY } : null;
  if (src && ev.cancelable) ev.preventDefault();   // 触屏：阻止随后的滚动/长按菜单
}

function onPointerMove(ev) {
  if (ev.pointerType && ev.pointerType !== 'mouse') pointerKind = ev.pointerType;
  if (!pointerDownInfo) return;
  if (!G.drag) {
    const d = Math.hypot(ev.clientX - pointerDownInfo.x, ev.clientY - pointerDownInfo.y);
    if (d <= dragThreshold()) return;    // 还没超过阈值：仍算点击
    beginDrag(pointerDownInfo.src, ev);
    if (!G.drag) return;
    haptic('drop');
  }
  moveDrag(ev);
}

function onPointerUp() {
  if (G.drag) { endDrag(null, false); pointerDownInfo = null; return; }
  if (pointerDownInfo) { tapSelect(pointerDownInfo.src); pointerDownInfo = null; }
}

function onPointerCancel() {
  pointerDownInfo = null;
  if (!G.drag) return;
  endDrag(null, true);
}

/* ---- 手机相关：安全区 / 旋转提示 / 触屏细节 ---- */
function isPortrait() {
  if (window.matchMedia) return window.matchMedia('(orientation:portrait)').matches;
  return window.innerHeight >= window.innerWidth;
}
let rotateDismissed = false;
function updateRotateHint() {
  const el = document.getElementById('rotateHint');
  if (!el) return;
  /* 只在「触屏设备 + 横屏 + 很矮」时提示，点一下可忽略（桌面窄窗口不提示） */
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  const phone = Math.min(window.innerWidth, window.innerHeight) <= 520;
  const show = !rotateDismissed && coarse && phone && !isPortrait();
  el.classList.toggle('show', show);
}
function bindMobile() {
  const el = document.getElementById('rotateHint');
  if (el) el.onclick = () => { rotateDismissed = true; updateRotateHint(); };
  window.addEventListener('resize', updateRotateHint);
  window.addEventListener('orientationchange', () => setTimeout(updateRotateHint, 120));
  if (window.matchMedia) {
    const mq = window.matchMedia('(orientation:portrait)');
    if (mq.addEventListener) mq.addEventListener('change', updateRotateHint);
    else if (mq.addListener) mq.addListener(updateRotateHint);
  }
  updateRotateHint();
  /* 双击缩放 / 长按菜单 / 双指缩放：全部屏蔽（棋盘与备战席） */
  ['board', 'bench', 'btnCamp'].forEach(id => {
    const n = document.getElementById(id);
    if (!n) return;
    n.addEventListener('contextmenu', e => e.preventDefault());
    n.addEventListener('dblclick', e => e.preventDefault());
    n.addEventListener('gesturestart', e => e.preventDefault());
  });
  /* 拖到屏幕外松手：手机上没有 window 之外的 pointerup，兜底在 blur/visibilitychange 取消 */
  window.addEventListener('blur', () => { if (G.drag) onPointerCancel(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.drag) onPointerCancel(); });
}

/* ============================== 15. UI 与启动 ============================== */

/* ---- 主界面水墨背景 + 中央方阵 / 斗 / 赵云 / 长矛（全部 Canvas 绘制，无外部图片） ---- */
const menuCanvas = document.getElementById('menuBg');

function drawMenuArt() {
  if (!menuCanvas) return;
  const w = menuCanvas.clientWidth, h = menuCanvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  menuCanvas.width = Math.round(w * dpr);
  menuCanvas.height = Math.round(h * dpr);
  const g = menuCanvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  /* 1. 底色：淡墨到土黄 */
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#ddd6c8');
  base.addColorStop(0.35, '#e7dfd0');
  base.addColorStop(0.62, '#d8cbb4');
  base.addColorStop(1, '#bfae94');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  /* 2. 中间亮雾 */
  const glow = g.createRadialGradient(w * 0.5, h * 0.46, w * 0.05, w * 0.5, h * 0.46, w * 0.75);
  glow.addColorStop(0, 'rgba(255,252,240,0.85)');
  glow.addColorStop(0.55, 'rgba(250,244,230,0.35)');
  glow.addColorStop(1, 'rgba(240,232,214,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);

  /* 3. 水墨远山（多层，平缓起伏） */
  const ridge = (yBase, amp, color, seed, alpha) => {
    const r = mulberry32(seed);
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(-10, h);
    g.lineTo(-10, yBase);
    let x = -10;
    while (x < w + 10) {
      const step = w * (0.26 + r() * 0.16);
      const peak = amp * (0.55 + r() * 0.75);
      const nx = x + step;
      g.quadraticCurveTo(x + step * 0.5, yBase - peak, nx, yBase - peak * 0.12);
      x = nx;
    }
    g.lineTo(w + 10, h);
    g.closePath();
    g.fill();
    g.restore();
  };
  ridge(h * 0.38, h * 0.13, '#9f998c', 11, 0.45);
  ridge(h * 0.47, h * 0.11, '#8a8376', 22, 0.42);
  ridge(h * 0.58, h * 0.10, '#6f685c', 33, 0.38);

  /* 4. 云雾带 */
  const mist = (y, hh, alpha) => {
    const mg = g.createLinearGradient(0, y - hh, 0, y + hh);
    mg.addColorStop(0, 'rgba(255,255,255,0)');
    mg.addColorStop(0.5, 'rgba(255,255,255,' + alpha + ')');
    mg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = mg;
    g.fillRect(0, y - hh, w, hh * 2);
  };
  mist(h * 0.33, h * 0.05, 0.75);
  mist(h * 0.50, h * 0.055, 0.65);
  mist(h * 0.70, h * 0.06, 0.45);

  /* 5. 斜放的格子方阵（透视） */
  const cell = Math.min(w, h) * 0.125;
  const gx = w * 0.5, gy = h * 0.46;
  g.save();
  g.translate(gx, gy);
  g.transform(1, -0.16, 0.86, 0.42, 0, 0);          // 等距透视
  const cols = 4, rows = 3;
  const ox = -cols * cell * 0.5, oy = -rows * cell * 0.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + c * cell, y = oy + r * cell;
      const dark = (r === 1 && c === 2);
      g.fillStyle = dark ? 'rgba(78,82,54,0.85)' : 'rgba(246,240,224,0.9)';
      g.fillRect(x, y, cell, cell);
      g.lineWidth = 2.4;
      g.strokeStyle = dark ? 'rgba(40,42,26,0.9)' : 'rgba(72,60,44,0.75)';
      g.strokeRect(x, y, cell, cell);
      if (dark) {
        g.strokeStyle = 'rgba(30,32,20,0.55)';
        g.lineWidth = 1;
        for (let k = 1; k < 4; k++) {
          g.beginPath();
          g.moveTo(x, y + cell * k / 4);
          g.lineTo(x + cell, y + cell * k / 4);
          g.stroke();
        }
      }
    }
  }
  g.restore();

  /* 6. 长矛（先画，让「斗」压在矛上，层次更清楚） */
  g.save();
  const sx = w * 0.43, sy = h * 0.60, ex = w * 0.575, ey = h * 0.275;
  g.strokeStyle = '#f2ede2';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  g.strokeStyle = 'rgba(90,78,60,0.6)';
  g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
  g.translate(ex, ey);
  g.rotate(Math.atan2(ey - sy, ex - sx));
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(-9, -7); g.lineTo(-9, 7);
  g.closePath();
  g.fillStyle = '#f8f4ea';
  g.strokeStyle = '#5b5040';
  g.lineWidth = 1.5;
  g.fill(); g.stroke();
  g.beginPath();
  g.moveTo(1, 0); g.lineTo(-28, -5); g.lineTo(-28, 5);
  g.closePath();
  g.fillStyle = '#cfd6dc';
  g.fill(); g.stroke();
  g.restore();
  /* 红缨 */
  g.save();
  g.strokeStyle = '#b5372c';
  g.lineWidth = 3;
  const tAng = Math.atan2(ey - sy, ex - sx);
  const tX = ex - 26 * Math.cos(tAng), tY = ey - 26 * Math.sin(tAng);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(tX, tY);
    g.quadraticCurveTo(tX - 5 - i * 3, tY + 12 + i * 4, tX - 11 - i * 4, tY + 26 + i * 5);
    g.stroke();
  }
  g.restore();

  /* 7. 中央大「斗」+ 上方小冠冕（压在最上层） */
  const douSize = Math.min(w * 0.33, h * 0.145);
  const douY = h * 0.40;
  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 ' + douSize + 'px "STKaiti","KaiTi","Kaiti SC","楷体","STSong",serif';
  g.shadowColor = 'rgba(40,30,18,0.35)';
  g.shadowBlur = douSize * 0.10;
  g.shadowOffsetY = douSize * 0.03;
  g.fillStyle = '#1d1712';
  g.fillText('斗', w * 0.5, douY);
  g.restore();
  /* 冠冕（小黄旗 + 黑流苏） */
  g.save();
  const crW = douSize * 0.46, crH = douSize * 0.17;
  const crX = w * 0.5 - crW / 2, crY = douY - douSize * 0.72;
  g.fillStyle = '#e8b52c';
  g.strokeStyle = '#3b2a12';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(crX, crY + crH);
  g.lineTo(crX + crW * 0.14, crY);
  g.lineTo(crX + crW, crY + crH * 0.28);
  g.lineTo(crX + crW * 0.86, crY + crH);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#1d1712';
  g.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const bx = crX + crW * (0.2 + i * 0.2);
    g.beginPath();
    g.moveTo(bx, crY + crH);
    g.lineTo(bx - 2, crY + crH + crH * 0.7);
    g.stroke();
  }
  g.restore();

  /* 8. 红色「赵云」 */
  g.save();
  g.translate(w * 0.5, h * 0.565);
  g.rotate(-0.05);
  const zy = Math.min(w * 0.165, h * 0.070);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 ' + zy + 'px "STKaiti","KaiTi","Kaiti SC","楷体","STSong",serif';
  g.lineWidth = zy * 0.14;
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(250,244,230,0.95)';
  g.strokeText('赵云', 0, 0);
  g.fillStyle = '#ad4a24';
  g.fillText('赵云', 0, 0);
  g.restore();

  /* 9. 前景草丛 + 墨点 */
  const rr = mulberry32(7);
  g.save();
  g.strokeStyle = 'rgba(72,64,44,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const x = rr() * w;
    const y = h * (0.80 + rr() * 0.18);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 4, y - 12, x + 11, y - 20);
    g.stroke();
  }
  g.globalAlpha = 0.25;
  g.fillStyle = '#4a4236';
  for (let i = 0; i < 18; i++) {
    const x = rr() * w, y = rr() * h;
    g.beginPath();
    g.arc(x, y, 1 + rr() * 2.6, 0, TAU);
    g.fill();
  }
  g.restore();
}

/* ---- 主界面文字刷新 ---- */
function refreshMenuUI() {  const g = document.getElementById('muGold');
  const s = document.getElementById('muStamina');
  const r = document.getElementById('muRank');
  const st = document.getElementById('muStars');
  if (!g) return;
  g.textContent = UI_CFG.gold;
  const stm = UI_CFG.stamina;
  s.textContent = Math.max(0, stm.current) + '/' + stm.max;
  s.parentElement.classList.toggle('off', stm.current <= 0);
  r.textContent = rankText();
  st.textContent = starText();
}

const HINT_IDLE = '拖动或点选「营」里的汉字 → 放到棋盘空白方块；武将的两个字相邻即组合，拖走其中一个即可拆开';

function unitLabel(u) {
  if (!u) return '';
  if (isPaired(u)) return u.heroName + ' Lv.' + u.level + '（组合体·' + u.char + '）';
  if (u.kind === 'hero') return u.name + ' Lv.' + u.level;
  if (u.kind === 'soldier') return u.type + '兵 Lv.' + u.level;
  if (u.kind === 'shovel') return '铲子';
  return u.char + (u.level > 1 ? ' Lv.' + u.level : '') + '（将领字）';
}

function updateHint() {
  const el = document.getElementById('hintBar');
  if (G.drag) {
    el.textContent = '拖动中：松手放到空白方块 / 另一个汉字上（可合成或交换）/ 营地可回收';
    return;
  }
  if (!G.sel) { el.textContent = HINT_IDLE; return; }
  let u = G.sel.src === 'board' ? (cellOf(G.sel.c, G.sel.r) || {}).unit : G.sides.P.bench[G.sel.i];
  if (!u) { G.sel = null; el.textContent = HINT_IDLE; return; }
  const name = unitLabel(u);
  if (u.kind === 'shovel') el.textContent = '已选中「铲子」→ 点/拖到未解锁的灰格开垦成空白方块';
  else if (isPaired(u)) el.textContent = '已选中「' + name + '」攻击范围 ' + unitRangeText(u) + ' → 把其中一个字拖到别的格子即可拆开';
  else if (u.kind === 'char') el.textContent = '已选中「' + name + '」→ 与另一张单字相邻放下即可组成武将（相同单字可叠放升级）';
  else el.textContent = '已选中「' + name + '」攻击范围 ' + unitRangeText(u) + '（虚线圆圈所示）→ 点空白方块放置';
}

/* 是否在卡面上显示等级徽章（棋盘与备战席共用同一规则） */
function showLevelBadge(u) {
  if (!u || u.kind === 'shovel') return false;
  if (u.kind === 'char' && !isPaired(u)) return u.level > 1;   // 1 级单字不显示，避免嘈杂
  if (isPaired(u)) return isPairLead(u);                        // 组合体只在出战那个字上显示
  return true;
}

function renderBench() {
  const el = document.getElementById('bench');
  el.innerHTML = '';
  const S = G.sides.P;
  for (let i = 0; i < CFG.BENCH_SIZE; i++) {
    const u = S.bench[i];
    const d = document.createElement('div');
    const dragging = G.drag && G.drag.src.src === 'bench' && G.drag.src.i === i;
    const dropTarget = G.dragTarget && G.dragTarget.type === 'bench' && G.dragTarget.i === i;
    d.className = 'bench-slot' + (u ? ' has' : ' empty')
      + (u && u.kind !== 'soldier' ? ' general' : '')
      + (u && u.kind === 'shovel' ? ' shovel' : '')
      + (u && isPaired(u) ? ' pair' : '')
      + (dragging ? ' dragging' : '')
      + (dropTarget ? ' dropok' : '')
      + (G.sel && G.sel.src === 'bench' && G.sel.i === i ? ' sel' : '');
    d.setAttribute('data-bench', String(i));
    if (u) {
      d.textContent = u.kind === 'hero' ? u.name : u.char;
      d.title = u.kind === 'shovel' ? '铲子：可开垦一块未解锁的格子'
        : (unitLabel(u) + (canShowRange(u) ? '（攻击范围 ' + unitRangeText(u) + '）' : ''));
      /* 等级徽章：备战席的 5 个格子也是「普通格子」（只是离棋盘无限远），所以一样显示等级 */
      if (showLevelBadge(u)) {
        const lv = document.createElement('i');
        lv.className = 'slot-lv' + (u.quality === 'purple' ? ' purple' : '');
        lv.textContent = String(u.level);
        d.appendChild(lv);
      }
      /* 组合体：标出武将名，方便看出哪两个槽位是一对 */
      if (isPaired(u)) {
        const nm = document.createElement('b');
        nm.className = 'slot-hero';
        nm.textContent = u.heroName;
        d.appendChild(nm);
      }
    }
    d.onclick = () => {
      if (suppressClick) return;      // 手势结束后的 click 忽略
      if (G.paused || G.phase === 'over') return;
      selectBench(i);
    };
    el.appendChild(d);
  }
}

let lastHud = {};
function updateHUD() {
  const S = G.sides.P, E = G.sides.E;
  if (!S || !E) return;
  const bunEl = document.getElementById('bunCount');
  const costEl = document.getElementById('summonCost');
  const waveEl = document.getElementById('waveText');
  const subEl = document.getElementById('waveSub');
  const mapEl = document.getElementById('mapName');
  const cost = summonCost(S);
  const free = benchFree(S);

  if (lastHud.bun !== S.bun) { bunEl.textContent = S.bun; lastHud.bun = S.bun; }
  if (lastHud.cost !== cost) { costEl.textContent = cost; lastHud.cost = cost; }
  if (lastHud.map !== G.map.name) { mapEl.textContent = G.map.name; lastHud.map = G.map.name; }

  /* 待放置区满员时也能征兵（会先清空重发），所以只在馒头不足时置灰 */
  const off = S.bun < cost || G.phase === 'over' || (!CFG.HAND_REROLL && free < CFG.SUMMON_UNITS);
  document.getElementById('btnSummon').classList.toggle('off', off);

  let main, sub;
  if (G.phase === 'over') {
    main = G.result === 'win' ? '胜利' : '失败';
    sub = G.resultReason || '本局结束';
  } else if (G.phase === 'prep') {
    main = '准备 ' + Math.ceil(Math.max(0, G.prepTimer)) + 's';
    sub = '第 ' + (G.wave + 1) + ' / ' + CFG.TOTAL_WAVES + ' 回合';
  } else {
    main = '第 ' + G.wave + ' / ' + CFG.TOTAL_WAVES + ' 回合';
    sub = '我方剩怪 ' + (S.enemies.length + G.spawnQueue.length) + ' · 敌方剩怪 ' + E.enemies.length;
  }
  if (lastHud.main !== main) { waveEl.textContent = main; lastHud.main = main; }
  if (lastHud.sub !== sub) { subEl.textContent = sub; lastHud.sub = sub; }

  const key = S.adouHp + '/' + E.adouHp;
  if (lastHud.hp !== key) {
    lastHud.hp = key;
    ['P', 'E'].forEach(id => {
      const box = document.getElementById(id === 'P' ? 'heartP' : 'heartE');
      box.innerHTML = '';
      const hp = G.sides[id].adouHp;
      for (let i = 0; i < CFG.ADOU_MAX_HP; i++) {
        const s = document.createElement('span');
        s.className = 'h' + (i < hp ? '' : ' off');
        s.textContent = '♥';
        box.appendChild(s);
      }
    });
  }
}

let toastTimer = null;
function toast(msg) {
  const layer = document.getElementById('toastLayer');
  const d = document.createElement('div');
  d.className = 'toast';
  d.textContent = msg;
  layer.appendChild(d);
  setTimeout(() => { d.remove(); }, 1600);
  while (layer.children.length > 3) layer.removeChild(layer.firstChild);
}

function callout(text) {
  const el = document.getElementById('callout');
  el.textContent = text;
  el.classList.remove('hidden');
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 1400);
}

function updateUI() { renderBench(); updateHUD(); updateHint(); }

function showResult(result) {
  const ov = document.getElementById('resultOverlay');
  document.getElementById('resultTitle').textContent = result === 'win' ? '胜  利' : '失  败';
  const S = G.sides.P, E = G.sides.E;
  const rw = G.rewardInfo || { gold: 0, star: 0 };
  const rewardLine = '<br><span class="reward-line">金币 +' + rw.gold + ' · 段位 ' + rankText() + ' ' + starText() +
    '（' + (rw.star >= 0 ? '+' : '') + rw.star + ' 星）</span>';
  document.getElementById('resultDesc').innerHTML = (result === 'win'
    ? '地图：' + G.map.name + '<br>' + G.resultReason + '<br>我方阿斗剩余 ' + S.adouHp + ' 血 · 击杀 ' + S.kills + ' 个敌人'
    : '地图：' + G.map.name + '<br>' + G.resultReason + '<br>坚持到第 ' + G.wave + ' 回合 · 击杀 ' + S.kills + ' 个敌人（人机击杀 ' + E.kills + '）')
    + rewardLine;
  ov.classList.remove('hidden');
}

/* ---- 地图与开局 ---- */
function randomMap() { return MAPS[(Math.random() * MAPS.length) | 0]; }

function newGame(mapDef) {
  G.time = 0; G.wave = 0; G.phase = 'prep'; G.prepTimer = CFG.PREP_TIME;
  G.spawnQueue = []; G.spawnTimer = 0;
  G.effects = []; G.floats = [];
  G.sel = null; G.result = null; G.resultReason = ''; G.paused = false;
  G.drag = null; G.dragTarget = null; suppressClick = false;
  G.uid = 1; shake = 0; G.aiTimer = 0.6;
  G.sides.P = makeSide('P', false);
  G.sides.E = makeSide('E', true);
  buildMap(mapDef || randomMap());
  lastHud = {};
  document.getElementById('resultOverlay').classList.add('hidden');
  document.getElementById('pauseOverlay').classList.add('hidden');
  updateUI();
  callout(G.map.name + ' · 守住 20 回合');
}

function goMenu() {
  G.screen = 'menu';
  G.drag = null; G.dragTarget = null;
  const ghost = document.getElementById('dragGhost');
  if (ghost) ghost.classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('game').classList.add('hidden');
  document.getElementById('resultOverlay').classList.add('hidden');
  document.getElementById('pauseOverlay').classList.add('hidden');
  document.getElementById('detailOverlay').classList.add('hidden');
}

function goGame() {
  G.screen = 'game';
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  newGame();
}

/* ---- 从主界面开始一局：先检查/扣除体力 ---- */
function startGame() {
  const stm = UI_CFG.stamina;
  if (stm.current < stm.costPerGame) {
    toast('体力不足，无法开始对局（可用「+」补充 · 占位）');
    openDetail('stamina');
    return;
  }
  stm.current -= stm.costPerGame;
  saveUI();
  refreshMenuUI();
  goGame();
}

/* ---- 主菜单内容 ---- */
function heroTableHTML() {
  return '<table class="info-table"><tr><th>武将</th><th>单字</th><th>品质</th><th>技能</th></tr>' +
    HEROES.map(h => '<tr><td class="hl">' + h.name + '</td><td>' + h.chars.join(' + ') + '</td><td>' +
      (h.quality === 'gold' ? '金' : '紫') + '</td><td class="small">' + SKILLS[h.name].name + '</td></tr>').join('') +
    '</table>';
}

function recruitHTML() {
  const W = CFG.SOLDIER_WEIGHTS;
  const total = CFG.SOLDIER_TYPES.reduce((s, t) => s + W[t], 0);
  const rows = CFG.SOLDIER_TYPES.map(t => {
    const p = (W[t] / total * (1 - CFG.SHOVEL_CHANCE - CFG.GENERAL_CHANCE) * 100);
    return '<tr><td class="hl">' + t + '兵</td><td>' + p.toFixed(1) + '%</td><td class="small">近战/远程小兵，同名同级可合成</td></tr>';
  }).join('');
  return '<p class="dlg-note">每次征兵消耗馒头，随机获得 <b>5</b> 个汉字或道具。</p>' +
    '<table class="info-table"><tr><th>产出</th><th>概率</th><th>说明</th></tr>' +
    rows +
    '<tr><td class="hl">武将单字</td><td>' + (CFG.GENERAL_CHANCE * 100).toFixed(1) + '%</td><td class="small">先随机武将，再随机它的两个字之一</td></tr>' +
    '<tr><td class="hl">铲子</td><td>' + (CFG.SHOVEL_CHANCE * 100).toFixed(1) + '%</td><td class="small">可把一块未解锁的灰格开垦成空白方块</td></tr>' +
    '</table>' +
    '<h3 class="dlg-h3">武将单字对照表</h3>' + heroTableHTML();
}

const DETAILS = {
  /* 段位 / 个人信息 */
  rank: () => ({
    title: '段位',
    html: '<div class="rank-row"><div class="rank-badge">' + rankText().replace(/\s.*/, '') + '</div><div class="rank-info">' +
      '<div class="rank-name">' + rankText() + '</div>' +
      '<div class="rank-bar"><i style="width:' + rankProgressPct() + '%"></i></div>' +
      '<div class="rank-note">当前星数：' + starText() + '（赢一局 +1 星，输一局 -1 星）</div></div></div>' +
      '<p class="dlg-note">段位从低到高：' + RANK_NAMES.join(' → ') + '。前 11 个段位各有 5 个小段位（I~V），每个小段位 5 颗星；<b>大帝</b>只用星星累计（★xN）。</p>' +
      '<p class="dlg-note">数值可在 <code>game.js</code> 顶部的 <b>UI_CFG.rank</b> 里改（index / minor / stars）。</p>'
  }),
  profile: () => ({
    title: '用户信息',
    html: '<div class="rank-row"><div class="rank-badge">' + UI_CFG.player.avatar + '</div><div class="rank-info">' +
      '<div class="rank-name">' + UI_CFG.player.name + '</div>' +
      '<div class="rank-bar"><i style="width:100%"></i></div>' +
      '<div class="rank-note">ID：' + UI_CFG.player.id + ' · 段位 ' + rankText() + ' ' + starText() + '</div></div></div>' +
      '<table class="info-table"><tr><th>项目</th><th>数值</th></tr>' +
      '<tr><td class="hl">金币</td><td>' + UI_CFG.gold + '</td></tr>' +
      '<tr><td class="hl">体力</td><td>' + UI_CFG.stamina.current + ' / ' + UI_CFG.stamina.max + '</td></tr>' +
      '<tr><td class="hl">段位</td><td>' + rankText() + ' ' + starText() + '</td></tr>' +
      '</table><p class="dlg-note">（用户系统为占位内容，昵称/ID 可在 UI_CFG.player 里改）</p>'
  }),
  /* 设置 */
  settings: () => ({
    title: '设置',
    html: '<div class="switch-row"><span>音效</span><button class="sw' + (UI_CFG.settings.sfx ? ' on' : '') + '" data-toggle="sfx"></button></div>' +
      '<div class="switch-row"><span>背景音乐</span><button class="sw' + (UI_CFG.settings.bgm ? ' on' : '') + '" data-toggle="bgm"></button></div>' +
      '<div class="switch-row"><span>震动反馈</span><button class="sw' + (UI_CFG.settings.vibrate ? ' on' : '') + '" data-toggle="vibrate"></button></div>' +
      '<p class="dlg-note">以上开关为占位（本项目没有音频资源），状态会记录在 UI_CFG.settings。</p>' +
      '<button class="btn" id="btnHelpFromSettings" style="margin-top:10px">查看玩法说明</button>'
  }),
  /* 体力 */
  stamina: () => ({
    title: '体力',
    html: '<div class="rank-row"><div class="rank-badge">⚡</div><div class="rank-info">' +
      '<div class="rank-name">' + UI_CFG.stamina.current + ' / ' + UI_CFG.stamina.max + '</div>' +
      '<div class="rank-bar"><i style="width:' + (UI_CFG.stamina.current / UI_CFG.stamina.max * 100) + '%"></i></div>' +
      '<div class="rank-note">每局消耗 ' + UI_CFG.stamina.costPerGame + ' 点体力</div></div></div>' +
      '<p class="dlg-note">补充体力（看广告 / 购买）<b>暂未开放</b>，本次仅占位。</p>' +
      '<p class="dlg-note">数值可在 UI_CFG.stamina 里改。</p>'
  }),
  /* 公告 / 回顾 / 排行榜 / 加到桌面 */
  announce: () => ({
    title: '公告',
    html: '<p class="dlg-note"><b>《赵云与阿斗》v0.4 水墨版</b></p>' +
      '<p class="dlg-note">1. 主界面重做为水墨风，新增金币 / 体力 / 段位星星与设置、公告、回顾、排行榜入口。</p>' +
      '<p class="dlg-note">2. 核心玩法不变：5×8 双半场、20 回合人机对战、征兵 / 合成 / 铲子开垦 / 武将技能。</p>' +
      '<p class="dlg-note">3. 段位现在会跟随胜负变化：赢 +1 星，输 -1 星。</p>' +
      '<p class="dlg-note">（公告内容为占位，可在 game.js 的 DETAILS.announce 里改）</p>'
  }),
  review: () => ({
    title: '回顾',
    html: '<p class="dlg-note">对局回顾（战斗录像、伤害统计）<b>暂未开放</b>。</p>' +
      '<p class="dlg-note">当前只有最近一局的简单统计：</p>' +
      (G.lastSummary
        ? '<table class="info-table"><tr><th>项目</th><th>数值</th></tr>' +
          '<tr><td class="hl">地图</td><td>' + G.lastSummary.map + '</td></tr>' +
          '<tr><td class="hl">结果</td><td>' + G.lastSummary.result + '</td></tr>' +
          '<tr><td class="hl">坚持回合</td><td>第 ' + G.lastSummary.wave + ' 回合</td></tr>' +
          '<tr><td class="hl">我方击杀</td><td>' + G.lastSummary.kills + '</td></tr>' +
          '<tr><td class="hl">人机击杀</td><td>' + G.lastSummary.aiKills + '</td></tr></table>'
        : '<p class="dlg-note">还没有进行过对局。</p>')
  }),
  ranking: () => ({
    title: '排行榜',
    html: '<p class="dlg-note">好友榜 / 全服榜<b>暂未开放</b>。</p>' +
      '<table class="info-table"><tr><th>名次</th><th>玩家</th><th>段位</th></tr>' +
      '<tr><td class="hl">1</td><td>子龙</td><td>大帝 ★x128</td></tr>' +
      '<tr><td class="hl">2</td><td>翼德</td><td>大帝 ★x96</td></tr>' +
      '<tr><td class="hl">3</td><td>云长</td><td>君主 V ★5</td></tr>' +
      '<tr><td class="hl">4</td><td>' + UI_CFG.player.name + '（我）</td><td>' + rankText() + ' ' + starText() + '</td></tr>' +
      '</table>'
  }),
  desktop: () => ({
    title: '加到桌面',
    html: '<p class="dlg-note">「加到桌面」在当前版本<b>暂不支持</b>。</p>' +
      '<p class="dlg-note">这是小游戏平台的能力，网页版无法调用。你可以把 <code>index.html</code> 拖到浏览器书签栏，或添加到手机主屏幕作为替代。</p>'
  }),
  /* 武器背包（武器 + 技能，避免主界面再出现独立入口） */
  weapon: () => ({
    title: '武器背包',
    html: '<p class="dlg-note">武器<b>只有武将可以使用</b>，普通小兵（刀/弓/枪/骑）不需要武器，也不显示武器。</p>' +
      '<p class="dlg-note">所有武将的初始武器统一为「白羽箭」（战斗中显示为白色箭头并指向攻击目标）；下表「专属武器」为占位内容，解锁系统本次未实现。</p>' +
      '<table class="info-table"><tr><th>武将</th><th>初始武器</th><th>专属武器</th></tr>' +
      HEROES.map(h => '<tr><td class="hl">' + h.name + '</td><td>白羽箭</td><td>' + h.weapon + '（未解锁）</td></tr>').join('') +
      '</table>' +
      '<h3 class="dlg-h3">武将技能（蓝条满自动释放）</h3>' +
      '<table class="info-table"><tr><th>武将</th><th>技能</th><th>效果</th></tr>' +
      SKILL_SLOT_ORDER.map(n => '<tr><td class="hl">' + n + '</td><td>' + SKILLS[n].name + '</td><td class="small">' + SKILLS[n].desc + '</td></tr>').join('') +
      '</table>'
  }),
  skill: () => ({
    title: '武将技能',
    html: '<p class="dlg-note">武将攻击命中积累蓝条，蓝条满后自动释放专属技能。</p>' +
      '<table class="info-table"><tr><th>武将</th><th>技能</th><th>效果</th></tr>' +
      SKILL_SLOT_ORDER.map(n => '<tr><td class="hl">' + n + '</td><td>' + SKILLS[n].name + '</td><td class="small">' + SKILLS[n].desc + '</td></tr>').join('') +
      '</table>'
  }),
  recruit: () => ({ title: '营 · 招募', html: recruitHTML() })
};

/* 段位进度条百分比（大帝按 100% 显示） */
function rankProgressPct() {
  const r = UI_CFG.rank;
  if (r.index >= FINAL_RANK) return 100;
  return Math.round((clamp(r.stars, 1, STARS_PER_MINOR) / STARS_PER_MINOR) * 100);
}

function openDetail(key) {
  const d = DETAILS[key] ? DETAILS[key]() : null;
  if (!d) return;
  document.getElementById('detailTitle').textContent = d.title;
  const body = document.getElementById('detailBody');
  body.innerHTML = d.html;
  /* 设置界面的开关 */
  body.querySelectorAll('[data-toggle]').forEach(sw => {
    sw.onclick = () => {
      const k = sw.getAttribute('data-toggle');
      UI_CFG.settings[k] = !UI_CFG.settings[k];
      sw.classList.toggle('on', UI_CFG.settings[k]);
      saveUI();
    };
  });
  const helpBtn = document.getElementById('btnHelpFromSettings');
  if (helpBtn) helpBtn.onclick = () => {
    document.getElementById('detailOverlay').classList.add('hidden');
    document.getElementById('helpOverlay').classList.remove('hidden');
  };
  document.getElementById('detailOverlay').classList.remove('hidden');
}

function bindUI() {
  /* 主界面 */
  document.getElementById('btnStart').onclick = startGame;
  document.getElementById('btnCoop').onclick = () => toast('好友联机暂未开放');
  document.getElementById('btnEndless').onclick = () => toast('无尽模式暂未开放');
  document.getElementById('btnBackpack').onclick = () => openDetail('weapon');
  document.getElementById('btnAnnounce').onclick = () => openDetail('announce');
  document.getElementById('btnReview').onclick = () => openDetail('review');
  document.getElementById('btnDesktop').onclick = () => openDetail('desktop');
  document.getElementById('btnRanking').onclick = () => openDetail('ranking');
  document.getElementById('btnSettings').onclick = () => openDetail('settings');
  document.getElementById('btnAvatarLeft').onclick = () => openDetail('profile');
  document.getElementById('btnStamina').onclick = () => openDetail('stamina');
  document.getElementById('btnGold').onclick = () => {
    toast('金币：' + UI_CFG.gold + '（充值/消耗暂未开放）');
    openDetail('profile');
  };
  document.getElementById('btnHelpClose').onclick = () => document.getElementById('helpOverlay').classList.add('hidden');
  document.getElementById('btnDetailClose').onclick = () => document.getElementById('detailOverlay').classList.add('hidden');
  window.addEventListener('resize', () => { if (G.screen === 'menu') drawMenuArt(); });

  document.getElementById('btnSummon').onclick = () => doSummon(G.sides.P);
  document.getElementById('btnCamp').onclick = () => { if (G.screen === 'game') openDetail('recruit'); };
  document.getElementById('btnPause').onclick = () => {
    if (G.phase === 'over') return;
    G.paused = true;
    document.getElementById('pauseDesc').textContent =
      G.phase === 'prep' ? '准备阶段 · 第 ' + (G.wave + 1) + ' 回合即将来袭'
        : '战斗阶段 · 第 ' + G.wave + ' 回合';
    document.getElementById('pauseOverlay').classList.remove('hidden');
  };
  document.getElementById('btnResume').onclick = () => { G.paused = false; document.getElementById('pauseOverlay').classList.add('hidden'); };
  document.getElementById('btnQuit').onclick = goMenu;
  document.getElementById('btnAgain').onclick = () => {
    document.getElementById('resultOverlay').classList.add('hidden');
    startGame();          // 再来一局同样消耗体力
  };
  document.getElementById('btnBackMenu').onclick = goMenu;

  canvas.addEventListener('click', handleBoardClick);
  /* 拖拽：指针按下在「营」或棋盘上开始，移动/松手在 window 上收尾 */
  const benchBox = document.getElementById('bench');
  if (benchBox) benchBox.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  bindMobile();
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); if (G.screen === 'game') document.getElementById('btnPause').click(); }
    if (e.key === 'Escape') { G.sel = null; updateUI(); }
  });
}

/* ---- 主循环 ---- */
function loop(ts) {
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
  lastT = ts;
  if (G.screen === 'game') {
    update(dt);
    updateHUD();
    render();
  }
  requestAnimationFrame(loop);
}

/* ---- 启动 ---- */
(function boot() {
  G.sides.P = makeSide('P', false);
  G.sides.E = makeSide('E', true);
  buildMap(MAPS[0]);
  loadUI();
  refreshMenuUI();
  drawMenuArt();
  renderBench();
  bindUI();
  requestAnimationFrame(ts => { lastT = ts; loop(ts); });
})();

/* 便于调试：window.ADOU = { CFG, UI_CFG, G, PATH, MAPS, HEROES, SKILLS, api } */
window.ADOU = {
  CFG, UI_CFG, G, PATH, MAPS, HEROES, HERO_BY_NAME, SKILLS,
  RANK_NAMES, STARS_PER_MINOR, MINORS_PER_RANK, FINAL_RANK,
  api: {
    goGame, goMenu, startGame, newGame, doSummon, summonCost, startWave, randomMap, buildMap,
    boardPlace, boardClear, withdrawToBench, benchAdd, benchRemove, benchFree,
    mergeInto, canMerge, autoMergeHeroes, useShovel, dismissUnit, clearHand, swapBench, swapBoardBench, swapBoardUnits,
    unitRangeText, rangePreviewTargets, beginDrag, dropDrag, printMap, derivePathFromMatrix,
    handleBoardClick, canvasCellFromEvent,
    isPaired, isHeroish, isPairLead, linkPair, unlinkPair, setPairLevel, heroNameForChars, adjacentFreeCells, checkHeroLevel,
    placeFromHand, repairPairs, enemiesInRange, unitCenter, isOnBoard, showLevelBadge, canDrawAt,
    onPointerDown, onPointerMove, onPointerUp, onPointerCancel, dragThreshold, haptic, updateRotateHint,
    unitDmg, unitRate, unitRange, unitPattern,
    createSoldier, createHero, createChar, createShovel,
    update, render, updateHUD, renderBench, updateUI, updateHint, validateState, openDetail,
    refreshMenuUI, drawMenuArt, rankText, starText, addStars, rankTotal, setRankFromTotal
  }
};













