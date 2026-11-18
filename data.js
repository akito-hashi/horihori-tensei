// ほりほり転生 — ゲームの数値・文章データ（ルールは engine.js）
// 数値は tests/balance.test.js のボットで調整する（クリアまで約 2時間・転生 5〜8回・転生直後は前世の 2.5倍以上速い）
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GOAL = 6371000; // 地球の中心（m）

  // 地層。from: 始まる深さ(m) / hard: かたさ（掘る力をこれで割る） / value: 1m あたりのお金 / wall: 入るのに要る道具
  // grow: 地層の中でも深くなるほどかたくなる度合い（かたさ = hard × (深さ ÷ from)^grow）。地層の境目で柔らかくならないようにしてある
  const LAYERS = [
    { id: "soil", name: "土の層", icon: "🌱", from: 0, hard: 0.891, value: 1, grow: 0 },
    { id: "rock", name: "岩盤の層", icon: "🪨", from: 100, hard: 3.564, value: 5, grow: 0.5 },
    { id: "fossil", name: "化石の層", icon: "🦴", from: 2000, hard: 20.79, value: 40, grow: 0.5 },
    { id: "crust", name: "地殻の底", icon: "🧱", from: 12000, hard: 59.4, value: 150, grow: 0.5 },
    { id: "mantle", name: "マントル", icon: "🔥", from: 35000, hard: 1782, value: 750, grow: 0.5, wall: "suit" },
    { id: "outer", name: "外核", icon: "🌀", from: 2900000, hard: 16483.5, value: 16000, grow: 0.5, wall: "drill" },
    { id: "inner", name: "内核", icon: "💎", from: 5150000, hard: 24725.25, value: 36000, grow: 0.5, wall: "starpick" },
  ];

  // 仲間（4人）。お金で何度でもレベルを上げられる。cost: Lv.1 にする値段 / out: 1レベルあたりの掘る力（毎秒）
  // layer: 仲間になる地層 / node: スキルツリーで仲間になる
  const COMPANIONS = [
    { id: "mog", name: "モグ", kind: "モグラ", cost: 15, out: 1, layer: "soil" },
    { id: "gan", name: "ガンさん", kind: "ベテラン掘り師", cost: 800, out: 30, layer: "rock" },
    { id: "drill", name: "ドリルン", kind: "掘削ロボ", cost: 250000, out: 1500, layer: "fossil" },
    { id: "soko", name: "ソコ", kind: "地底人", cost: 3e9, out: 500000, layer: "soil", node: "f5" },
  ];
  const COST_GROWTH = 1.2;
  // この Lv に着くたびに、その仲間の掘る力 ×2。最初の 4つで見た目も変わる（変身）
  const LV_MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500];

  // 仲間の特技（1回だけ買える）。need: 買えるようになるレベル / cost: 仲間の Lv.1 の値段の何倍か
  const SKILLS = [
    { id: "mog_a", comp: "mog", need: 10, cost: 40, name: "仲よし", desc: "タップに、モグの毎秒の力の 10% が上乗せ", tapShare: 0.1 },
    { id: "mog_b", comp: "mog", need: 25, cost: 330, name: "穴掘り名人", desc: "モグの掘る力 ×3", selfMult: 3 },
    { id: "mog_c", comp: "mog", need: 50, cost: 10000, name: "モグモグ隊", desc: "仲間全員の掘る力 ×1.2", allMult: 1.2 },
    { id: "gan_a", comp: "gan", need: 10, cost: 40, name: "会心の教え", desc: "会心の一撃が出やすい（+5%）", crit: 0.05 },
    { id: "gan_b", comp: "gan", need: 25, cost: 330, name: "鉄の腕", desc: "ガンさんの掘る力 ×3", selfMult: 3 },
    { id: "gan_c", comp: "gan", need: 50, cost: 10000, name: "親方の号令", desc: "仲間全員の掘る力 ×1.2", allMult: 1.2 },
    { id: "drill_a", comp: "drill", need: 10, cost: 40, name: "ターボ", desc: "30秒ごとに 5秒間、ドリルンが 3倍で回る", turbo: true },
    { id: "drill_b", comp: "drill", need: 25, cost: 330, name: "鋼のボディ", desc: "ドリルンの掘る力 ×3", selfMult: 3 },
    { id: "drill_c", comp: "drill", need: 50, cost: 10000, name: "連結ドリル", desc: "仲間全員の掘る力 ×1.2", allMult: 1.2 },
    { id: "soko_a", comp: "soko", need: 10, cost: 40, name: "光の道", desc: "光る鉱石が出やすい（×1.3）", ore: 1.3 },
    { id: "soko_b", comp: "soko", need: 25, cost: 330, name: "地底の知恵", desc: "ソコの掘る力 ×3", selfMult: 3 },
    { id: "soko_c", comp: "soko", need: 50, cost: 10000, name: "地底の祝福", desc: "仲間全員の掘る力 ×1.2", allMult: 1.2 },
  ];
  const TURBO = { every: 30, dur: 5, mult: 3 };

  // 自分の装備（段階を順に買う。1回の人生ごと）
  const GEAR = {
    pick: { name: "つるはし", icon: "⛏️", tiers: [
      { name: "鉄のつるはし", cost: 300, desc: "タップ力 ×3" }, { name: "鋼のつるはし", cost: 20000, desc: "タップ力 ×3" },
      { name: "ダイヤのつるはし", cost: 1e6, desc: "タップ力 ×3" }, { name: "ミスリルのつるはし", cost: 1e8, desc: "タップ力 ×3" },
      { name: "流れ星のつるはし", cost: 1e11, desc: "タップ力 ×3" }], tapMult: 3 },
    glove: { name: "手袋", icon: "🧤", tiers: [
      { name: "軍手", cost: 2000, desc: "連打したときの力 +50%" }, { name: "青い手袋", cost: 2e6, desc: "連打したときの力 +50%" },
      { name: "金の手袋", cost: 2e9, desc: "連打したときの力 +50%" }], combo: 0.5 },
    helmet: { name: "ヘルメットのライト", icon: "⛑️", tiers: [
      { name: "ヘルメット", cost: 50000, desc: "光る鉱石が見つけやすい（×1.25）" }, { name: "ヘッドライト", cost: 5e7, desc: "光る鉱石が見つけやすい（×1.25）" },
      { name: "金のヘルメット", cost: 5e10, desc: "光る鉱石が見つけやすい（×1.25）" }], ore: 1.25 },
    boots: { name: "ブーツ", icon: "👢", tiers: [
      { name: "長ぐつ", cost: 10000, desc: "会心の一撃が出やすい（+3%）" }, { name: "青いブーツ", cost: 1e7, desc: "会心の一撃が出やすい（+3%）" },
      { name: "金のブーツ", cost: 1e10, desc: "会心の一撃が出やすい（+3%）" }], crit: 0.03 },
  };
  const COMBO = { taps: 5, base: 0.5 }; // 1秒に 5回以上タップしている間

  // オートタップ（スキルツリー）：1秒あたりのタップ回数
  const AUTO_TAP = 3;

  // スキルツリー（星のかけらで開放。ずっと残る）。req: 先に開放が必要なマス
  const TREE = [
    { id: "t1", branch: "tap", name: "強いつるはし", icon: "⛏️", cost: 1, tapMult: 3, desc: "タップ力 ×3" },
    { id: "t2", branch: "tap", name: "連打ボーナス", icon: "👆", cost: 3, desc: "1秒に 5回以上タップしている間 ×1.5" },
    { id: "t6", branch: "tap", name: "オートタップ", icon: "🤖", cost: 8, desc: "自分が 1秒に 3回、自動でタップしてくれる。会心の一撃も出る。自分でもタップすると連打ボーナスが出やすい" },
    { id: "t3", branch: "tap", name: "会心の一撃", icon: "💥", cost: 12, desc: "タップの 10回に 1回が 10倍" },
    { id: "t4", branch: "tap", name: "仲間の力", icon: "🤝", cost: 25, desc: "タップに、仲間全員の毎秒の力の 5% が上乗せ" },
    { id: "t5", branch: "tap", name: "黄金のつるはし", icon: "🌟", cost: 60, tapMult: 5, desc: "タップ力 ×5" },
    { id: "f1", branch: "friend", name: "先輩の教え", icon: "📣", cost: 1, autoMult: 3, desc: "仲間全員の掘る力 ×3" },
    { id: "f2", branch: "friend", name: "まとめ買い割引", icon: "🏷️", cost: 3, desc: "仲間の強化が 10% 安い" },
    { id: "f3", branch: "friend", name: "チームワーク", icon: "👥", cost: 8, desc: "仲間全員のレベルの合計 100 ごとに、仲間全員 ×1.5" },
    { id: "f4", branch: "friend", name: "気合いの朝礼", icon: "☀️", cost: 20, autoMult: 2, desc: "仲間全員の掘る力 ×2" },
    { id: "f5", branch: "friend", name: "地底の友だち", icon: "👽", cost: 60, desc: "とても強い仲間「ソコ」（地底人）が仲間になる" },
    { id: "o1", branch: "treasure", name: "光る鉱石", icon: "💎", cost: 1, desc: "光る鉱石が 2倍出やすい" },
    { id: "o2", branch: "treasure", name: "長持ち", icon: "⏳", cost: 3, desc: "鉱石のブーストが 1.5倍長い" },
    { id: "o3", branch: "treasure", name: "化石図鑑", icon: "🦴", cost: 8, desc: "化石が見つかる。1個ごとに掘る力 +2%（ずっと残る）" },
    { id: "o4", branch: "treasure", name: "宝の地図", icon: "🗺️", cost: 20, desc: "新しい地層に入るたびに、お金のボーナス" },
    { id: "o5", branch: "treasure", name: "虹の鉱石", icon: "🌈", cost: 60, desc: "光る鉱石がときどき虹色に（10秒間 ×77）" },
    { id: "o6", branch: "treasure", name: "かけら増量", icon: "✦", cost: 150, desc: "転生でもらえる星のかけら ×1.25" },
    { id: "suit", branch: "tool", name: "耐熱スーツ", icon: "🧯", cost: 12, desc: "マントルの壁を越えられる" },
    { id: "drill", branch: "tool", name: "超高圧ドリル", icon: "🌀", cost: 200, desc: "外核の壁を越えられる" },
    { id: "starpick", branch: "tool", name: "星のつるはし", icon: "⭐", cost: 280, desc: "内核の壁を越えられる" },
  ];
  // 枝の中は根元から順番
  for (const br of ["tap", "friend", "treasure", "tool"]) {
    const ns = TREE.filter((n) => n.branch === br);
    ns.forEach((n, i) => { n.idx = i; n.req = i ? ns[i - 1].id : null; });
  }

  // 化石（決まった深さに埋まっている）
  const FOSSILS = [
    { id: "acorn", name: "どんぐりの化石", icon: "🌰", depth: 30, text: "大昔の森に落ちていた、小さなどんぐり。" },
    { id: "fern", name: "シダの葉", icon: "🌿", depth: 80, text: "恐竜がいたころにも、シダは生えていた。" },
    { id: "shark", name: "サメの歯", icon: "🦷", depth: 300, text: "とがった歯。ここは昔、海だったらしい。" },
    { id: "fish", name: "古代魚", icon: "🐟", depth: 900, text: "ヒレがりっぱな、大昔の魚。" },
    { id: "amber", name: "こはくの虫", icon: "🪲", depth: 1600, text: "木のやにに閉じこめられた虫。" },
    { id: "ammonite", name: "アンモナイト", icon: "🐚", depth: 2500, text: "うずまきのからを持つ、海の生き物。" },
    { id: "trilobite", name: "三葉虫", icon: "🦐", depth: 4000, text: "とても古い海の生き物。目がたくさん。" },
    { id: "dinobone", name: "恐竜の骨", icon: "🦴", depth: 6000, text: "大きすぎて、全部は持って帰れない。" },
    { id: "plesio", name: "首長竜", icon: "🦕", depth: 8000, text: "大昔の海を泳いでいた。首がとても長い。" },
    { id: "trex", name: "ティラノの歯", icon: "🦖", depth: 10500, text: "バナナくらいの大きさがある。" },
    { id: "mammoth", name: "マンモスの牙", icon: "🐘", depth: 16000, text: "なぜこんなに深くに？ なぞは深まる。" },
    { id: "flower", name: "古代の花", icon: "🌸", depth: 26000, text: "地球で最初のころに咲いた花。" },
    { id: "stardust", name: "星の砂", icon: "✨", depth: 500000, text: "マントルの中で光る、小さなつぶ。" },
    { id: "flame", name: "炎の結晶", icon: "🔥", depth: 1500000, text: "さわるとちょっとあたたかい。" },
    { id: "ironheart", name: "鉄の心臓", icon: "⚙️", depth: 3500000, text: "外核の鉄がかたまった、ふしぎな石。" },
    { id: "egg", name: "地球のたまご", icon: "🥚", depth: 5500000, text: "地球が生まれたときの記憶が入っているらしい。" },
  ];
  const FOSSIL_BONUS = 0.02;

  // 前世と時間を比べる節目の深さ
  const MILESTONES = [10, 100, 1000, 2000, 10000, 12000, 35000, 100000, 1000000, 2900000, 5150000, 6371000];

  // 光る鉱石
  const ORE = { minGap: 120, maxGap: 240, show: 12, mult: 7, dur: 15, rainbowChance: 0.1, rainbowMult: 77, rainbowDur: 10 };

  // 転生でもらえる星のかけら = floor(√(最高の深さ ÷ SHARD_DIV))
  const SHARD_DIV = 60;

  return { GOAL, LAYERS, COMPANIONS, COST_GROWTH, LV_MILESTONES, SKILLS, TURBO, GEAR, COMBO, AUTO_TAP, TREE, FOSSILS, FOSSIL_BONUS, MILESTONES, ORE, SHARD_DIV };
});
