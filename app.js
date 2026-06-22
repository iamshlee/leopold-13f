// Situational Awareness LP 13F 포트폴리오 + 뉴스
const PALETTE = [
  "#3182f6", "#1bb673", "#f04452", "#f5a623", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#0ea5e9",
  "#14b8a6", "#a855f7",
];
const OTHER_COLOR = "#c2c8d0";
const NEWS_REFRESH_MS = 60_000; // 1분마다 갱신

const fmtUsd = (v) => {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v.toFixed(0);
};
const typeClass = (p) => (p === "put" ? "put" : p === "call" ? "call" : "stock");

function relativeTime(iso) {
  const then = new Date(iso);
  const diff = (Date.now() - then.getTime()) / 1000;
  const d = then.toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}분 전 업데이트`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전 업데이트`;
  return `${d} 기준`;
}

let STATE = { holdings: [], total: 0, sortDir: "asc", sortKey: "pct" };

async function load() {
  let data;
  try {
    const res = await fetch("data/portfolio.json", { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    document.getElementById("updated").textContent =
      "데이터를 불러오지 못했습니다. (로컬에서는 http 서버로 열어주세요)";
    return;
  }
  render(data);
}

function render(data) {
  document.getElementById("fundName").textContent = data.fund;
  document.getElementById("quarterBadge").textContent = data.quarter;
  document.getElementById("quarterValue").textContent = data.quarter;
  document.getElementById("totalValue").textContent = fmtUsd(data.totalValueUsd);
  document.getElementById("holdingsCount").textContent = `${data.holdingsCount}개`;
  document.getElementById("updated").textContent = relativeTime(data.updatedAt);
  document.getElementById("sourceLink").href = data.sourceUrl;

  STATE.holdings = data.holdings;
  STATE.total = data.totalValueUsd;

  renderDisclosures(data.recentDisclosures || [], data.quarter);
  buildDonut(data.holdings);
  buildTable();
  buildNewsChips(data.holdings, data.recentDisclosures || []);
}

// ---------- 분기 외 공시 (Nebius 등) 안내 ----------
function renderDisclosures(list, quarter) {
  const el = document.getElementById("disclosureNotice");
  if (!list.length) { el.hidden = true; return; }
  el.hidden = false;
  const items = list.map((d) => {
    const sh = d.shares ? `${d.shares.toLocaleString()}주` : "";
    const pc = d.percentOfCompany ? ` · 지분 ${d.percentOfCompany}%` : "";
    const tk = d.ticker ? ` (${d.ticker})` : "";
    return `<a href="${d.url}" target="_blank" rel="noopener">${d.issuer}${tk}</a> ${sh}${pc} <span style="color:var(--text-weak)">— ${d.form}, ${d.filedDate} 공시</span>`;
  }).join("<br>");
  el.innerHTML = `
    <span class="notice__chip">분기 외 공시</span>
    <strong>${quarter} 13F 스냅샷 이후</strong> 새로 드러난 지분입니다.
    13F는 분기말 기준이라 분기 중 매수분은 아래 13G/13D로만 보입니다 (다음 분기 13F에 반영).<br>
    ${items}`;
}

// ---------- 도넛 ----------
function buildDonut(holdings) {
  const desc = [...holdings].sort((a, b) => b.pct - a.pct);
  const TOP = 11;
  const top = desc.slice(0, TOP);
  const rest = desc.slice(TOP);
  const restPct = rest.reduce((s, h) => s + h.pct, 0);

  const slices = top.map((h, i) => ({
    label: h.ticker, name: h.name, pct: h.pct, color: PALETTE[i % PALETTE.length],
  }));
  if (restPct > 0)
    slices.push({ label: "기타", name: `그 외 ${rest.length}개`, pct: restPct, color: OTHER_COLOR });

  const svg = document.getElementById("donut");
  svg.innerHTML = "";
  const R = 80, C = 2 * Math.PI * R, CX = 100, CY = 100;
  const total = slices.reduce((s, x) => s + x.pct, 0) || 1;
  let offset = 0;
  const circles = [];
  slices.forEach((s) => {
    const frac = s.pct / total;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", CX); c.setAttribute("cy", CY); c.setAttribute("r", R);
    c.setAttribute("fill", "none"); c.setAttribute("stroke", s.color);
    c.setAttribute("stroke-width", 26);
    c.setAttribute("stroke-dasharray", `${frac * C} ${C}`);
    c.setAttribute("stroke-dashoffset", -offset * C);
    svg.appendChild(c); circles.push(c); offset += frac;
  });

  document.getElementById("donutCenter").textContent =
    Math.round(slices.slice(0, TOP).reduce((s, x) => s + x.pct, 0)) + "%";

  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  slices.forEach((s, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="dot" style="background:${s.color}"></span>
      <span class="lg-name">${s.label} · ${s.name}</span>
      <span class="lg-pct">${s.pct.toFixed(1)}%</span>`;
    const focus = (on) => circles.forEach((c, i) => c.classList.toggle("dim", on && i !== idx));
    li.addEventListener("mouseenter", () => focus(true));
    li.addEventListener("mouseleave", () => focus(false));
    legend.appendChild(li);
  });
}

// ---------- 표 (오름/내림차순 선택) ----------
function buildTable() {
  const { holdings, sortKey, sortDir } = STATE;
  const rows = [...holdings].sort((a, b) =>
    sortDir === "asc" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]
  );
  const maxPct = Math.max(...holdings.map((h) => h.pct), 1);

  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  rows.forEach((h) => {
    const tc = typeClass(h.position);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><div class="tk">${h.ticker}</div><div class="nm">${h.name}</div></td>
      <td><span class="type type--${tc}">${h.positionLabel}</span></td>
      <td class="col-val">${fmtUsd(h.value * 1000)}</td>
      <td class="pct-cell">
        <div class="pct-bar-wrap">
          <div class="pct-bar"><span style="width:${(h.pct / maxPct) * 100}%"></span></div>
          <span class="pct-num">${h.pct.toFixed(2)}%</span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  // 헤더 화살표 표시
  document.querySelectorAll(".holdings th.sortable").forEach((th) => {
    const active = th.dataset.key === sortKey;
    th.classList.toggle("sorted", active);
    th.dataset.arrow = active ? (sortDir === "asc" ? "↑" : "↓") : "";
  });
  document.querySelectorAll("#sortToggle button").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.dir === sortDir)
  );
}

function wireSorting() {
  document.querySelectorAll("#sortToggle button").forEach((b) =>
    b.addEventListener("click", () => { STATE.sortDir = b.dataset.dir; buildTable(); })
  );
  document.querySelectorAll(".holdings th.sortable").forEach((th) =>
    th.addEventListener("click", () => {
      if (STATE.sortKey === th.dataset.key) {
        STATE.sortDir = STATE.sortDir === "asc" ? "desc" : "asc";
      } else {
        STATE.sortKey = th.dataset.key; STATE.sortDir = "asc";
      }
      buildTable();
    })
  );
}

// ---------- 탭 ----------
function wireTabs() {
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((x) => x.classList.remove("is-active"));
      t.classList.add("is-active");
      document.querySelector(`.panel[data-panel="${t.dataset.tab}"]`).classList.add("is-active");
      if (t.dataset.tab === "news") refreshAllNews();
    })
  );
}

// ===================== 뉴스 =====================
// Google News RSS 를 CORS 프록시로 가져온다 (정적 호스팅이라 백엔드 없음).
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
];
const rssUrl = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;

let NEWS = { currentTicker: null, chips: [] };

async function fetchRss(query) {
  const target = rssUrl(query);
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(target), { cache: "no-store" });
      if (!res.ok) continue;
      const text = await res.text();
      const xml = new DOMParser().parseFromString(text, "text/xml");
      const items = [...xml.querySelectorAll("item")].slice(0, 12).map((it) => ({
        title: it.querySelector("title")?.textContent || "",
        link: it.querySelector("link")?.textContent || "#",
        pubDate: it.querySelector("pubDate")?.textContent || "",
        source: it.querySelector("source")?.textContent || "",
      }));
      if (items.length) return items;
    } catch (_) { /* 다음 프록시 시도 */ }
  }
  return null;
}

function newsTimeAgo(pub) {
  if (!pub) return "";
  const diff = (Date.now() - new Date(pub).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

function renderNews(el, items) {
  if (items === null) {
    el.innerHTML = `<li class="news-empty">뉴스를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.</li>`;
    return;
  }
  if (!items.length) { el.innerHTML = `<li class="news-empty">관련 뉴스가 없습니다.</li>`; return; }
  el.innerHTML = items.map((n) => {
    const title = n.title.replace(/ - [^-]+$/, ""); // 끝의 " - 매체명" 제거
    return `<li><a class="news-item" href="${n.link}" target="_blank" rel="noopener">
      <div class="news-title">${title}</div>
      <div class="news-meta"><span>${n.source}</span><span>${newsTimeAgo(n.pubDate)}</span></div>
    </a></li>`;
  }).join("");
}

async function loadPersonNews() {
  const el = document.getElementById("personNews");
  const items = await fetchRss("Leopold Aschenbrenner Situational Awareness");
  renderNews(el, items);
}

async function loadTickerNews() {
  if (!NEWS.currentTicker) return;
  const el = document.getElementById("tickerNews");
  const c = NEWS.chips.find((x) => x.ticker === NEWS.currentTicker);
  const items = await fetchRss(`"${c.name}" stock`);
  renderNews(el, items);
}

function buildNewsChips(holdings, disclosures) {
  // 보유 종목을 티커별로 묶어 평가액 상위 12개 + Nebius(13G)
  const byTicker = {};
  holdings.forEach((h) => {
    if (!h.ticker || h.ticker === "—") return;
    if (!byTicker[h.ticker] || h.value > byTicker[h.ticker].value)
      byTicker[h.ticker] = { ticker: h.ticker, name: h.name, value: h.value };
  });
  let chips = Object.values(byTicker).sort((a, b) => b.value - a.value).slice(0, 12);
  disclosures.forEach((d) => {
    if (d.ticker && !chips.some((c) => c.ticker === d.ticker))
      chips.unshift({ ticker: d.ticker, name: d.issuer.replace(/ N\.V\.| Inc\.?| Corp\.?| Group/gi, "").trim(), value: Infinity, isDisclosure: true });
  });
  NEWS.chips = chips;

  const box = document.getElementById("tickerChips");
  box.innerHTML = chips.map((c) =>
    `<button class="chip" data-ticker="${c.ticker}">${c.ticker}${c.isDisclosure ? '<span class="chip-nbis">13G</span>' : ""}</button>`
  ).join("");
  box.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => selectTicker(b.dataset.ticker))
  );
  // 기본 선택: Nebius 가 있으면 그것, 없으면 최상위
  if (chips.length) selectTicker(chips[0].ticker, false);
}

function selectTicker(ticker, scroll = true) {
  NEWS.currentTicker = ticker;
  const c = NEWS.chips.find((x) => x.ticker === ticker);
  document.querySelectorAll("#tickerChips .chip").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.ticker === ticker)
  );
  document.getElementById("tickerSub").textContent = `${c.name} (${ticker}) 관련 최신 뉴스`;
  document.getElementById("tickerNews").innerHTML = `<li class="news-empty">불러오는 중…</li>`;
  loadTickerNews();
}

async function refreshAllNews() {
  // 순차 요청 — CORS 프록시의 동시 요청 제한을 피한다.
  await loadPersonNews();
  await loadTickerNews();
  const live = document.getElementById("newsLive");
  const t = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  live.textContent = `1분마다 자동 업데이트 · 방금 갱신 ${t}`;
}

function wireNews() {
  document.getElementById("refreshNews").addEventListener("click", refreshAllNews);
  setInterval(() => {
    // 뉴스 탭이 보일 때만 갱신
    if (document.querySelector('.panel[data-panel="news"]').classList.contains("is-active"))
      refreshAllNews();
  }, NEWS_REFRESH_MS);
}

wireTabs();
wireSorting();
wireNews();
load();
