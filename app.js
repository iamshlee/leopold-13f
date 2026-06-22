// Situational Awareness LP 13F 포트폴리오 렌더링
const PALETTE = [
  "#3182f6", "#1bb673", "#f04452", "#f5a623", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#0ea5e9",
  "#14b8a6", "#a855f7",
];
const OTHER_COLOR = "#c2c8d0";

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

  const link = document.getElementById("sourceLink");
  link.href = data.sourceUrl;

  buildDonut(data.holdings);
  buildTable(data.holdings, data.totalValueUsd);
}

// 상위 N개 + 기타 로 묶어 도넛/범례 생성
function buildDonut(holdings) {
  const desc = [...holdings].sort((a, b) => b.pct - a.pct);
  const TOP = 11;
  const top = desc.slice(0, TOP);
  const rest = desc.slice(TOP);
  const restPct = rest.reduce((s, h) => s + h.pct, 0);

  const slices = top.map((h, i) => ({
    label: h.ticker,
    name: h.name,
    pct: h.pct,
    color: PALETTE[i % PALETTE.length],
  }));
  if (restPct > 0)
    slices.push({ label: "기타", name: `그 외 ${rest.length}개`, pct: restPct, color: OTHER_COLOR });

  const svg = document.getElementById("donut");
  svg.innerHTML = "";
  const R = 80, C = 2 * Math.PI * R, CX = 100, CY = 100;
  const total = slices.reduce((s, x) => s + x.pct, 0) || 1;
  let offset = 0;
  const circles = [];

  slices.forEach((s, idx) => {
    const frac = s.pct / total;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", CX);
    c.setAttribute("cy", CY);
    c.setAttribute("r", R);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", s.color);
    c.setAttribute("stroke-width", 26);
    c.setAttribute("stroke-dasharray", `${frac * C} ${C}`);
    c.setAttribute("stroke-dashoffset", -offset * C);
    svg.appendChild(c);
    circles.push(c);
    offset += frac;
  });

  document.getElementById("donutCenter").textContent =
    Math.round(slices.slice(0, TOP).reduce((s, x) => s + x.pct, 0)) + "%";

  // 범례
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  slices.forEach((s, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="dot" style="background:${s.color}"></span>
      <span class="lg-name">${s.label} · ${s.name}</span>
      <span class="lg-pct">${s.pct.toFixed(1)}%</span>`;
    const focus = (on) =>
      circles.forEach((c, i) => c.classList.toggle("dim", on && i !== idx));
    li.addEventListener("mouseenter", () => focus(true));
    li.addEventListener("mouseleave", () => focus(false));
    legend.appendChild(li);
  });
}

// 비율 오름차순 표 (데이터가 이미 오름차순 정렬되어 있음)
function buildTable(holdings, total) {
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = "";
  const maxPct = Math.max(...holdings.map((h) => h.pct), 1);

  holdings.forEach((h) => {
    const tc = typeClass(h.position);
    const label = h.positionLabel;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="tk">${h.ticker}</div>
        <div class="nm">${h.name}</div>
      </td>
      <td><span class="type type--${tc}">${label}</span></td>
      <td class="col-val">${fmtUsd(h.value * 1000)}</td>
      <td class="pct-cell">
        <div class="pct-bar-wrap">
          <div class="pct-bar"><span style="width:${(h.pct / maxPct) * 100}%"></span></div>
          <span class="pct-num">${h.pct.toFixed(2)}%</span>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

load();
