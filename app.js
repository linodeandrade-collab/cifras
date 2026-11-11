import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { esc, ehLinhaAcordes, transporAcorde, tomInicial, htmlCifra } from "./cifra.js";

const firebaseConfig = {
  apiKey: "AIzaSyAHg47r2UDH05b-i0D06KenerFZw4b6OsY",
  authDomain: "cifras-vicente.firebaseapp.com",
  projectId: "cifras-vicente",
  storageBucket: "cifras-vicente.firebasestorage.app",
  messagingSenderId: "71739002173",
  appId: "1:71739002173:web:8ad9c1a27e526d12d84954",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const raiz = $("#raiz");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(16).slice(2));
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("on");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("on"), 2800);
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function aplicarTema() {
  const t = lsGet("tema") || (matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
  document.documentElement.dataset.tema = t;
}
aplicarTema();
function setPath(obj, path, val) {
  const p = path.split(".");
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) o = o[p[i]];
  o[p[p.length - 1]] = val;
}
function fmtData(d, h) {
  if (!d) return "Sem data";
  const t = new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  return t + (h ? " · " + h : "");
}

/* ---------- dados ---------- */
const MOMENTOS_MISSA = ["Canto de entrada", "Sinal da cruz", "Ato penitencial", "Hino de louvor", "Salmo responsorial", "Aclamação ao Evangelho", "Canto de meditação", "Canto de ofertório", "Santo", "Doxologia / Amém", "Pai Nosso", "Cordeiro de Deus", "Canto de comunhão", "Canto pós-comunhão", "Canto final"];
const PADRAO = {
  campos: [
    { nome: "Natureza", valores: ["Litúrgica", "Não litúrgica"] },
    { nome: "Celebração", valores: ["Missa", "Outras celebrações"] },
    { nome: "", valores: [] },
    { nome: "", valores: [] },
    { nome: "", valores: [] },
  ],
  momentos: MOMENTOS_MISSA,
  modelos: [{ id: "missa", nome: "Missa", momentos: MOMENTOS_MISSA }],
};
function normalizar(c) {
  const r = { campos: [], momentos: c.momentos ?? PADRAO.momentos, modelos: c.modelos ?? PADRAO.modelos };
  for (let i = 0; i < 5; i++) {
    const x = (c.campos || [])[i] || {};
    r.campos.push({ nome: x.nome || "", valores: x.valores || [] });
  }
  return r;
}

let user = null, cifras = [], reps = [], config = null, unsubs = [];
const col = (n) => collection(db, "usuarios", user.uid, n);
const ref = (n, id) => doc(db, "usuarios", user.uid, n, id);
const gravar = (n, id, dados) => setDoc(ref(n, id), dados).catch((e) => toast("Erro ao salvar: " + e.message));
const apagar = (n, id) => deleteDoc(ref(n, id)).catch((e) => toast("Erro ao excluir: " + e.message));

function iniciarDados() {
  unsubs.push(onSnapshot(col("cifras"), (s) => { cifras = s.docs.map((d) => ({ id: d.id, ...d.data() })); atualizarTela(); }));
  unsubs.push(onSnapshot(col("repertorios"), (s) => { reps = s.docs.map((d) => ({ id: d.id, ...d.data() })); atualizarTela(); }));
  unsubs.push(onSnapshot(ref("config", "geral"), (s) => {
    if (s.exists()) config = normalizar(s.data());
    else { config = structuredClone(PADRAO); gravar("config", "geral", config); }
    atualizarTela();
  }));
}
function atualizarTela() { if (["cifras", "reps"].includes(S.tela) || !raiz.innerHTML || raiz.querySelector(".load")) render(); }

onAuthStateChanged(auth, (u) => {
  user = u;
  unsubs.forEach((f) => f());
  unsubs = [];
  if (u) iniciarDados();
  else { cifras = []; reps = []; config = null; }
  render();
});

/* ---------- estado de tela ---------- */
const S = { tela: "cifras", volta: "cifras", q: "", ord: "titulo", filtros: {}, mostrarFiltros: false, qr: "", ordr: "desc", tipoR: "" };
let D = null, RD = null, CD = null, P = null, PK = null;
const PRINCIPAIS = ["cifras", "reps", "config"];

function render() {
  if (!user) return telaLogin();
  if (!config) { raiz.innerHTML = '<div class="load">Carregando…</div>'; return; }
  const t = S.tela;
  let h = "";
  if (t === "cifras") h = telaCifras();
  else if (t === "reps") h = telaReps();
  else if (t === "config") h = telaConfig();
  else if (t === "editCifra") h = telaEditCifra();
  else if (t === "editRep") h = telaEditRep();
  else if (t === "player") h = telaPlayer();
  raiz.innerHTML = h + (PRINCIPAIS.includes(t) ? nav() : "");
  if (t === "player") aposPlayer();
}
function navegar(t, volta) {
  if (volta) S.volta = volta;
  S.tela = t;
  if (!PRINCIPAIS.includes(t)) history.pushState({ sub: 1 }, "");
  render();
  scrollTo(0, 0);
}
function voltar(h = true) {
  if (P) { pausar(); soltarTela(); }
  S.tela = S.volta || "cifras";
  if (h && history.state && history.state.sub) { history.back(); return; }
  render();
  scrollTo(0, 0);
}
addEventListener("popstate", () => {
  if ($("#modal")) { fecharPicker(); return; }
  if (!PRINCIPAIS.includes(S.tela)) voltar(false);
});
const nav = () =>
  `<nav class="nav">${[["cifras", "🎵", "Cifras"], ["reps", "📋", "Repertórios"], ["config", "⚙️", "Ajustes"]]
    .map(([k, i, t]) => `<button class="${S.tela === k ? "on" : ""}" data-act="ir" data-t="${k}"><span>${i}</span>${t}</button>`)
    .join("")}</nav>`;

/* ---------- login ---------- */
function telaLogin() {
  raiz.innerHTML = `<div class="login"><h1>🎵 Minhas Cifras</h1><p class="sub">Entre com sua conta Google para ver suas cifras e repertórios em qualquer aparelho.</p><button class="btn pri" data-act="login">Entrar com Google</button><div id="erroLogin" class="sub"></div></div>`;
}

/* ---------- biblioteca ---------- */
const valoresDe = (c, k) => (k === "momentos" ? c.momentos || [] : (c.campos || {})[k] || []);
function filtrarCifras() {
  const q = norm(S.q);
  const l = cifras.filter((c) => {
    if (q && !norm([c.titulo, c.artista, c.texto].join(" ")).includes(q)) return false;
    for (const k in S.filtros) {
      const sel = S.filtros[k];
      if (sel.length && !sel.some((v) => valoresDe(c, k).includes(v))) return false;
    }
    return true;
  });
  if (S.ord === "artista") l.sort((a, b) => (a.artista || "").localeCompare(b.artista || "", "pt") || (a.titulo || "").localeCompare(b.titulo || "", "pt"));
  else if (S.ord === "recentes") l.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  else l.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "pt"));
  return l;
}
function cardCifra(c) {
  const tags = [...(c.momentos || []), ...Object.values(c.campos || {}).flat()].map((t) => `<span>${esc(t)}</span>`).join("");
  return `<div class="card" data-act="tocar1" data-id="${c.id}"><div class="ct"><b>${esc(c.titulo)}</b><div class="sub">${esc(c.artista || "")}${c.tom ? (c.artista ? " · " : "") + "Tom " + esc(c.tom) : ""}</div><div class="tags">${tags}</div></div><button class="ico" data-act="edit" data-id="${c.id}" aria-label="Editar">✎</button></div>`;
}
function listaCifrasHtml() {
  const l = filtrarCifras();
  if (!cifras.length) return '<div class="vazio">Nenhuma cifra ainda.<br>Toque em “＋ Nova” para cadastrar a primeira.</div>';
  return l.map(cardCifra).join("") || '<div class="vazio">Nada encontrado com esses filtros.</div>';
}
function grupos() {
  return [{ k: "momentos", nome: "Momento", vals: config.momentos }, ...config.campos.map((c, i) => ({ k: "c" + i, nome: c.nome, vals: c.valores }))].filter((g) => g.nome && g.vals.length);
}
function telaCifras() {
  const n = Object.values(S.filtros).reduce((a, v) => a + v.length, 0);
  const painel = S.mostrarFiltros
    ? `<div class="painel">${grupos().map((g) => `<div class="gt">${esc(g.nome)}</div>${g.vals.map((v) => `<button class="chip ${(S.filtros[g.k] || []).includes(v) ? "on" : ""}" data-act="filtro" data-k="${g.k}" data-v="${esc(v)}">${esc(v)}</button>`).join("")}`).join("")}<div><button class="btn" data-act="limpar">Limpar filtros</button></div></div>`
    : "";
  return `<header class="top"><h1>Minhas cifras</h1><button class="btn pri" data-act="nova">＋ Nova</button></header>
  <div class="busca"><input id="q" type="search" placeholder="Buscar título, artista ou letra" value="${esc(S.q)}">
  <select id="ord"><option value="titulo" ${S.ord === "titulo" ? "selected" : ""}>Título</option><option value="artista" ${S.ord === "artista" ? "selected" : ""}>Artista</option><option value="recentes" ${S.ord === "recentes" ? "selected" : ""}>Mais recentes</option></select>
  <button class="btn ${n ? "pri" : ""}" data-act="filtros">Filtros${n ? " (" + n + ")" : ""}</button></div>
  ${painel}<div class="lista" id="lista">${listaCifrasHtml()}</div>`;
}

/* ---------- editor de cifra ---------- */
function novaCifra() {
  return { id: "", titulo: "", artista: "", tom: "", link: "", texto: "", momentos: [], campos: {}, revisar: false };
}
const chips = (k, nome, vals, sel) =>
  `<div class="gt">${esc(nome)}</div><div>${vals.map((v) => `<button type="button" class="chip ${sel.includes(v) ? "on" : ""}" data-act="chip" data-k="${k}" data-v="${esc(v)}">${esc(v)}</button>`).join("")}</div>`;
function telaEditCifra() {
  const campos = config.campos.map((c, i) => ({ k: "c" + i, ...c })).filter((c) => c.nome && c.valores.length);
  return `<header class="top"><button class="ico" data-act="voltar">←</button><h1>${D.id ? "Editar cifra" : "Nova cifra"}</h1></header>
  ${D.revisar ? '<div class="aviso">Revise o texto importado: ajuste os acordes sobre as sílabas e só então toque em “Confirmar e salvar”.</div>' : ""}
  <div class="form">
  <label>Título<input data-f="titulo" value="${esc(D.titulo)}"></label>
  <label>Artista / compositor<input data-f="artista" value="${esc(D.artista)}"></label>
  <div class="dois"><label>Tom<input data-f="tom" value="${esc(D.tom)}" placeholder="ex.: G"></label><button type="button" class="btn" data-act="detectar">Detectar tom</button></div>
  <label>Link para ouvir (YouTube, Spotify…)<input data-f="link" type="url" inputmode="url" value="${esc(D.link)}" placeholder="https://"></label>
  ${config.momentos.length ? chips("momentos", "Momento da missa", config.momentos, D.momentos) : ""}
  ${campos.map((c) => chips(c.k, c.nome, c.valores, D.campos[c.k] || [])).join("")}
  <div style="margin-top:14px"><label class="btn" style="margin:0;color:var(--fg)">📄 Importar arquivo (PDF ou texto)<input type="file" id="arq" accept=".pdf,.txt,.text,.md,.rtf,.crd,.chord,text/*,application/pdf" hidden></label></div>
  <label>Cifra (acordes sobre a letra, fonte de largura fixa)<textarea data-f="texto" id="txt" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" rows="16">\n${esc(D.texto)}</textarea></label>
  <div class="gt">Pré-visualização</div><pre class="cifra prev" id="prev">${htmlCifra(D.texto)}</pre>
  <div class="acoes"><button class="btn pri" data-act="salvarC">Confirmar e salvar</button><button class="btn" data-act="voltar">Cancelar</button>${D.id ? '<button class="btn perigo" data-act="excluirC">Excluir</button>' : ""}</div></div>`;
}
function limparTexto(t) {
  return String(t).replace(/\r/g, "").replace(/\t/g, "    ").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\n+$/, "");
}
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
async function carregarPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((ok, erro) => {
    const s = document.createElement("script");
    s.src = PDFJS;
    s.onload = ok;
    s.onerror = () => erro(new Error("Sem internet para carregar o leitor de PDF. Conecte e tente de novo."));
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
}
async function textoDoPdf(file) {
  await carregarPdfJs();
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    paginas.push(tc.items.filter((i) => i.str && i.str.trim() !== ""));
  }
  const cws = [];
  paginas.flat().forEach((i) => { if (i.str.length >= 4 && i.width > 0) cws.push(i.width / i.str.length); });
  cws.sort((a, b) => a - b);
  const cw = cws.length ? cws[Math.floor(cws.length / 2)] : 5;
  const saida = [];
  for (const itens of paginas) {
    if (!itens.length) continue;
    const ordenados = [...itens].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const linhas = [];
    for (const it of ordenados) {
      const y = it.transform[5];
      const ult = linhas[linhas.length - 1];
      if (ult && Math.abs(ult.y - y) <= Math.max(2, (it.height || 8) * 0.45)) ult.itens.push(it);
      else linhas.push({ y, itens: [it] });
    }
    const minX = Math.min(...itens.map((i) => i.transform[4]));
    const gaps = [];
    for (let i = 1; i < linhas.length; i++) gaps.push(linhas[i - 1].y - linhas[i].y);
    const med = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 12;
    linhas.forEach((ln, idx) => {
      ln.itens.sort((a, b) => a.transform[4] - b.transform[4]);
      let t = "";
      for (const it of ln.itens) {
        const c = Math.round((it.transform[4] - minX) / cw);
        if (t.length < c) t += " ".repeat(c - t.length);
        else if (t.length && !t.endsWith(" ")) t += " ";
        t += it.str;
      }
      if (idx > 0 && linhas[idx - 1].y - ln.y > med * 1.6) saida.push("");
      saida.push(t);
    });
    saida.push("");
  }
  return saida.join("\n");
}
async function importarArquivo(file) {
  toast("Lendo o arquivo…");
  try {
    const txt = limparTexto(/\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await textoDoPdf(file) : await file.text());
    if (!txt.trim()) throw new Error("Não encontrei texto nesse arquivo (se for PDF escaneado, ainda não é suportado).");
    if (!D.titulo) D.titulo = file.name.replace(/\.[^.]+$/, "");
    D.texto = txt;
    D.revisar = true;
    if (!D.tom) D.tom = tomInicial(txt);
    render();
    scrollTo(0, 0);
    toast("Arquivo lido. Revise antes de salvar.");
  } catch (e) {
    toast(e.message || "Não consegui ler o arquivo");
  }
}
function salvarCifra() {
  if (!D.titulo.trim()) return toast("Dê um título para a cifra.");
  const id = D.id || uid();
  const campos = {};
  for (const k in D.campos) if (D.campos[k].length) campos[k] = D.campos[k];
  gravar("cifras", id, {
    titulo: D.titulo.trim(), artista: D.artista.trim(), tom: D.tom.trim(), link: D.link.trim(), texto: D.texto,
    momentos: D.momentos, campos, criadoEm: D.criadoEm || Date.now(), atualizadoEm: Date.now(),
  });
  toast("Cifra salva");
  voltar();
}

/* ---------- repertórios ---------- */
function ordenarReps() {
  const q = norm(S.qr);
  const l = reps.filter((r) => (!S.tipoR || r.tipo === S.tipoR) && (!q || norm([r.nome, r.tipo].join(" ")).includes(q)));
  const chave = (r) => (r.data ? r.data + " " + (r.hora || "00:00") : "");
  l.sort((a, b) => (S.ordr === "asc" ? chave(a).localeCompare(chave(b)) : chave(b).localeCompare(chave(a))));
  return l;
}
function cardRep(r) {
  const n = (r.itens || []).filter((i) => i.cifraId).length;
  return `<div class="card" data-act="editR" data-id="${r.id}"><div class="ct"><b>${esc(r.nome)}</b><div class="sub">${esc(fmtData(r.data, r.hora))}${r.tipo ? " · " + esc(r.tipo) : ""}</div><div class="sub">${n} música${n === 1 ? "" : "s"}</div></div><button class="ico" data-act="tocarR" data-id="${r.id}" aria-label="Tocar">▶</button></div>`;
}
function listaRepsHtml() {
  if (!reps.length) return '<div class="vazio">Nenhum repertório ainda.<br>Toque em “＋ Novo” para montar o primeiro.</div>';
  return ordenarReps().map(cardRep).join("") || '<div class="vazio">Nada encontrado.</div>';
}
function telaReps() {
  const tipos = [...new Set(reps.map((r) => r.tipo).filter(Boolean))].sort();
  return `<header class="top"><h1>Repertórios</h1><button class="btn pri" data-act="novoR">＋ Novo</button></header>
  <div class="busca"><input id="qr" type="search" placeholder="Buscar repertório" value="${esc(S.qr)}">
  <select id="ordr"><option value="desc" ${S.ordr === "desc" ? "selected" : ""}>Mais recentes</option><option value="asc" ${S.ordr === "asc" ? "selected" : ""}>Mais antigos</option></select>
  <select id="tipoR"><option value="">Todos os tipos</option>${tipos.map((t) => `<option ${S.tipoR === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
  <div class="lista" id="lista">${listaRepsHtml()}</div>`;
}
function itensDoModelo(modelo, antigos = []) {
  const usados = new Set();
  const novos = modelo.momentos.map((m) => {
    const i = antigos.findIndex((a, x) => !usados.has(x) && a.momento === m && a.cifraId);
    if (i >= 0) { usados.add(i); return { momento: m, cifraId: antigos[i].cifraId }; }
    return { momento: m, cifraId: "" };
  });
  antigos.forEach((a, x) => { if (!usados.has(x) && a.cifraId) novos.push({ ...a }); });
  return novos;
}
function itemHtml(it, i) {
  const c = cifras.find((x) => x.id === it.cifraId);
  const rotulo = it.cifraId ? (c ? esc(c.titulo) + (c.tom ? " · " + esc(c.tom) : "") : "⚠ música removida") : "Escolher música…";
  return `<div class="item"><div class="ih"><input list="moms" data-ri="${i}" data-rk="momento" value="${esc(it.momento)}" placeholder="Momento (ex.: Canto de entrada)">
  <div class="mv"><button class="ico" data-act="up" data-i="${i}" aria-label="Subir">↑</button><button class="ico" data-act="down" data-i="${i}" aria-label="Descer">↓</button><button class="ico" data-act="delItem" data-i="${i}" aria-label="Remover">✕</button></div></div>
  <button class="escolha ${it.cifraId ? "ok" : ""}" data-act="escolher" data-i="${i}">${rotulo}</button></div>`;
}
function telaEditRep() {
  const tipos = [...new Set(reps.map((r) => r.tipo).filter(Boolean))];
  return `<header class="top"><button class="ico" data-act="voltar">←</button><h1>${RD.criado ? "Repertório" : "Novo repertório"}</h1></header>
  <div class="form">
  <label>Nome<input data-r="nome" value="${esc(RD.nome)}" placeholder="ex.: Missa de domingo"></label>
  <div class="dois"><label>Data<input type="date" data-r="data" value="${esc(RD.data)}"></label><label>Horário<input type="time" data-r="hora" value="${esc(RD.hora)}"></label></div>
  <label>Tipo de evento<input data-r="tipo" list="tipos" value="${esc(RD.tipo)}" placeholder="ex.: Missa dominical, Casamento"></label>
  <datalist id="tipos">${tipos.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
  <datalist id="moms">${config.momentos.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
  <label>Modelo de momentos<select id="modelo"><option value="">Sem modelo (lista livre)</option>${config.modelos.map((m) => `<option value="${esc(m.id)}" ${RD.modeloId === m.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></label>
  <div class="gt">Músicas, na ordem em que serão tocadas</div>
  ${RD.itens.map(itemHtml).join("")}
  <button class="btn" data-act="addItem">＋ Adicionar item</button>
  <div class="acoes"><button class="btn pri" data-act="salvarR">Salvar</button><button class="btn" data-act="tocarRD">▶ Tocar</button>${RD.criado ? '<button class="btn" data-act="dupR">Duplicar</button><button class="btn perigo" data-act="excluirR">Excluir</button>' : ""}</div></div>`;
}
function salvarRep() {
  if (!RD.nome.trim()) return toast("Dê um nome ao repertório.");
  const id = RD.id || uid();
  gravar("repertorios", id, {
    nome: RD.nome.trim(), data: RD.data, hora: RD.hora, tipo: RD.tipo.trim(), modeloId: RD.modeloId,
    itens: RD.itens.map((i) => ({ momento: i.momento || "", cifraId: i.cifraId || "" })), criadoEm: RD.criado || Date.now(), atualizadoEm: Date.now(),
  });
  toast("Repertório salvo");
  voltar();
}

/* ---------- seletor de música ---------- */
function abrirPicker(i) { PK = { i, q: "", so: true }; desenharPicker(); }
function fecharPicker() { PK = null; const m = $("#modal"); if (m) m.remove(); }
function listaPicker() {
  const it = RD.itens[PK.i];
  const q = norm(PK.q);
  const l = cifras
    .filter((c) => (!q || norm(c.titulo + " " + c.artista).includes(q)) && (!(it.momento && PK.so) || (c.momentos || []).includes(it.momento)))
    .sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "pt"));
  return (it.cifraId ? '<button class="btn perigo" style="width:100%;margin-bottom:8px" data-act="rmPick">Tirar música deste item</button>' : "") +
    (l.map((c) => `<div class="card" data-act="pick" data-id="${c.id}"><div class="ct"><b>${esc(c.titulo)}</b><div class="sub">${esc(c.artista || "")}${c.tom ? " · Tom " + esc(c.tom) : ""}</div></div></div>`).join("") ||
      `<div class="vazio">Nenhuma música encontrada.${it.momento && PK.so ? "<br>Desmarque o filtro acima para ver todas." : ""}</div>`);
}
function desenharPicker() {
  const it = RD.itens[PK.i];
  let el = $("#modal");
  if (!el) { el = document.createElement("div"); el.id = "modal"; document.body.appendChild(el); }
  el.innerHTML = `<div class="mbox"><div class="mh"><b>${esc(it.momento || "Escolher música")}</b><button class="ico" data-act="fecharPicker">✕</button></div>
  <input id="pq" type="search" placeholder="Buscar música…" value="${esc(PK.q)}">
  ${it.momento ? `<label class="chk"><input type="checkbox" id="pso" ${PK.so ? "checked" : ""}> Só músicas marcadas como “${esc(it.momento)}”</label>` : ""}
  <div id="plista">${listaPicker()}</div></div>`;
}

/* ---------- ajustes ---------- */
function novoCD() {
  return {
    campos: config.campos.map((c) => ({ nome: c.nome, txt: c.valores.join("\n") })),
    momentosTxt: config.momentos.join("\n"),
    modelos: config.modelos.map((m) => ({ id: m.id, nome: m.nome, txt: m.momentos.join("\n") })),
  };
}
function telaConfig() {
  if (!CD) CD = novoCD();
  return `<header class="top"><h1>Ajustes</h1><button class="btn pri" data-act="salvarCfg">Salvar</button></header>
  <div class="form cfg">
  <div class="sub">Conta: ${esc(user.email || "")}</div>
  <h3>Campos de classificação</h3><div class="sub">Até cinco campos. Dê um nome e liste os valores, um por linha. Campo sem nome fica oculto.</div>
  ${CD.campos.map((c, i) => `<div class="bloco"><label>Campo ${i + 1}: nome<input data-cp="campos.${i}.nome" value="${esc(c.nome)}" placeholder="ex.: Natureza"></label><label>Valores (um por linha)<textarea data-cp="campos.${i}.txt">${esc(c.txt)}</textarea></label></div>`).join("")}
  <h3>Momentos da missa</h3><div class="sub">Lista usada para marcar as músicas e para buscar. Um por linha.</div>
  <div class="bloco"><textarea data-cp="momentosTxt" style="min-height:160px">${esc(CD.momentosTxt)}</textarea></div>
  <h3>Modelos de repertório</h3><div class="sub">Sequência fixa de momentos. Um por linha, na ordem em que acontecem.</div>
  ${CD.modelos.map((m, i) => `<div class="bloco"><label>Nome do modelo<input data-cp="modelos.${i}.nome" value="${esc(m.nome)}"></label><label>Momentos, na ordem<textarea data-cp="modelos.${i}.txt" style="min-height:160px">${esc(m.txt)}</textarea></label><button class="btn perigo" data-act="delModelo" data-i="${i}">Remover modelo</button></div>`).join("")}
  <div style="margin-top:10px"><button class="btn" data-act="addModelo">＋ Novo modelo</button></div>
  <h3>Aparência e dados</h3>
  <div class="acoes"><button class="btn" data-act="tema">🌙 Alternar modo escuro</button><button class="btn" data-act="exportar">⬇ Backup (arquivo)</button><label class="btn" style="margin:0;color:var(--fg)">⬆ Restaurar backup<input type="file" id="arqBackup" accept=".json,application/json" hidden></label><button class="btn perigo" data-act="sair">Sair da conta</button></div></div>`;
}
function salvarConfig() {
  const lista = (t) => t.split("\n").map((s) => s.trim()).filter(Boolean);
  config = {
    campos: CD.campos.map((c) => ({ nome: c.nome.trim(), valores: lista(c.txt) })),
    momentos: lista(CD.momentosTxt),
    modelos: CD.modelos.filter((m) => m.nome.trim()).map((m) => ({ id: m.id, nome: m.nome.trim(), momentos: lista(m.txt) })),
  };
  gravar("config", "geral", config);
  CD = null;
  toast("Ajustes salvos");
  render();
}
function exportar() {
  const dados = { versao: 1, exportadoEm: new Date().toISOString(), config, cifras, repertorios: reps };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 1)], { type: "application/json" }));
  a.download = "backup-cifras-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
async function restaurar(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!confirm("Restaurar o backup? Itens com o mesmo código serão substituídos.")) return;
    (d.cifras || []).forEach(({ id, ...r }) => gravar("cifras", id, r));
    (d.repertorios || []).forEach(({ id, ...r }) => gravar("repertorios", id, r));
    if (d.config) gravar("config", "geral", d.config);
    toast("Backup restaurado");
  } catch { toast("Arquivo de backup inválido"); }
}

/* ---------- tela de tocar ---------- */
let rafId = 0, ultimo = 0, acum = 0, wake = null;
function abrirPlayer(itens, titulo, volta) {
  P = { itens, titulo, trans: {}, rodando: false, vel: Number(lsGet("vel")) || 25 };
  navegar("player", volta);
}
function ajustarFonte(salvar) {
  let max = 22;
  for (const it of P.itens) if (it.cifra) for (const l of it.cifra.texto.split("\n")) max = Math.max(max, l.length);
  const fs = Math.min(26, Math.max(11, Math.floor((document.documentElement.clientWidth - 28) / (max * 0.61))));
  if (salvar) lsSet("fs", fs);
  return fs;
}
const fonteAtual = () => Number(lsGet("fs")) || ajustarFonte(false);
function telaPlayer() {
  const secoes = P.itens.map((it, i) => {
    const c = it.cifra;
    const cab = it.momento ? `<div class="mom">${esc(it.momento)}</div>` : "";
    if (!c) return `<section class="song" id="s${i}">${cab}<div class="semsong">Sem música definida${it.removida ? " (a cifra foi removida)" : ""}.</div></section>`;
    return `<section class="song" id="s${i}">${cab}<h2>${esc(c.titulo)}</h2>
    <div class="sub">${esc(c.artista || "")}${c.tom ? (c.artista ? " · " : "") + "Tom <b id='tom" + i + "'>" + esc(c.tom) + "</b>" : ""}</div>
    <div class="stools"><button class="btn" data-act="tr" data-i="${i}" data-d="-1">♭ −</button><button class="btn" data-act="tr" data-i="${i}" data-d="1">♯ +</button>${c.link ? `<a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">🎧 Ouvir</a>` : ""}</div>
    <pre class="cifra" id="c${i}">${htmlCifra(c.texto)}</pre></section>`;
  }).join("");
  return `<div class="pbar" id="pbar"><button class="ico" data-act="voltar" aria-label="Voltar">←</button><button class="ico" data-act="prevS" aria-label="Anterior">⏮</button><button class="ico" data-act="nextS" aria-label="Próxima">⏭</button><button class="ico" data-act="fm">A−</button><button class="ico" data-act="fp">A+</button><button class="ico" data-act="fit" aria-label="Ajustar à tela">↔</button><button class="ico" id="bplay" data-act="play" aria-label="Rolagem automática">▶</button><button class="ico" data-act="tema" aria-label="Modo escuro">🌙</button>
  <div class="vel" id="vel"><span>🐢</span><input type="range" id="velr" min="5" max="120" value="${P.vel}"><span>🐇</span></div></div>
  <div class="plista" id="plista2">${secoes}</div>`;
}
function aposPlayer() {
  $("#plista2").style.setProperty("--fs", fonteAtual() + "px");
  atualizarPh();
  pedirTela();
}
function atualizarPh() { const b = $("#pbar"); if (b) document.documentElement.style.setProperty("--ph", b.offsetHeight + "px"); }
async function pedirTela() { try { if (navigator.wakeLock && !wake) { wake = await navigator.wakeLock.request("screen"); wake.addEventListener("release", () => (wake = null)); } } catch {} }
function soltarTela() { try { if (wake) wake.release(); } catch {} wake = null; P = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && P) pedirTela(); });
function mudarFonte(d) {
  const fs = Math.min(40, Math.max(9, fonteAtual() + d));
  lsSet("fs", fs);
  $("#plista2").style.setProperty("--fs", fs + "px");
}
function songAtual() {
  const lim = ($("#pbar")?.offsetHeight || 56) + 6;
  let cur = 0;
  document.querySelectorAll(".song").forEach((el, i) => { if (el.getBoundingClientRect().top <= lim) cur = i; });
  return cur;
}
function irPara(i) { const el = document.getElementById("s" + i); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }
function tocarRolagem() {
  P.rodando = true;
  $("#bplay").textContent = "⏸";
  $("#vel").classList.add("on");
  atualizarPh();
  ultimo = 0; acum = 0;
  rafId = requestAnimationFrame(passo);
}
function pausar() {
  if (!P || !P.rodando) return;
  P.rodando = false;
  cancelAnimationFrame(rafId);
  const b = $("#bplay"); if (b) b.textContent = "▶";
  const v = $("#vel"); if (v) v.classList.remove("on");
  atualizarPh();
}
function passo(t) {
  if (!P || !P.rodando) return;
  if (ultimo) {
    acum += ((t - ultimo) / 1000) * P.vel;
    const px = Math.floor(acum);
    if (px) { scrollBy(0, px); acum -= px; }
  }
  ultimo = t;
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return pausar();
  rafId = requestAnimationFrame(passo);
}
addEventListener("touchstart", (e) => { if (P && P.rodando && !e.target.closest("#pbar")) pausar(); }, { passive: true });

/* ---------- eventos ---------- */
function atualizarLista() { const l = $("#lista"); if (l) l.innerHTML = S.tela === "reps" ? listaRepsHtml() : listaCifrasHtml(); }
function itensDeRep(r) {
  return (r.itens || []).map((i) => {
    const c = cifras.find((x) => x.id === i.cifraId);
    return { momento: i.momento, cifra: c || null, removida: !!i.cifraId && !c };
  });
}
function abrirRep(r) { RD = { ...r, itens: (r.itens || []).map((i) => ({ ...i })), data: r.data || "", hora: r.hora || "", tipo: r.tipo || "", modeloId: r.modeloId || "", criado: r.criadoEm || 0 }; navegar("editRep", "reps"); }

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const a = el.dataset.act, id = el.dataset.id, i = Number(el.dataset.i);
  switch (a) {
    case "login":
      try { await signInWithPopup(auth, new GoogleAuthProvider()); }
      catch (err) { const x = $("#erroLogin"); if (x) x.textContent = "Não consegui entrar: " + (err.code || err.message); }
      break;
    case "sair": if (confirm("Sair da conta neste aparelho?")) signOut(auth); break;
    case "ir": CD = null; S.tela = el.dataset.t; render(); scrollTo(0, 0); break;
    case "voltar": voltar(); break;
    case "tema": lsSet("tema", document.documentElement.dataset.tema === "escuro" ? "claro" : "escuro"); aplicarTema(); break;
    case "filtros": S.mostrarFiltros = !S.mostrarFiltros; render(); break;
    case "filtro": { const k = el.dataset.k, v = el.dataset.v; const l = S.filtros[k] || (S.filtros[k] = []); const x = l.indexOf(v); x >= 0 ? l.splice(x, 1) : l.push(v); render(); break; }
    case "limpar": S.filtros = {}; render(); break;
    case "nova": D = novaCifra(); navegar("editCifra", "cifras"); break;
    case "edit": { const c = cifras.find((x) => x.id === id); D = { ...novaCifra(), ...c, campos: structuredClone(c.campos || {}), momentos: [...(c.momentos || [])] }; navegar("editCifra", "cifras"); break; }
    case "tocar1": { const c = cifras.find((x) => x.id === id); abrirPlayer([{ momento: "", cifra: c }], c.titulo, "cifras"); break; }
    case "chip": {
      const k = el.dataset.k, v = el.dataset.v;
      const l = k === "momentos" ? D.momentos : D.campos[k] || (D.campos[k] = []);
      const x = l.indexOf(v); x >= 0 ? l.splice(x, 1) : l.push(v);
      el.classList.toggle("on");
      break;
    }
    case "detectar": { const t = tomInicial(D.texto); if (t) { D.tom = t; const f = $('[data-f="tom"]'); if (f) f.value = t; } else toast("Não encontrei acordes no texto."); break; }
    case "salvarC": salvarCifra(); break;
    case "excluirC": if (confirm("Excluir esta cifra? Isso não pode ser desfeito.")) { apagar("cifras", D.id); voltar(); } break;
    case "novoR": RD = { id: "", nome: "", data: "", hora: "", tipo: "", modeloId: "", itens: [], criado: 0 }; navegar("editRep", "reps"); break;
    case "editR": abrirRep(reps.find((x) => x.id === id)); break;
    case "tocarR": { const r = reps.find((x) => x.id === id); abrirPlayer(itensDeRep(r), r.nome, "reps"); break; }
    case "tocarRD": abrirPlayer(itensDeRep({ itens: RD.itens }), RD.nome, "editRep"); break;
    case "salvarR": salvarRep(); break;
    case "excluirR": if (confirm("Excluir este repertório?")) { apagar("repertorios", RD.id); voltar(); } break;
    case "dupR": { const c = { ...RD, id: "", nome: RD.nome + " (cópia)", criado: 0, itens: RD.itens.map((x) => ({ ...x })) }; RD = c; render(); toast("Cópia criada. Ajuste e salve."); break; }
    case "addItem": RD.itens.push({ momento: "", cifraId: "" }); render(); break;
    case "delItem": RD.itens.splice(i, 1); render(); break;
    case "up": if (i > 0) { [RD.itens[i - 1], RD.itens[i]] = [RD.itens[i], RD.itens[i - 1]]; render(); } break;
    case "down": if (i < RD.itens.length - 1) { [RD.itens[i + 1], RD.itens[i]] = [RD.itens[i], RD.itens[i + 1]]; render(); } break;
    case "escolher": abrirPicker(i); break;
    case "fecharPicker": fecharPicker(); break;
    case "pick": RD.itens[PK.i].cifraId = id; fecharPicker(); render(); break;
    case "rmPick": RD.itens[PK.i].cifraId = ""; fecharPicker(); render(); break;
    case "addModelo": CD.modelos.push({ id: uid(), nome: "Novo modelo", txt: "" }); render(); break;
    case "delModelo": if (confirm("Remover este modelo?")) { CD.modelos.splice(i, 1); render(); } break;
    case "salvarCfg": salvarConfig(); break;
    case "exportar": exportar(); break;
    case "prevS": { const c = songAtual(); const topo = document.getElementById("s" + c).getBoundingClientRect().top; const lim = ($("#pbar")?.offsetHeight || 56) + 6; irPara(topo < lim - 20 || c === 0 ? c : c - 1); break; }
    case "nextS": { const c = songAtual(); if (c < P.itens.length - 1) irPara(c + 1); break; }
    case "fm": mudarFonte(-1); break;
    case "fp": mudarFonte(1); break;
    case "fit": { const fs = ajustarFonte(true); $("#plista2").style.setProperty("--fs", fs + "px"); break; }
    case "play": P.rodando ? pausar() : tocarRolagem(); break;
    case "tr": {
      const it = P.itens[i];
      P.trans[i] = (P.trans[i] || 0) + Number(el.dataset.d);
      $("#c" + i).innerHTML = htmlCifra(it.cifra.texto, P.trans[i]);
      const t = $("#tom" + i);
      if (t) t.textContent = transporAcorde(it.cifra.tom, P.trans[i]) + (P.trans[i] ? ` (${P.trans[i] > 0 ? "+" : ""}${P.trans[i]})` : "");
      break;
    }
  }
});

document.addEventListener("input", (e) => {
  const t = e.target, d = t.dataset;
  if (d.f && D) { D[d.f] = t.value; if (d.f === "texto") $("#prev").innerHTML = htmlCifra(D.texto); }
  else if (d.r && RD) RD[d.r] = t.value;
  else if (d.ri !== undefined && RD) RD.itens[Number(d.ri)][d.rk] = t.value;
  else if (d.cp && CD) setPath(CD, d.cp, t.value);
  else if (t.id === "q") { S.q = t.value; atualizarLista(); }
  else if (t.id === "qr") { S.qr = t.value; atualizarLista(); }
  else if (t.id === "pq" && PK) { PK.q = t.value; $("#plista").innerHTML = listaPicker(); }
  else if (t.id === "velr" && P) { P.vel = Number(t.value); lsSet("vel", P.vel); }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "ord") { S.ord = t.value; render(); }
  else if (t.id === "ordr") { S.ordr = t.value; render(); }
  else if (t.id === "tipoR") { S.tipoR = t.value; render(); }
  else if (t.id === "arq" && t.files[0]) importarArquivo(t.files[0]);
  else if (t.id === "arqBackup" && t.files[0]) restaurar(t.files[0]);
  else if (t.id === "pso" && PK) { PK.so = t.checked; desenharPicker(); }
  else if (t.id === "modelo" && RD) {
    RD.modeloId = t.value;
    const m = config.modelos.find((x) => x.id === t.value);
    if (m) RD.itens = itensDoModelo(m, RD.itens);
    render();
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
