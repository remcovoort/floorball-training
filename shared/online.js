try{history.scrollRestoration="manual"}catch(e){}
scrollTo(0,0);addEventListener("load",()=>scrollTo(0,0));addEventListener("pageshow",()=>scrollTo(0,0));
/* Online functies voor de gedeelde app:
   - sterren (1–5) per oefening met toelichting, opgeslagen in Supabase
     (of, als testversie binnen Claude, in de gedeelde opslag van het artifact)
   - tellen hoe vaak een oefening in een training wordt gekozen
   - link terug naar het startscherm en de offline-app (service worker) */
(function () {
  const PROGRAM = window.FB_PROGRAM;
  const CFG = window.FB_CONFIG || {};
  const SUPA = !!(CFG.supabaseUrl && CFG.supabaseKey);
  const HOSTED = !!window.FB_HOSTED;
  let api = null, isOwner = false;
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));
  let DEVICE = ls.get("fb-device", null);
  if (!DEVICE) { DEVICE = uuid(); ls.set("fb-device", DEVICE); }

  const MINE_KEY = "fb-rate-" + PROGRAM, QUEUE_KEY = "fb-queue";
  const FB_KEY = "fb-note-" + PROGRAM;
  let mine = ls.get(MINE_KEY, {}), notes = ls.get(FB_KEY, {});
  let stats = {};
  const openFb = new Set(), sentFb = new Set(), drafts = {};
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- Supabase ---------- */
  async function rpc(fn, body) {
    const r = await fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: "Bearer " + CFG.supabaseKey },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error("rpc " + fn + " " + r.status);
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  const supaApi = {
    call: (fn, body) => rpc(fn, body),
    stats: () => rpc("stats", { p_program: PROGRAM }),
    feedback: () => rpc("feedback", { p_program: PROGRAM })
  };

  /* ---------- testversie binnen Claude: gedeelde opslag van het artifact ---------- */
  async function claudeApi() {
    if (HOSTED || !window.claude || typeof claude.use !== "function") return null;
    const [db, user] = await Promise.all([claude.use("db").catch(() => null), claude.use("user").catch(() => null)]);
    if (!db || !user) return null;
    const uid = await user.id(); if (!uid) return null;
    try { isOwner = !!(await user.isOwner()); } catch (e) {}
    const col = db.collection("scores"), ref = col.doc(uid);
    const snap = await Promise.race([ref.get(), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 10000))]);
    const doc = snap.exists ? snap.data() : {}; doc.r = doc.r || {}; doc.p = doc.p || {};
    Object.entries(doc.r).forEach(([k, v]) => { const [pr, ex] = k.split("|"); if (pr === PROGRAM && v && v.s) { mine[ex] = v.s; if (v.f) notes[ex] = v.f; } });
    ls.set(MINE_KEY, mine); ls.set(FB_KEY, notes);
    let chain = Promise.resolve();
    const save = () => (chain = chain.then(() => ref.set(JSON.parse(JSON.stringify(doc)))));
    const all = async () => (await col.get()).docs.map(d => d.data() || {});
    return {
      async call(fn, b) {
        const k = b.p_program + "|" + b.p_exercise;
        if (fn === "rate") { const prev = doc.r[k] || {}; doc.r[k] = { s: b.p_score, f: b.p_feedback == null ? prev.f || "" : String(b.p_feedback).trim().slice(0, 500), at: new Date().toISOString() }; }
        if (fn === "pick") { const d = new Date().toISOString().slice(0, 10), arr = doc.p[k] || []; if (arr.includes(d)) return; arr.push(d); doc.p[k] = arr.slice(-366); }
        await save();
      },
      async stats() {
        const agg = {};
        const row = ex => agg[ex] = agg[ex] || { exercise_id: ex, sum: 0, votes: 0, picks: 0, pickers: 0, comments: 0 };
        (await all()).forEach(d => {
          Object.entries(d.r || {}).forEach(([k, v]) => { const [pr, ex] = k.split("|"); if (pr !== PROGRAM || !v || !v.s) return; const a = row(ex); a.sum += v.s; a.votes++; if (v.f) a.comments++; });
          Object.entries(d.p || {}).forEach(([k, v]) => { const [pr, ex] = k.split("|"); if (pr !== PROGRAM || !v || !v.length) return; const a = row(ex); a.picks += v.length; a.pickers++; });
        });
        return Object.values(agg).map(a => ({ ...a, avg_score: a.votes ? a.sum / a.votes : null }));
      },
      async feedback() {
        const out = [];
        (await all()).forEach(d => Object.entries(d.r || {}).forEach(([k, v]) => { const [pr, ex] = k.split("|"); if (pr === PROGRAM && v && v.f) out.push({ exercise_id: ex, score: v.s, feedback: v.f, updated_at: v.at }); }));
        return out.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
      }
    };
  }

  function enqueue(job) { const q = ls.get(QUEUE_KEY, []); q.push(job); ls.set(QUEUE_KEY, q.slice(-200)); flush(); }
  let flushing = false;
  async function flush() {
    if (!api || flushing) return; flushing = true;
    try {
      let q = ls.get(QUEUE_KEY, []);
      while (q.length) {
        const job = q[0];
        try { await api.call(job.fn, job.body); }
        catch (e) { break; }
        q = ls.get(QUEUE_KEY, []); q.shift(); ls.set(QUEUE_KEY, q);
      }
    } finally { flushing = false; }
  }
  async function loadStats() {
    if (!api) return;
    try {
      const rows = await api.stats();
      stats = {}; (rows || []).forEach(r => { stats[r.exercise_id] = r; });
      refreshAll();
    } catch (e) {}
  }

  /* ---------- sterren ---------- */
  const fmt = v => (Math.round(v * 10) / 10).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function label(id) {
    const s = stats[id], m = mine[id];
    const avg = s && s.votes ? `gemiddeld ${fmt(+s.avg_score)} (${s.votes})` : "";
    if (m) return `Jouw score ${m}${avg ? " · " + avg : ""}`;
    return avg || "Nog geen scores · geef de eerste";
  }
  function widget(id) {
    const m = mine[id] || 0, s = stats[id], show = m || (s && s.votes ? Math.round(+s.avg_score) : 0);
    const cls = m ? "mine" : "avg";
    return `<div class="fb-rate" data-ex="${id}"><span class="fb-stars" role="group" aria-label="Geef een score van 1 tot 5">` +
      [1, 2, 3, 4, 5].map(n => `<button type="button" class="fb-star ${n <= show ? "on " + cls : ""}" data-rate="${n}" data-ex="${id}" aria-label="${n} ${n === 1 ? "ster" : "sterren"}" aria-pressed="${m === n}">★</button>`).join("") +
      `</span><span class="fb-lbl">${label(id)}</span>` + feedbackHtml(id) + `</div>`;
  }
  function feedbackHtml(id) {
    if (!mine[id]) return "";
    const note = drafts[id] != null ? drafts[id] : notes[id] || "";
    if (openFb.has(id)) return `<form class="fb-form" data-fbform="${id}"><label>${mine[id] <= 2 ? "Wat kan er beter aan deze oefening?" : "Wat werkte goed, of wat kan beter?"}</label>` +
      `<textarea aria-label="Toelichting" maxlength="500" rows="3" placeholder="Bijvoorbeeld: te ingewikkeld voor groep 4, of: werkt goed als warming-up">${esc(note)}</textarea>` +
      `<div class="fb-fact"><button type="submit" class="fb-send">Versturen</button><button type="button" class="fb-cancel" data-fbtoggle="${id}">Annuleren</button></div></form>`;
    return `<button type="button" class="fb-fbtn" data-fbtoggle="${id}">${sentFb.has(id) ? "Bedankt! Toelichting aanpassen" : note ? "Toelichting aanpassen" : "Toelichting geven"}</button>`;
  }
  function refresh(el) {
    const id = el.dataset.ex, ta = el.querySelector("textarea"), focus = ta && document.activeElement === ta;
    if (ta) drafts[id] = ta.value;
    el.insertAdjacentHTML("afterend", widget(id)); const nw = el.nextElementSibling; el.remove();
    if (focus) { const n = nw.querySelector("textarea"); if (n) { n.focus({ preventScroll: true }); n.setSelectionRange(n.value.length, n.value.length); } }
  }
  function refreshAll() { document.querySelectorAll(".fb-rate").forEach(refresh); applyStarFilter(); }

  /* ---------- filter op aantal sterren ---------- */
  let starMin = ls.get("fb-starfilter-" + PROGRAM, "all");
  const scoreOf = id => { const s = stats[id]; return s && s.votes ? +s.avg_score : mine[id] || null; };
  function starFilterHtml() {
    const opts = [["all", "Alle"], ["5", "★★★★★"], ["4", "★★★★ en meer"], ["3", "★★★ en meer"], ["2", "★★ en meer"], ["low", "Onder ★★★"], ["none", "Nog geen score"]];
    return `<label class="fb-sf">Sterren <select id="fb-starfilter" aria-label="Filter op aantal sterren">${opts.map(([v, l]) => `<option value="${v}"${v === starMin ? " selected" : ""}>${l}</option>`).join("")}</select></label>`;
  }
  /* zoeken: titel, doel, uitleg, variaties … alles wat bij de oefening staat */
  let query = "";
  const norm = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const strip = t => String(t).replace(/<[^>]*>/g, " ");
  const textIdx = {};
  function textOf(id) {
    if (textIdx[id] != null) return textIdx[id];
    let t = "";
    const ex = typeof EX !== "undefined" && EX.find(e => e.id === id);
    const walk = v => { if (v == null) return; if (typeof v === "string") t += " " + strip(v); else if (Array.isArray(v)) v.forEach(walk); else if (typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (k !== "fig" && k !== "anim") walk(x); }); };
    if (ex) walk(ex);
    return (textIdx[id] = norm(t));
  }
  function searchHtml() {
    return `<label class="fb-search"><span class="fb-search-i" aria-hidden="true">⌕</span><input id="fb-search" type="search" placeholder="Zoek oefening" aria-label="Zoek oefening" autocomplete="off" value="${esc(query)}"></label>`;
  }
  function ensureStarFilter() {
    const f = document.getElementById("filters");
    if (!f) return;
    if (!f.querySelector("#fb-search")) {
      const had = document.activeElement && document.activeElement.id === "fb-search";
      f.insertAdjacentHTML("afterbegin", searchHtml());
      if (had) { const i = f.querySelector("#fb-search"); i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); }
    }
    if (!f.querySelector("#fb-starfilter")) f.insertAdjacentHTML("beforeend", starFilterHtml());
  }
  function matches(card, id) {
    if (!query.trim()) return true;
    const h = card.querySelector("h3"), ex = typeof EX !== "undefined" && EX.find(e => e.id === id);
    const hay = norm((ex && ex.title) || (h && h.textContent) || "");
    return norm(query).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }
  function passes(id) {
    if (starMin === "all") return true;
    const v = scoreOf(id);
    if (starMin === "none") return v == null;
    if (v == null) return false;
    if (starMin === "low") return v < 3;
    return Math.round(v * 10) / 10 >= +starMin - 0.25;
  }
  function applyStarFilter() {
    const grid = document.getElementById("grid"); if (!grid) return;
    let shown = 0;
    grid.querySelectorAll("article.card").forEach(card => {
      const b = card.querySelector("[data-open]"); const ok = !b || (passes(b.dataset.open) && matches(card, b.dataset.open));
      card.style.display = ok ? "" : "none"; if (ok) shown++;
    });
    grid.querySelectorAll(".grid-h").forEach(h => {
      let n = h.nextElementSibling, any = false;
      while (n && !n.classList.contains("grid-h")) { if (n.matches("article.card") && n.style.display !== "none") any = true; n = n.nextElementSibling; }
      h.style.display = any ? "" : "none";
    });
    let msg = document.getElementById("fb-sf-empty");
    if (!shown) { if (!msg) grid.insertAdjacentHTML("beforebegin", `<p class="note" id="fb-sf-empty"></p>`); }
    else if (msg) msg.remove();
    msg = document.getElementById("fb-sf-empty");
    if (msg) msg.textContent = query.trim() ? `Niets gevonden voor “${query.trim()}”. Probeer een andere naam, of kies Alles bij de onderdelen.` : "Geen oefeningen met dit aantal sterren. Kies een ander filter.";
  }
  document.addEventListener("input", ev => { if (ev.target.id !== "fb-search") return; query = ev.target.value; applyStarFilter(); });
  document.addEventListener("change", ev => {
    if (ev.target.id !== "fb-starfilter") return;
    starMin = ev.target.value; ls.set("fb-starfilter-" + PROGRAM, starMin); applyStarFilter();
  });
  function decorate() {
    ensureStarFilter();
    document.querySelectorAll("#grid article.card").forEach(card => {
      if (card.querySelector(".fb-rate")) return;
      const b = card.querySelector("[data-open]"); if (!b) return;
      const act = card.querySelector(".actions");
      act.insertAdjacentHTML("beforebegin", widget(b.dataset.open));
    });
    applyStarFilter();
  }

  /* ---------- klikken ---------- */
  document.addEventListener("click", ev => {
    const star = ev.target.closest("[data-rate]");
    if (star) {
      const id = star.dataset.ex, n = +star.dataset.rate;
      mine[id] = n; ls.set(MINE_KEY, mine);
      openFb.add(id); sentFb.delete(id);
      refreshAll();
      const ta = document.querySelector(`#grid [data-fbform="${id}"] textarea`); if (ta) ta.focus({ preventScroll: true });
      enqueue({ fn: "rate", body: { p_program: PROGRAM, p_exercise: id, p_device: DEVICE, p_score: n } }); setTimeout(loadStats, 1200);
      return;
    }
    const tg = ev.target.closest("[data-fbtoggle]");
    if (tg) { const id = tg.dataset.fbtoggle; if (openFb.has(id)) { openFb.delete(id); delete drafts[id]; } else openFb.add(id); refreshAll(); return; }
    const t = ev.target.closest("[data-toggle]");
    if (t && t.getAttribute("aria-pressed") !== "true")
      enqueue({ fn: "pick", body: { p_program: PROGRAM, p_exercise: t.dataset.toggle, p_device: DEVICE } });
  }, true);
  document.addEventListener("submit", ev => {
    const f = ev.target.closest("[data-fbform]"); if (!f) return;
    ev.preventDefault();
    const id = f.dataset.fbform, txt = f.querySelector("textarea").value.trim().slice(0, 500);
    notes[id] = txt; ls.set(FB_KEY, notes); delete drafts[id]; openFb.delete(id); sentFb.add(id); refreshAll();
    if (mine[id]) { setTimeout(loadStats, 1200); enqueue({ fn: "rate", body: { p_program: PROGRAM, p_exercise: id, p_device: DEVICE, p_score: mine[id], p_feedback: txt } }); }
  }, true);

  /* ---------- overzicht van scores en toelichtingen (testversie: alleen voor de eigenaar) ---------- */
  async function openReport() {
    let d = document.getElementById("fb-report");
    if (!d) {
      document.body.insertAdjacentHTML("beforeend", `<dialog id="fb-report" aria-labelledby="fb-report-t"><div class="dlg-head"><div><div class="num">Alle gebruikers</div><h2 id="fb-report-t">Scores en toelichtingen</h2></div><button class="close" type="button" data-close aria-label="Sluiten">×</button></div><div class="dlg-body" id="fb-report-b"></div></dialog>`);
      d = document.getElementById("fb-report");
      d.addEventListener("click", e => { if (e.target === d) d.close(); });
    }
    const body = document.getElementById("fb-report-b"); body.innerHTML = `<p class="note">Laden…</p>`; d.showModal();
    try {
      const [rows, fb] = await Promise.all([api.stats(), api.feedback()]);
      const list = (typeof EX !== "undefined" ? EX : []).map(e => ({ e, s: rows.find(r => r.exercise_id === e.id) || {} }))
        .sort((a, b) => (a.s.avg_score ?? 9) - (b.s.avg_score ?? 9) || a.e.title.localeCompare(b.e.title, "nl"));
      const st = v => v == null ? "–" : "★".repeat(Math.round(v)) + "☆".repeat(5 - Math.round(v)) + " " + fmt(v);
      body.innerHTML = `<p class="note">Laagste score bovenaan. Rood: gemiddeld onder de 2,5 met minstens 3 stemmen.</p><div class="fb-rep">` + list.map(({ e, s }) => {
        const f = fb.filter(x => x.exercise_id === e.id), low = s.votes >= 3 && s.avg_score < 2.5;
        return `<details class="fb-repi${low ? " low" : ""}"${f.length ? "" : " data-empty"}><summary><b>${esc(e.title)}</b><span>${st(s.avg_score)} · ${s.votes || 0} stemmen · ${s.picks || 0}× gekozen · ${f.length} ${f.length === 1 ? "toelichting" : "toelichtingen"}</span></summary>` +
          (f.length ? `<ul>${f.map(x => `<li><span class="fb-s">${"★".repeat(x.score)}</span> ${esc(x.feedback)}</li>`).join("")}</ul>` : "") + `</details>`;
      }).join("") + `</div>`;
    } catch (e) { body.innerHTML = `<p class="note">De scores konden niet worden geladen.</p>`; }
  }
  document.addEventListener("click", ev => { if (ev.target.closest("#fb-report-open")) openReport(); });

  /* ---------- opmaak ---------- */
  const css = `.fb-rate{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.fb-stars{display:inline-flex}
.fb-star{font:22px/1 var(--body,system-ui);width:34px;height:34px;padding:0;border:none;background:none;color:var(--line);cursor:pointer;border-radius:6px}
.fb-star.on.avg{color:var(--cone,#f2b705);opacity:.55}.fb-star.on.mine{color:var(--cone,#f2b705)}
.fb-star:hover,.fb-star:focus-visible{background:var(--bg)}
.fb-lbl{font-size:13px;color:var(--muted)}
.fb-fbtn{font:inherit;font-size:13px;font-weight:700;color:var(--accent);background:none;border:none;padding:4px 0;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.fb-form{flex-basis:100%;display:grid;gap:6px;margin-top:2px}
.fb-form label{font-size:14px;font-weight:700}.fb-form label span{font-weight:400;color:var(--muted)}
.fb-form textarea{font:inherit;font-size:15px;width:100%;padding:8px 10px;border-radius:8px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);resize:vertical}
.fb-fact{display:flex;gap:8px}
.fb-send,.fb-cancel{font:inherit;font-size:14px;font-weight:700;border-radius:8px;padding:6px 12px;cursor:pointer;border:1.5px solid var(--ink);background:transparent;color:var(--ink)}
.fb-send{background:var(--ink);color:var(--surface)}
.fb-dlg-rate{background:var(--bg);border-radius:10px;padding:10px 12px}
.fb-dlg-rate h4{margin:0 0 2px}
.fb-sf{display:inline-flex;align-items:center;gap:6px;font-size:15px;margin-left:auto}
.fb-sf select{font:inherit;font-size:15px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);padding:5px 10px;border-radius:999px;cursor:pointer}
.fb-home{display:inline-flex;align-items:center;gap:6px;font:700 15px var(--body,system-ui);color:var(--ink);text-decoration:none;border:1.5px solid var(--line);border-radius:999px;padding:5px 12px;justify-self:start;background:var(--surface)}
.fb-home:hover{border-color:var(--ink)}
.fb-rep{display:grid;gap:8px}
.fb-repi{border:1px solid var(--line);border-radius:10px;padding:8px 12px}
.fb-repi.low{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}
.fb-repi summary{cursor:pointer;display:grid;gap:2px}.fb-repi summary span{font-size:14px;color:var(--muted)}
.fb-repi[data-empty] summary{cursor:default;list-style:none}
.fb-repi ul{margin:8px 0 2px;padding-left:18px;display:grid;gap:4px;font-size:15px}
.fb-s{color:var(--cone,#f2b705)}
.fb-search{display:inline-flex;align-items:center;gap:6px;flex:1 1 180px;max-width:320px;border:1.5px solid var(--line);background:var(--surface);border-radius:999px;padding:0 6px 0 12px}
.fb-search:focus-within{border-color:var(--ink)}
.fb-search-i{color:var(--muted);font-size:18px;line-height:1}
.fb-search input{font:inherit;font-size:15px;border:none;outline:none;background:none;color:var(--ink);padding:6px 4px;width:100%;min-width:0}
header.fb-has-logo{position:relative}
header.fb-has-logo>:not(.fb-logo-a):not(.fb-home){padding-right:clamp(64px,15vw,110px);text-align:left}
.fb-logo-a{position:absolute;top:18px;right:0}
.fb-logo{display:block;width:auto;height:clamp(84px,19vw,130px)}
@media print{.fb-form,.fb-rate,.fb-dlg-rate,.fb-home,.fb-search{display:none!important}.fb-logo{height:70px}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function start() {
    const head = document.querySelector("header");
    if (HOSTED && head && !head.querySelector(".fb-home")) head.insertAdjacentHTML("afterbegin", `<a class="fb-home" href="../">← Terug naar startpagina</a>`);
    if (HOSTED && head && !head.querySelector(".fb-logo")) { head.classList.add("fb-has-logo"); head.insertAdjacentHTML("afterbegin", `<a href="../" class="fb-logo-a" aria-label="Naar de startpagina"><img class="fb-logo" src="../icons/ufc-logo.png" alt="UFC Utrecht" width="155" height="224"></a>`); }
    decorate();
    const mo = new MutationObserver(decorate);
    ["grid", "dlg-body", "filters"].forEach(id => { const el = document.getElementById(id); if (el) mo.observe(el, { childList: true }); });
    (async () => {
      if (SUPA) api = supaApi;
      else { try { api = await claudeApi(); } catch (e) { api = null; } }
      if (api && !SUPA && isOwner && head && !document.getElementById("fb-report-open"))
        head.insertAdjacentHTML("beforeend", `<button type="button" class="linkbtn" id="fb-report-open">Scores en toelichtingen van alle gebruikers</button>`);
      refreshAll(); loadStats(); flush();
    })();
    if (HOSTED && "serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.FB_ONLINE = { loadStats, get stats() { return stats; } };
})();
