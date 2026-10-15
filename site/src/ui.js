/* ───────── Shared components ───────── */
const ICONS = {
  search: ["M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z", "M21 21l-4.3-4.3"],
  star: ["M12 3.6l2.55 5.2 5.75.84-4.16 4.05.98 5.72L12 16.7l-5.12 2.7.98-5.72L3.7 9.64l5.75-.84z"],
  heart: ["M12 20s-7.2-4.5-9.3-8.8C1.2 8 3.3 5 6.6 5c2 0 3.3 1.1 4.1 2.4L12 9.2l1.3-1.8C14.1 6.1 15.4 5 17.4 5c3.3 0 5.4 3 3.9 6.2C19.2 15.5 12 20 12 20z"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  check: ["M5 12.5l4.5 4.5L19 7"],
  left: ["M15 18l-6-6 6-6"],
  right: ["M9 18l6-6-6-6"],
  down: ["M6 9l6 6 6-6"],
  out: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  info: ["M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20z", "M12 16v-4", "M12 8h.01"],
  sun: ["M12 17a5 5 0 1 0 0-10a5 5 0 0 0 0 10z", "M12 1v2", "M12 21v2", "M4.2 4.2l1.4 1.4", "M18.4 18.4l1.4 1.4", "M1 12h2", "M21 12h2", "M4.2 19.8l1.4-1.4", "M18.4 5.6l1.4-1.4"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"],
  monitor: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z", "M6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5"],
  spark: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 3v4", "M21 5h-4"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M6 6l1 14h10l1-14"],
  thumb: ["M7 10v11H4V10z", "M7 10l4-8c1.7 0 3 1.3 3 3v3h5.2a2 2 0 0 1 2 2.3l-1.4 9A2 2 0 0 1 17.8 21H7"],
  filter: ["M3 5h18", "M6 12h12", "M10 19h4"],
  x: ["M18 6L6 18", "M6 6l12 12"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  trend: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
  clock: ["M12 22a10 10 0 1 0 0-20a10 10 0 0 0 0 20z", "M12 6v6l4 2"],
};
function Icon({ name, size = 16, fill = false, className }) {
  return html`<svg className=${className} width=${size} height=${size} viewBox="0 0 24 24" fill=${fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">${ICONS[name].map((d, i) => html`<path key=${i} d=${d} />`)}</svg>`;
}

function Cover({ s, size = "", className = "", style }) {
  const n = s.nativeShown;
  const len = n ? [...n].length : 0;
  const nfs = len <= 3 ? "17cqw" : len <= 5 ? "14.5cqw" : len <= 8 ? "12cqw" : len <= 12 ? "10cqw" : "8.4cqw";
  return html`<div className=${`cover ${size} ${className}`} role="img" aria-label=${`Generated cover for ${s.title}`} style=${{ background: s.bg, "--acc": s.art.accent, ...style }}>
    <span className="cover-tone"></span>
    ${n && html`<span className=${"cover-native n-" + s.type} lang=${TYPES[s.type].lang} style=${{ "--nfs": nfs }} aria-hidden="true">${n}</span>`}
    <span className="cover-foot" aria-hidden="true">
      <span className="cover-kicker">${TYPES[s.type].label}${s.year ? " · " + s.year : ""}</span>
      <span className="cover-title">${s.title}</span>
    </span>
  </div>`;
}

function SeriesLink({ s, className, children, style }) {
  const { go } = useApp();
  return html`<a className=${className} style=${style} href=${"#series-" + s.id} onClick=${(e) => { e.preventDefault(); go("series", { id: s.id }); }}>${children}</a>`;
}

function TypeTag({ type }) {
  return html`<span className=${"tt tt-" + type}>${TYPES[type].label}</span>`;
}
function Score({ value, label = "AniList average score", size = 13 }) {
  if (value == null) return null;
  return html`<span className="score" title=${label}><${Icon} name="star" size=${size} fill=${true} />${fmtScore(value)}</span>`;
}
function GenreChip({ g, pressed, onClick, count }) {
  const props = { className: "chip" + (onClick ? "" : " chip-static"), style: { "--c": genreColor(g) } };
  return onClick
    ? html`<button type="button" ...${props} aria-pressed=${!!pressed} onClick=${onClick}><span className="dot"></span>${g}${count != null && html`<span className="n">${count}</span>`}</button>`
    : html`<span ...${props}><span className="dot"></span>${g}</span>`;
}

function Card({ s, badge, sub }) {
  const { agg } = useApp();
  const r = agg.rating[s.id];
  return html`<${SeriesLink} s=${s} className="card">
    <div style=${{ position: "relative" }}>
      ${badge && html`<span className="card-badge">${badge}</span>`}
      <${Cover} s=${s} />
    </div>
    <div style=${{ minWidth: 0 }}>
      <div className="card-title">${s.title}</div>
      <div className="card-meta" style=${{ marginTop: "6px" }}>
        <${TypeTag} type=${s.type} />
        <${Score} value=${s.score} />
        ${r && html`<span title="MangaForEver reader rating" className="tnum">· readers ${fmtScore(r.sum / r.n)}</span>`}
      </div>
      <div className="card-genres" style=${{ marginTop: "4px" }}>${sub || s.genres.slice(0, 3).join(" · ")}</div>
    </div>
  <//>`;
}

function Row({ items, render }) {
  return html`<div className="shelf-row" role="list">${items.map((x, i) => html`<div role="listitem" key=${x.id || x.s?.id || i}>${render ? render(x) : html`<${Card} s=${x} />`}</div>`)}</div>`;
}

function Section({ title, desc, action, children, id }) {
  return html`<section className="section" id=${id}>
    <div className="sec-head">
      <div style=${{ minWidth: 0 }}><h2>${title}</h2>${desc && html`<p>${desc}</p>`}</div>
      ${action}
    </div>
    ${children}
  </section>`;
}

function Note({ children }) {
  return html`<p className="note"><${Icon} name="info" size=${14} /><span>${children}</span></p>`;
}

function Tabs({ value, onChange, options, label }) {
  return html`<div className="tabs" role="tablist" aria-label=${label}>
    ${options.map(([v, l]) => html`<button key=${v} type="button" role="tab" className="tab" aria-selected=${value === v} onClick=${() => onChange(v)}>${l}</button>`)}
  </div>`;
}

function RankItem({ s, rank, value, valueLabel, ratio }) {
  return html`<li>
    <${SeriesLink} s=${s} className=${"rank-item" + (rank <= 3 ? " top" : "")}>
      <span className="numeral" aria-label=${"Rank " + rank}>${rank}</span>
      <${Cover} s=${s} size="xs" />
      <div className="rank-body">
        <div className="rank-title">${s.title}</div>
        <div className="rank-sub">${TYPES[s.type].label} · ${s.genres.slice(0, 2).join(", ")} · ${STATUS[s.status]}</div>
        <div className="bar-line">
          <span className="bar"><i style=${{ width: Math.max(4, Math.min(100, ratio * 100)) + "%" }}></i></span>
          <span className="tnum" title=${valueLabel}>${value}</span>
        </div>
      </div>
    <//>
  </li>`;
}

/** Shelf status menu, used on the series page and in the hero. */
function ShelfButton({ s, compact }) {
  const { shelf, setStatus, removeEntry } = useApp();
  const e = shelf.entries[s.id];
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (ev) => { if (ref.current && !ref.current.contains(ev.target)) setOpen(false); };
    const esc = (ev) => ev.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return html`<div className="menu-wrap" ref=${ref}>
    <button type="button" className=${"btn " + (e ? "" : "btn-brand") + (compact ? " btn-sm" : "")} aria-haspopup="menu" aria-expanded=${open} onClick=${() => setOpen((o) => !o)}>
      <${Icon} name=${e ? "check" : "plus"} size=${17} />${e ? SHELF_LABEL[e.status] : "Add to shelf"}<${Icon} name="down" size=${15} />
    </button>
    ${open && html`<div className="menu" role="menu">
      ${SHELF.map(([v, l]) => html`<button key=${v} type="button" role="menuitemradio" aria-checked=${e?.status === v} onClick=${() => { setStatus(s.id, v); setOpen(false); }}>
        <span style=${{ width: "16px" }}>${e?.status === v && html`<${Icon} name="check" size=${15} />`}</span>${l}</button>`)}
      ${e && html`<hr /><button type="button" role="menuitem" onClick=${() => { removeEntry(s.id); setOpen(false); }}><span style=${{ width: "16px" }}><${Icon} name="trash" size=${15} /></span>Remove from shelf</button>`}
    </div>`}
  </div>`;
}

function FavButton({ s, compact }) {
  const { shelf, toggleFav } = useApp();
  const on = !!shelf.entries[s.id]?.fav;
  return html`<button type="button" className=${"btn" + (compact ? " btn-sm" : "")} aria-pressed=${on} onClick=${() => toggleFav(s.id)}>
    <${Icon} name="heart" size=${17} fill=${on} />${on ? "Favorited" : "Favorite"}
  </button>`;
}

function useProfiles(ids) {
  const { rt } = useApp();
  const [map, setMap] = useState({});
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!rt.user || !key) return;
    let live = true;
    Promise.resolve(rt.user.profiles(key.split(","))).then((p) => live && p && setMap(p)).catch(() => {});
    return () => { live = false; };
  }, [rt.user, key]);
  return map;
}
