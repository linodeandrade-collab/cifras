const VERSAO = "cifras-v2";
const LOCAIS = ["./", "./index.html", "./app.js", "./cifra.js", "./manifest.json", "./icon-192.png", "./icon-512.png", "./dev1.jpg", "./dev2.jpg", "./dev3.jpg", "./dev4.jpg", "./dev5.jpg", "./dev6.jpg"];
const EXTERNOS = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSAO).then(async (c) => {
      await Promise.all(LOCAIS.map((u) => c.add(u).catch(() => {})));
      await Promise.all(EXTERNOS.map((u) => c.add(u).catch(() => {})));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mesmo = url.origin === self.location.origin;
  const cdn = url.hostname === "www.gstatic.com" || url.hostname === "cdnjs.cloudflare.com";
  if (!mesmo && !cdn) return;
  if (mesmo) {
    // arquivos do próprio app: tenta a rede primeiro, usa o guardado se estiver offline
    e.respondWith(
      fetch(req).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return r;
      }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
  } else {
    // bibliotecas externas: usa o guardado e, se não houver, busca e guarda
    e.respondWith(
      caches.match(req).then((r) => r || fetch(req).then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
        return resp;
      }))
    );
  }
});
