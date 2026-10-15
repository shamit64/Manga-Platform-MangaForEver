/* ───────── Header & footer ───────── */
const NAV = [
  ["home", "Discover"],
  ["explore", "Explore"],
  ["rankings", "Rankings"],
  ["seasonal", "Seasonal"],
  ["shelf", "My shelf"],
];

function NavLinks() {
  const { route, go, shelf } = useApp();
  const n = Object.keys(shelf.entries).length;
  return NAV.map(([p, l]) => html`<a key=${p} href=${p === "home" ? "#" : "#" + p} aria-current=${route.page === p ? "page" : undefined}
    onClick=${(e) => { e.preventDefault(); go(p); }}>${l}${p === "shelf" && n > 0 && html`<span className="count tnum">${n}</span>`}</a>`);
}

function Header() {
  const { go, theme, setTheme } = useApp();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef(null);
  const box = useRef(null);
  const results = useMemo(() => (q.trim() ? searchSeries(q).slice(0, 6) : []), [q]);
  const fuzzy = useMemo(() => (q.trim().length > 2 && !results.length ? similarTitles(q, 4) : []), [q, results]);
  const list = results.length ? results : fuzzy;
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName || "";
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); input.current?.focus(); }
    };
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", away);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", away); };
  }, []);
  const submit = (e) => {
    e.preventDefault();
    if (active >= 0 && list[active]) go("series", { id: list[active].id });
    else go("explore", { preset: { q: q.trim() } });
    setOpen(false);
    input.current?.blur();
  };
  const nextTheme = { system: "light", light: "dark", dark: "system" }[theme];
  const themeIcon = { system: "monitor", light: "sun", dark: "moon" }[theme];
  return html`<header className="hdr">
    <div className="wrap">
      <div className="hdr-in">
        <a className="logo" href="#" onClick=${(e) => { e.preventDefault(); go("home"); }} aria-label="MangaForEver home">
          <span className="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <span className="word">Manga<span className="text-brand">Verse</span></span>
        </a>
        <nav className="nav" aria-label="Main"><${NavLinks} /></nav>
        <div className="hdr-tools">
          <form className="search" role="search" onSubmit=${submit} ref=${box}>
            <${Icon} name="search" size=${17} />
            <label className="sr" htmlFor="q">Search titles and creators</label>
            <input id="q" ref=${input} type="search" autoComplete="off" placeholder="Search titles, creators…" value=${q}
              onChange=${(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
              onFocus=${() => setOpen(true)}
              onKeyDown=${(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
                if (e.key === "Escape") setOpen(false);
              }}
              aria-expanded=${open && list.length > 0} aria-controls="suggest" />
            <kbd aria-hidden="true">/</kbd>
            ${open && q.trim() && html`<div className="suggest" id="suggest" role="listbox">
              ${!results.length && fuzzy.length > 0 && html`<p className="s-m" style=${{ padding: "6px 8px" }}>No exact match. Did you mean:</p>`}
              ${!list.length && html`<p className="s-m" style=${{ padding: "8px" }}>No titles or creators match "${q.trim()}".</p>`}
              ${list.map((s, i) => html`<a key=${s.id} href=${"#series-" + s.id} role="option" data-active=${i === active} aria-selected=${i === active}
                onClick=${(e) => { e.preventDefault(); go("series", { id: s.id }); setOpen(false); }}>
                <${Cover} s=${s} size="xs" />
                <span style=${{ minWidth: 0 }}><span className="s-t" style=${{ display: "block" }}>${s.title}</span>
                <span className="s-m">${TYPES[s.type].label} · ${s.year || "—"} · ${s.authors[0] || s.artists[0] || "Creator not listed"}</span></span>
              </a>`)}
              ${results.length > 0 && html`<a href="#explore" className="all" onClick=${submit}>See all results for "${q.trim()}"</a>`}
            </div>`}
          </form>
          <button type="button" className="icon-btn" onClick=${() => setTheme(nextTheme)} aria-label=${`Theme: ${theme}. Switch to ${nextTheme}`} title=${`Theme: ${theme}`}>
            <${Icon} name=${themeIcon} size=${18} />
          </button>
        </div>
      </div>
      <nav className="subnav nav" aria-label="Sections"><${NavLinks} /></nav>
    </div>
  </header>`;
}

function Footer() {
  return html`<footer>
    <div className="wrap foot">
      <div>
        <a className="logo" href="#" style=${{ fontSize: "18px" }} onClick=${(e) => e.preventDefault()}>
          <span className="logo-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>Manga<span className="text-brand">Verse</span></span>
        </a>
        <p style=${{ marginTop: "10px" }}>Discover. Track. Review. Explore. MangaForEver is a database and tracker. It hosts no chapters and links to AniList for official sources.</p>
      </div>
      <p>Series facts (titles, creators, dates, chapter counts, scores and popularity) come from <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a>, synced ${fmtDate(SYNCED)}.
      Covers here are generated from each series' genres; official cover art belongs to its publishers and is shown on each title's AniList page.
      Reader ratings and reviews are written by people using this page.</p>
    </div>
  </footer>`;
}

/* ───────── Home ───────── */
function Hero() {
  const { go } = useApp();
  const picks = DATA.featured.map((f) => ({ ...f, s: BY_ID.get(f.id) })).filter((f) => f.s);
  const [i, setI] = useState(0);
  const f = picks[i];
  if (!f) return null;
  const s = f.s;
  const next = picks[(i + 1) % picks.length].s;
  return html`<section className="hero" aria-roledescription="carousel" aria-label="Editor's picks">
    <div className="aurora" aria-hidden="true"></div>
    <div className="wrap hero-grid">
      <div key=${s.id} className="hero-anim" style=${{ minWidth: 0 }}>
        <span className="hero-eyebrow"><${Icon} name="star" size=${14} fill=${true} />Editor's pick ${i + 1} of ${picks.length}</span>
        <h1>${s.title}</h1>
        <p className="hero-alt">${[s.native, s.romaji].filter(Boolean).filter((x, j, a) => a.indexOf(x) === j && x !== s.title).join(" · ")}</p>
        <div className="hero-meta">
          <${TypeTag} type=${s.type} />
          <span className=${"pill" + (s.status === "ONGOING" ? " ongoing" : "")}>${STATUS[s.status]}</span>
          <span>${[s.year, s.demo && DEMO[s.demo], s.authors.slice(0, 2).join(", ") || s.artists[0]].filter(Boolean).join(" · ")}</span>
        </div>
        <blockquote className="hero-quote" style=${{ margin: "18px 0 0" }}>${f.reason}<cite>Why we picked it · MangaForEver editors</cite></blockquote>
        <div className="hero-genres">${s.genres.map((g) => html`<${GenreChip} key=${g} g=${g} />`)}</div>
        <div className="hero-actions">
          <a className="btn" href=${"#series-" + s.id} onClick=${(e) => { e.preventDefault(); go("series", { id: s.id }); }}>View series</a>
          <${ShelfButton} s=${s} />
          <${FavButton} s=${s} />
        </div>
        <div className="hero-nav">
          <button type="button" className="icon-btn" aria-label="Previous pick" onClick=${() => setI((i - 1 + picks.length) % picks.length)}><${Icon} name="left" /></button>
          <div className="dots">${picks.map((p, j) => html`<button key=${p.id} type="button" aria-label=${`Show pick ${j + 1}: ${p.s.title}`} aria-current=${j === i} onClick=${() => setI(j)}></button>`)}</div>
          <button type="button" className="icon-btn" aria-label="Next pick" onClick=${() => setI((i + 1) % picks.length)}><${Icon} name="right" /></button>
        </div>
      </div>
      <div className="hero-art" style=${{ "--acc": s.art.accent }}>
        <div className="hero-glow" aria-hidden="true"></div>
        <${Cover} s=${next} className="back" />
        <${SeriesLink} s=${s} style=${{ display: "block" }}><${Cover} s=${s} className="front" /><//>
        <div className="hero-stat">
          <div className="k">AniList score</div>
          <div className="v tnum">${fmtScore(s.score)}<span style=${{ fontSize: "15px", opacity: 0.8 }}> / 10</span></div>
          <div className="s">${s.popRank ? `#${s.popRank} most popular on AniList` : fmtK(s.pop) + " AniList members"}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function Origins() {
  const { go } = useApp();
  return html`<div className="origins">
    ${TYPE_KEYS.map((t) => {
      const list = BY_POP.filter((s) => s.type === t);
      return html`<a key=${t} className="origin" href="#explore" style=${{ "--c": `var(--${t.toLowerCase()})` }}
        onClick=${(e) => { e.preventDefault(); go("explore", { preset: { types: [t] } }); }}>
        <div>
          <div className=${"o-native n-" + t} lang=${TYPES[t].lang} aria-hidden="true">${TYPES[t].native}</div>
          <h3>${TYPES[t].label}</h3>
          <p>${TYPES[t].origin} · <span className="tnum">${list.length}</span> series</p>
        </div>
        <p className="o-blurb">${TYPES[t].blurb}</p>
        <div className="fan" aria-hidden="true">${list.slice(0, 3).map((s) => html`<${Cover} key=${s.id} s=${s} size="xs" />`)}</div>
      </a>`;
    })}
  </div>`;
}

function TopTen() {
  const [t, setT] = useState("ALL");
  const list = BY_POP.filter((s) => t === "ALL" || s.type === t).slice(0, 10);
  const max = list[0]?.pop || 1;
  return html`<${Section} title="Most popular on AniList" desc="Ranked by how many AniList members track each series."
    action=${html`<${Tabs} label="Filter by type" value=${t} onChange=${setT} options=${[["ALL", "All"], ...TYPE_KEYS.map((k) => [k, TYPES[k].label])]} />`}>
    <ol className="rank-list">${list.map((s, i) => html`<${RankItem} key=${s.id} s=${s} rank=${i + 1} value=${fmtK(s.pop) + " members"} valueLabel="AniList members tracking this series" ratio=${(s.pop || 0) / max} />`)}</ol>
  <//>`;
}

function GenreCloud() {
  const { go } = useApp();
  const counts = useMemo(() => {
    const c = {};
    for (const s of SERIES) for (const g of s.genres) c[g] = (c[g] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, []);
  return html`<div className="fchips" style=${{ gap: "8px" }}>
    ${counts.map(([g, n]) => html`<${GenreChip} key=${g} g=${g} count=${n} onClick=${() => go("explore", { preset: { genres: [g] } })} />`)}
  </div>`;
}

function LatestReviews() {
  const { agg, rt } = useApp();
  const list = [...agg.reviews].sort((a, b) => b.at - a.at).slice(0, 4);
  const profiles = useProfiles(list.map((r) => r.uid));
  if (!list.length) {
    return html`<div className="empty"><strong>No reader reviews yet</strong>
      ${rt.mode === "cloud" ? "Open any series and be the first to review it. Reviews you write here are visible to everyone who opens this page." : "Reviews are shared through claude.ai. Open this page while signed in to read and write them."}</div>`;
  }
  return html`<div className="origins">${list.map((r) => {
    const s = BY_ID.get(r.sid);
    const p = profiles[r.uid];
    return html`<${SeriesLink} key=${r.uid + r.sid} s=${s} className="panel" style=${{ textDecoration: "none", display: "flex", gap: "14px" }}>
      <${Cover} s=${s} size="xs" style=${{ width: "56px", flexShrink: 0, borderRadius: "8px" }} />
      <div style=${{ minWidth: 0 }}>
        <div className="label">${s.title}</div>
        <div style=${{ fontWeight: 700, marginTop: "6px" }}>${r.title}</div>
        <p className="muted" style=${{ fontSize: "13.5px", marginTop: "4px" }}>${r.spoiler ? "Contains spoilers." : r.body.slice(0, 120) + (r.body.length > 120 ? "…" : "")}</p>
        <p className="note" style=${{ marginTop: "8px" }}>${(p && p.name) || "A reader"} · ${ago(r.at)}${r.score ? ` · rated ${r.score}/10` : ""}</p>
      </div>
    <//>`;
  })}</div>`;
}

function Home() {
  const { go, shelf, ratings } = useApp();
  const reading = Object.entries(shelf.entries).filter(([, e]) => e.status === "READING").sort((a, b) => b[1].at - a[1].at).map(([id]) => BY_ID.get(id));
  const recs = useMemo(() => recommend(shelf.entries, ratings, 12), [shelf.entries, ratings]);
  const topRated = (t) => SERIES.filter((s) => s.type === t && s.score != null && (s.pop || 0) > 8000).sort((a, b) => b.score - a.score || b.pop - a.pop).slice(0, 12);
  const fall = DATA.seasonal.find((c) => c.season === "FALL") || DATA.seasonal[0];
  const counts = TYPE_KEYS.map((t) => SERIES.filter((s) => s.type === t).length);
  const ongoing = SERIES.filter((s) => s.status === "ONGOING").length;
  return html`<main>
    <${Hero} />
    <div className="wrap">
      <div className="strip">
        <span><b className="tnum">${SERIES.length}</b>series</span>
        ${TYPE_KEYS.map((t, i) => html`<span key=${t}><b className="tnum">${counts[i]}</b>${TYPES[t].label.toLowerCase()}</span>`)}
        <span><b className="tnum">${ongoing}</b>still running</span>
        <span className="src">Facts from AniList · synced ${fmtDate(SYNCED)}</span>
      </div>
      ${reading.length > 0 && html`<${Section} title="Continue reading" desc="Series on your shelf marked Reading." action=${html`<button className="link" onClick=${() => go("shelf")}>Open shelf</button>`}>
        <${Row} items=${reading} render=${(s) => html`<${Card} s=${s} sub=${`Chapter ${shelf.entries[s.id].ch}${s.ch ? " of " + s.ch : ""}`} />`} />
      <//>`}
      <${Section} title="Three traditions, one shelf" desc="Pick where a story comes from. Each origin has its own colour across MangaForEver.">
        <${Origins} />
      <//>
      <${TopTen} />
      ${recs.length > 0 && html`<${Section} title="Picked for you" desc="Based on the genres and themes on your shelf." action=${html`<button className="link" onClick=${() => go("shelf")}>Why these?</button>`}>
        <${Row} items=${recs} render=${(r) => html`<${Card} s=${r.s} sub=${r.because ? "Because of " + r.because.title : r.why.join(" · ")} />`} />
      <//>`}
      ${TYPE_KEYS.map((t) => html`<${Section} key=${t} title=${`Highest-rated ${TYPES[t].label.toLowerCase()}`} desc=${`AniList average score, among ${TYPES[t].label.toLowerCase()} with more than 8,000 AniList members.`}
        action=${html`<button className="link" onClick=${() => go("explore", { preset: { types: [t], sort: "score" } })}>See all</button>`}>
        <${Row} items=${topRated(t)} />
      <//>`)}
      <${Section} title="Browse by genre" desc="Counts are series in this catalog.">
        <${GenreCloud} />
      <//>
      ${fall && html`<${Section} title=${fall.title} desc=${fall.description} action=${html`<button className="link" onClick=${() => go("seasonal")}>All collections</button>`}>
        <${Row} items=${fall.items.map((it) => ({ ...it, s: BY_ID.get(it.id) })).filter((x) => x.s)} render=${(x) => html`<${Card} s=${x.s} sub=${x.note} />`} />
        <${Note}>Editor-curated for ${fall.season.toLowerCase()} ${fall.year}. Not an official release schedule.<//>
      <//>`}
      <${Section} title="From readers" desc="The latest reviews written on MangaForEver.">
        <${LatestReviews} />
      <//>
    </div>
  </main>`;
}

/* ───────── Explore ───────── */
const SORTS = [
  ["popularity", "Most popular"],
  ["score", "Highest AniList score"],
  ["readers", "Reader rating"],
  ["newest", "Newest first"],
  ["oldest", "Oldest first"],
  ["chapters", "Most chapters"],
  ["title", "Title A–Z"],
];
const DEFAULT_EX = { q: "", types: [], genres: [], genreMode: "all", status: [], demo: [], yearFrom: "", yearTo: "", minScore: "", sort: "popularity" };

function applyFilters(ex, agg, skip) {
  let list = ex.q ? searchSeries(ex.q) : SERIES;
  return list.filter((s) =>
    (!ex.types.length || ex.types.includes(s.type)) &&
    (skip === "genres" || !ex.genres.length || (ex.genreMode === "all" ? ex.genres.every((g) => s.genres.includes(g)) : ex.genres.some((g) => s.genres.includes(g)))) &&
    (!ex.status.length || ex.status.includes(s.status)) &&
    (!ex.demo.length || ex.demo.includes(s.demo)) &&
    (!ex.yearFrom || (s.year && s.year >= +ex.yearFrom)) &&
    (!ex.yearTo || (s.year && s.year <= +ex.yearTo)) &&
    (!ex.minScore || (s.score != null && s.score >= +ex.minScore)));
}
function sortList(list, sort, agg, hasQuery) {
  const avg = (s) => { const r = agg.rating[s.id]; return r ? r.sum / r.n : -1; };
  const by = {
    popularity: (a, b) => (b.pop || 0) - (a.pop || 0),
    score: (a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.pop || 0) - (a.pop || 0),
    readers: (a, b) => avg(b) - avg(a) || (b.pop || 0) - (a.pop || 0),
    newest: (a, b) => (b.start || String(b.year || 0)).localeCompare(a.start || String(a.year || 0)),
    oldest: (a, b) => (a.start || "9999").localeCompare(b.start || "9999"),
    chapters: (a, b) => (b.ch ?? -1) - (a.ch ?? -1),
    title: (a, b) => a.title.localeCompare(b.title),
  }[sort];
  if (hasQuery && sort === "popularity") return list; // keep search relevance order
  return [...list].sort(by);
}

function Toggles({ values, options, onChange, colorOf }) {
  return html`<div className="fchips">${options.map(([v, l, n]) => html`<button key=${v} type="button" className="chip" aria-pressed=${values.includes(v)} style=${colorOf ? { "--c": colorOf(v) } : undefined}
    onClick=${() => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])}>${colorOf && html`<span className="dot"></span>`}${l}${n != null && html`<span className="n">${n}</span>`}</button>`)}</div>`;
}

function Explore() {
  const { ex, setEx, agg } = useApp();
  const [shown, setShown] = useState(36);
  const [open, setOpen] = useState(false);
  const set = (patch) => { setEx((e) => ({ ...e, ...patch })); setShown(36); };
  const results = useMemo(() => sortList(applyFilters(ex, agg), ex.sort, agg, !!ex.q), [ex, agg]);
  const genreCounts = useMemo(() => {
    const c = {};
    for (const s of applyFilters(ex, agg, "genres")) for (const g of s.genres) c[g] = (c[g] || 0) + 1;
    return c;
  }, [ex, agg]);
  const fuzzy = useMemo(() => (ex.q && !results.length ? similarTitles(ex.q, 6) : []), [ex.q, results.length]);
  const years = useMemo(() => { const y = []; for (let v = YEAR_MAX; v >= YEAR_MIN; v--) y.push(v); return y; }, []);
  const active = [
    ex.q && ["q", `“${ex.q}”`, () => set({ q: "" })],
    ...ex.types.map((t) => ["t" + t, TYPES[t].label, () => set({ types: ex.types.filter((x) => x !== t) })]),
    ...ex.genres.map((g) => ["g" + g, g, () => set({ genres: ex.genres.filter((x) => x !== g) })]),
    ...ex.status.map((v) => ["s" + v, STATUS[v], () => set({ status: ex.status.filter((x) => x !== v) })]),
    ...ex.demo.map((v) => ["d" + v, DEMO[v], () => set({ demo: ex.demo.filter((x) => x !== v) })]),
    ex.yearFrom && ["yf", `From ${ex.yearFrom}`, () => set({ yearFrom: "" })],
    ex.yearTo && ["yt", `Until ${ex.yearTo}`, () => set({ yearTo: "" })],
    ex.minScore && ["ms", `AniList ${ex.minScore}+`, () => set({ minScore: "" })],
  ].filter(Boolean);
  return html`<main>
    <div className="wrap page-head"><div className="aurora" aria-hidden="true"></div>
      <h1>Explore</h1>
      <p>Every manga, manhwa and manhua in the MangaForEver catalog. Filter by origin, genre, status and era, or search titles in English, romaji or the original script.</p>
    </div>
    <div className="wrap explore">
      <div>
        <button type="button" className="btn btn-sm filter-toggle" aria-expanded=${open} aria-controls="filters" onClick=${() => setOpen((o) => !o)}><${Icon} name="filter" size=${15} />${open ? "Hide filters" : "Show filters"}${active.length ? ` (${active.length})` : ""}</button>
        <aside className="filters" id="filters" data-open=${open} aria-label="Filters">
          <div className="fgroup" style=${{ paddingTop: 0 }}>
            <label className="field" htmlFor="ex-q">Search
              <input id="ex-q" className="input" type="search" value=${ex.q} placeholder="Title, creator, 葬送…" onChange=${(e) => set({ q: e.target.value })} />
            </label>
          </div>
          <div className="fgroup"><h3>Origin</h3>
            <${Toggles} values=${ex.types} onChange=${(types) => set({ types })} options=${TYPE_KEYS.map((t) => [t, TYPES[t].label])} colorOf=${(t) => `var(--${t.toLowerCase()})`} />
          </div>
          <div className="fgroup"><h3>Genres
            <span className="seg" role="group" aria-label="Genre matching">
              <button type="button" aria-pressed=${ex.genreMode === "all"} onClick=${() => set({ genreMode: "all" })}>Match all</button>
              <button type="button" aria-pressed=${ex.genreMode === "any"} onClick=${() => set({ genreMode: "any" })}>Match any</button>
            </span></h3>
            <${Toggles} values=${ex.genres} onChange=${(genres) => set({ genres })} options=${ALL_GENRES.map((g) => [g, g, genreCounts[g] || 0])} colorOf=${genreColor} />
          </div>
          <div className="fgroup"><h3>Status</h3>
            <${Toggles} values=${ex.status} onChange=${(status) => set({ status })} options=${["ONGOING", "COMPLETED", "CANCELLED", "HIATUS"].map((v) => [v, STATUS[v]])} />
          </div>
          <div className="fgroup"><h3>Demographic</h3>
            <${Toggles} values=${ex.demo} onChange=${(demo) => set({ demo })} options=${Object.entries(DEMO)} />
          </div>
          <div className="fgroup two">
            <label className="field" htmlFor="ex-yf">Year from
              <select id="ex-yf" className="select" value=${ex.yearFrom} onChange=${(e) => set({ yearFrom: e.target.value })}><option value="">Any</option>${years.map((y) => html`<option key=${y} value=${y}>${y}</option>`)}</select></label>
            <label className="field" htmlFor="ex-yt">Year to
              <select id="ex-yt" className="select" value=${ex.yearTo} onChange=${(e) => set({ yearTo: e.target.value })}><option value="">Any</option>${years.map((y) => html`<option key=${y} value=${y}>${y}</option>`)}</select></label>
          </div>
          <div className="fgroup" style=${{ borderBottom: 0 }}>
            <label className="field" htmlFor="ex-ms">Minimum AniList score
              <select id="ex-ms" className="select" value=${ex.minScore} onChange=${(e) => set({ minScore: e.target.value })}>
                <option value="">Any</option>${["6", "7", "7.5", "8", "8.5"].map((v) => html`<option key=${v} value=${v}>${v} and up</option>`)}
              </select></label>
            ${active.length > 0 && html`<button type="button" className="link" style=${{ marginTop: "14px" }} onClick=${() => set({ ...DEFAULT_EX, sort: ex.sort })}>Clear all filters</button>`}
          </div>
        </aside>
      </div>
      <div style=${{ minWidth: 0 }}>
        <div className="results-bar">
          <span className="count tnum" aria-live="polite">${results.length} series</span>
          <label className="sort" htmlFor="ex-sort">Sort by
            <select id="ex-sort" className="select" value=${ex.sort} onChange=${(e) => set({ sort: e.target.value })}>${SORTS.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}</select>
          </label>
        </div>
        ${active.length > 0 && html`<div className="active-filters">${active.map(([k, l, off]) => html`<button key=${k} type="button" className="chip" onClick=${off} aria-label=${"Remove filter " + l}>${l}<${Icon} name="x" size=${13} /></button>`)}</div>`}
        ${results.length
          ? html`<div className="grid">${results.slice(0, shown).map((s) => html`<${Card} key=${s.id} s=${s} />`)}</div>
            ${shown < results.length && html`<div className="more"><button type="button" className="btn" onClick=${() => setShown((n) => n + 36)}>Show more <span className="muted tnum">(${results.length - shown} left)</span></button></div>`}`
          : html`<div className="empty"><strong>Nothing matches those filters</strong>Try removing a filter${ex.genreMode === "all" && ex.genres.length > 1 ? ", or switch genres to Match any" : ""}.
              ${fuzzy.length > 0 && html`<div style=${{ marginTop: "18px" }}><p style=${{ marginBottom: "12px" }}>Titles close to “${ex.q}”:</p>
                <div className="fchips" style=${{ justifyContent: "center" }}>${fuzzy.map((s) => html`<${SeriesLink} key=${s.id} s=${s} className="chip">${s.title}<//>`)}</div></div>`}
            </div>`}
      </div>
    </div>
  </main>`;
}
