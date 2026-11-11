// Funções de acordes: detecção, transposição e exibição.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const RE_ACORDE =
  /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|m|M|[º°+-])?\d{0,2}M?(?:(?:sus|add|maj|dim|aug)\d{0,2}|[#b+-]\d{1,2}|\([^)]*\))*(?:\/[A-G][#b]?)?$/;

const RE_AUX = /^[|\-–—.:()x×0-9]+$/i;

export function ehLinhaAcordes(linha) {
  const t = linha.trim();
  if (!t) return false;
  let acordes = 0;
  for (const k of t.split(/\s+/)) {
    if (RE_ACORDE.test(k)) acordes++;
    else if (!RE_AUX.test(k)) return false;
  }
  return acordes > 0;
}

const SUS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BEM = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function nota(n, passos, bemol) {
  let v = BASE[n[0]] + (n[1] === "#" ? 1 : n[1] === "b" ? -1 : 0);
  v = (((v + passos) % 12) + 12) % 12;
  return (bemol ? BEM : SUS)[v];
}

export function transporAcorde(t, passos) {
  if (!passos || !RE_ACORDE.test(t)) return t;
  const m = t.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
  if (!m) return t;
  const bemol = m[1].includes("b") || (m[3] || "").includes("b");
  return nota(m[1], passos, bemol) + m[2] + (m[3] ? "/" + nota(m[3], passos, bemol) : "");
}

export function transporLinha(linha, passos) {
  if (!passos) return linha;
  let saida = "";
  const re = /\S+/g;
  let m;
  while ((m = re.exec(linha))) {
    const tok = RE_ACORDE.test(m[0]) ? transporAcorde(m[0], passos) : m[0];
    if (saida.length < m.index) saida += " ".repeat(m.index - saida.length);
    else if (saida.length && !saida.endsWith(" ")) saida += " ";
    saida += tok;
  }
  return saida;
}

export function tomInicial(texto) {
  for (const l of String(texto || "").split("\n")) {
    if (ehLinhaAcordes(l)) {
      const t = l.trim().split(/\s+/).find((k) => RE_ACORDE.test(k));
      if (t) return t.split("/")[0];
    }
  }
  return "";
}

export function htmlCifra(texto, passos = 0) {
  return String(texto || "")
    .split("\n")
    .map((l) => (ehLinhaAcordes(l) ? `<span class="ac">${esc(passos ? transporLinha(l, passos) : l)}</span>` : esc(l)))
    .join("\n");
}
