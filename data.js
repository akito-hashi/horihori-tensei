// ほりほり転生 — ゲームの数値・文章データ（ルールは engine.js）
// 数値は tests/balance.test.js のボットで調整する（クリアまで約 2時間・転生 10回前後）
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GameData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const GOAL = 6371000; // 地球の中心（m）

  // 地層。from: 始まる深さ(m) / hard: かたさ（掘る力をこれで割る） / value: 1m あたりのお金 / wall: 入るのに要る道具
  const LAYERS = [
    { id: "soil", name: "土の層", icon: "🌱", from: 0, hard: 1, value: 1 },
    { id: "rock", name: "岩盤の層", icon: "🪨", from: 100, hard: 4, value: 5 },
    { id: "fossil", name: "化石の層", icon: "🦴", from: 2000, hard: 12, value: 30 },
    { id: "crust", name: "地殻の底", icon: "🧱", from: 12000, hard: 40, value: 150 },
    { id: "mantle", name: "マントル", icon: "🔥", from: 35000, hard: 150, value: 1000, wall: "suit" },
    { id: "outer", name: "外核", icon: "🌀", from: 2900000, hard: 800, value: 8000, wall: "drill" },
    { id: "inner", name: "内核", icon: "💎", from: 5150000, hard: 2500, value: 50000, wall: "starpick" },
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

  return { GOAL, LAYERS, BUILDINGS, COST_GROWTH, UPGRADES };
});
