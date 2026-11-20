// 穴の岩肌：地層ごと・星ごとの色と、ごつごつした模様（ノイズを光で照らした SVG）
(function (root) {
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
  // [赤, 緑, 青] の強さ（0〜1）。光を当てた明るさにかけて、岩の色にする
  const LAYER = {
    soil: [0.52, 0.37, 0.26], rock: [0.4, 0.4, 0.42], fossil: [0.64, 0.55, 0.4], crust: [0.34, 0.26, 0.2],
    mantle: [0.66, 0.26, 0.15], outer: [0.7, 0.42, 0.15], inner: [0.72, 0.6, 0.26],
  };
  function fromRGB([r, g, b], light) {
    const f = (v) => +v.toFixed(3);
    const matrix = `${f(r)} 0 0 0 0.02  0 ${f(g)} 0 0 0.02  0 0 ${f(b)} 0 0.02  0 0 0 1 0`;
    const chips = [0.75, 0.9, 0.6, 1.05, 0.5].map((k) => hex(r * k * 1.1, g * k * 1.1, b * k * 1.1));
    return { light, matrix, chips };
  }
  // 星は番号から色相を決める（明るさと鮮やかさは控えめ）
  function planetRGB(k) {
    const h = ((k * 137.508) % 360) / 60, s = 0.35, v = 0.55;
    const c = v * s, x = c * (1 - Math.abs((h % 2) - 1)), m = v - c;
    const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h) % 6];
    return [r + m, g + m, b + m];
  }
  // "#rrggbb" か "hsl(H S% L%)" を [r, g, b]（0〜1）に。読めなければ null
  function parse(c) {
    let m = /^#([0-9a-f]{6})$/i.exec(c || "");
    if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
    m = /^hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)$/i.exec(c || "");
    if (!m) return null;
    const h = (+m[1] % 360) / 60, s = +m[2] / 100, l = +m[3] / 100;
    const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs((h % 2) - 1)), o = l - C / 2;
    const [r, g, b] = [[C, X, 0], [X, C, 0], [0, C, X], [0, X, C], [X, 0, C], [C, 0, X]][Math.floor(h) % 6];
    return [r + o, g + o, b + o];
  }
  function rockStyle(where) {
    const w = where || {};
    if (w.color != null) {
      const rgb = parse(w.color);
      // 地層の色をそのまま使うと明るすぎるので、落ち着いた暗さにそろえる
      return rgb ? fromRGB(rgb.map((v) => +(0.12 + v * 0.62).toFixed(3)), "#e8e4f0") : fromRGB(LAYER.soil, "#e8d8c4");
    }
    if (w.planet != null) return fromRGB(planetRGB(Math.max(0, Math.floor(w.planet) || 0) + 1), "#e8e4f0");
    return fromRGB(LAYER[w.layer] || LAYER.soil, "#e8d8c4");
  }
  function rockTile(st) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='r' x='0' y='0' width='100%' height='100%'>`
      + `<feTurbulence type='fractalNoise' baseFrequency='0.028 0.045' numOctaves='5' seed='11' stitchTiles='stitch' result='n'/>`
      + `<feDiffuseLighting in='n' surfaceScale='6' lighting-color='${st.light}' result='l'><feDistantLight azimuth='235' elevation='35'/></feDiffuseLighting>`
      + `<feColorMatrix in='l' type='matrix' values='${st.matrix}'/></filter><rect width='256' height='256' filter='url(#r)'/></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  const Pit = { rockStyle, rockTile };
  if (typeof module === "object" && module.exports) module.exports = Pit;
  else root.Pit = Pit;
})(typeof self !== "undefined" ? self : this);
