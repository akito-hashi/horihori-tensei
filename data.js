// ほりほり転生 — ゲームの数値・文章データ（ルールは engine.js）
// 数値は tests/balance.test.js のボットで調整する（クリアまで約 2時間・転生 10回前後）
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GOAL = 6371000; // 地球の中心（m）

  // 地層。from: 始まる深さ(m) / hard: かたさ（掘る力をこれで割る） / value: 1m あたりのお金 / wall: 入るのに要る道具
  // grow: 地層の中でも深くなるほどかたくなる度合い（かたさ = hard × (深さ ÷ from)^grow）。地層の境目で柔らかくならないようにしてある
  const LAYERS = [
    { id: "soil", name: "土の層", icon: "🌱", from: 0, hard: 0.55, value: 1, grow: 0 },
    { id: "rock", name: "岩盤の層", icon: "🪨", from: 100, hard: 2.2, value: 5, grow: 0.5 },
    { id: "fossil", name: "化石の層", icon: "🦴", from: 2000, hard: 11, value: 40, grow: 0.5 },
    { id: "crust", name: "地殻の底", icon: "🧱", from: 12000, hard: 27.5, value: 150, grow: 0.5 },
    { id: "mantle", name: "マントル", icon: "🔥", from: 35000, hard: 165, value: 750, grow: 0.5, wall: "suit" },
    { id: "outer", name: "外核", icon: "🌀", from: 2900000, hard: 1650, value: 16000, grow: 0.5, wall: "drill" },
    { id: "inner", name: "内核", icon: "💎", from: 5150000, hard: 2475, value: 36000, grow: 0.5, wall: "starpick" },
  ];

  // 仲間・機械。cost: 1台目の値段 / out: 1台の掘る力（毎秒） / layer: 買えるようになる地層 / node: スキルツリーで解放
  const BUILDINGS = [
    { id: "apprentice", name: "見習い掘り手", icon: "🧑‍🔧", cost: 15, out: 0.5, layer: "soil", verb: "やとう" },
    { id: "mole", name: "モグラの相棒", icon: "🐹", cost: 120, out: 3, layer: "soil", verb: "なかまに" },
    { id: "shovel", name: "ショベルカー", icon: "🚜", cost: 1500, out: 20, layer: "rock", verb: "買う" },
    { id: "jack", name: "削岩機チーム", icon: "🛠️", cost: 20000, out: 120, layer: "rock", verb: "やとう" },
    { id: "tunnel", name: "トンネル工事団", icon: "🚧", cost: 300000, out: 800, layer: "fossil", verb: "やとう" },
    { id: "machine", name: "巨大掘削マシン", icon: "🤖", cost: 5e6, out: 6000, layer: "fossil", verb: "つくる" },
    { id: "magma", name: "マグマ潜水艇", icon: "🚤", cost: 1e8, out: 50000, layer: "mantle", verb: "つくる" },
    { id: "chitei", name: "地底人", icon: "👽", cost: 3e9, out: 400000, layer: "soil", node: "f5", verb: "なかまに" },
  ];
  const COST_GROWTH = 1.15;

  // 道具（1回の人生で 1回ずつ買える）
  const PICKS = [
    { id: "pick_iron", name: "鉄のつるはし", cost: 300, mult: 3 },
    { id: "pick_steel", name: "鋼のつるはし", cost: 20000, mult: 3 },
    { id: "pick_diamond", name: "ダイヤのつるはし", cost: 1e6, mult: 3 },
    { id: "pick_mithril", name: "ミスリルのつるはし", cost: 1e8, mult: 3 },
    { id: "pick_star", name: "流れ星のつるはし", cost: 1e11, mult: 3 },
  ];
  const EQUIP_NAMES = {
    apprentice: "ヘルメット", mole: "ツメみがき", shovel: "エンジン改造", jack: "防音イヤーマフ",
    tunnel: "安全ライト", machine: "ダイヤの刃", magma: "耐熱ガラス", chitei: "地底のおまもり",
  };
  const UPGRADES = [
    ...PICKS.map((p, i) => ({ ...p, kind: "pick", order: i, desc: `タップ力 ×${p.mult}` })),
    ...BUILDINGS.map((b) => ({ id: "eq_" + b.id, kind: "equip", building: b.id, name: EQUIP_NAMES[b.id], need: 10, cost: b.cost * 40, mult: 2, desc: `${b.name} ×2` })),
    { id: "light", kind: "light", name: "強力ライト", cost: 50000, desc: "光る鉱石が見つけやすい（×1.5）" },
  ];

  // スキルツリー（星のかけらで開放。ずっと残る）。req: 先に開放が必要なマス
  const TREE = [
    { id: "t1", branch: "tap", name: "強いつるはし", icon: "⛏️", cost: 1, desc: "タップ力 ×2" },
    { id: "t2", branch: "tap", name: "連打ボーナス", icon: "👆", cost: 3, desc: "1秒に 5回以上タップしている間 ×1.5" },
    { id: "t3", branch: "tap", name: "会心の一撃", icon: "💥", cost: 8, desc: "タップの 10回に 1回が 10倍" },
    { id: "t4", branch: "tap", name: "仲間の力", icon: "🤝", cost: 20, desc: "タップに、毎秒の掘る力の 5% が上乗せ" },
    { id: "t5", branch: "tap", name: "黄金のつるはし", icon: "🌟", cost: 60, desc: "タップ力 ×5" },
    { id: "f1", branch: "friend", name: "先輩の教え", icon: "📣", cost: 1, desc: "仲間・機械の掘る力 ×1.5" },
    { id: "f2", branch: "friend", name: "まとめ買い割引", icon: "🏷️", cost: 3, desc: "仲間・機械の値段が 10% 安い" },
    { id: "f3", branch: "friend", name: "チームワーク", icon: "👥", cost: 8, desc: "同じ仲間が 25人そろうごとに、その仲間 ×2" },
    { id: "f4", branch: "friend", name: "気合いの朝礼", icon: "☀️", cost: 20, desc: "仲間・機械の掘る力 ×2" },
    { id: "f5", branch: "friend", name: "地底の友だち", icon: "👽", cost: 60, desc: "とても強い仲間「地底人」がやとえる" },
    { id: "o1", branch: "treasure", name: "光る鉱石", icon: "💎", cost: 1, desc: "光る鉱石が 2倍出やすい" },
    { id: "o2", branch: "treasure", name: "長持ち", icon: "⏳", cost: 3, desc: "鉱石のブーストが 1.5倍長い" },
    { id: "o3", branch: "treasure", name: "化石図鑑", icon: "🦴", cost: 8, desc: "化石が見つかる。1個ごとに掘る力 +2%（ずっと残る）" },
    { id: "o4", branch: "treasure", name: "宝の地図", icon: "🗺️", cost: 20, desc: "新しい地層に入るたびに、お金のボーナス" },
    { id: "o5", branch: "treasure", name: "虹の鉱石", icon: "🌈", cost: 60, desc: "光る鉱石がときどき虹色に（10秒間 ×77）" },
    { id: "o6", branch: "treasure", name: "かけら増量", icon: "✦", cost: 150, desc: "転生でもらえる星のかけら ×1.25" },
    { id: "suit", branch: "tool", name: "耐熱スーツ", icon: "🧯", cost: 25, desc: "マントルの壁を越えられる" },
    { id: "drill", branch: "tool", name: "超高圧ドリル", icon: "🌀", cost: 400, desc: "外核の壁を越えられる" },
    { id: "starpick", branch: "tool", name: "星のつるはし", icon: "⭐", cost: 1300, desc: "内核の壁を越えられる" },
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
  const SHARD_DIV = 35;

  return { GOAL, LAYERS, BUILDINGS, COST_GROWTH, UPGRADES, TREE, FOSSILS, FOSSIL_BONUS, MILESTONES, ORE, SHARD_DIV };
});
