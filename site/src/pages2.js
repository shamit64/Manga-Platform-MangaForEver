/* ───────── Series page ───────── */
function ProgressPanel({ s }) {
  const { shelf, setProgress } = useApp();
  const e = shelf.entries[s.id];
  const [val, setVal] = useState(e ? String(e.ch) : "0");
  useEffect(() => { setVal(e ? String(e.ch) : "0"); }, [e?.ch, s.id]);
  if (!e) {
    return html`<div className="panel"><h3>Track your progress</h3>
      <p className="muted">Add ${s.title} to your shelf to log chapters as you read.</p>
      <div style=${{ marginTop: "14px" }}><${ShelfButton} s=${s} compact=${true} /></div></div>`;
  }
  const max = s.ch;
  const commit = (n) => setProgress(s.id, n);
  return html`<div className="panel"><h3>Your progress</h3>
    <div className="stepper">
      <button type="button" className="icon-btn" aria-label="One chapter back" onClick=${() => commit(e.ch - 1)} disabled=${e.ch <= 0}><${Icon} name="minus" /></button>
      <label className="sr" htmlFor="ch-input">Chapter</label>
      <input id="ch-input" className="input tnum" inputMode="numeric" value=${val} onChange=${(ev) => setVal(ev.target.value.replace(/\D/g, ""))}
        onBlur=${() => commit(Number(val) || 0)} onKeyDown=${(ev) => ev.key === "Enter" && commit(Number(val) || 0)} />
      <button type="button" className="icon-btn" aria-label="One chapter forward" onClick=${() => commit(e.ch + 1)} disabled=${max != null && e.ch >= max}><${Icon} name="plus" /></button>
      <span className="muted tnum">${max != null ? `of ${max}` : "chapters read"}</span>
    </div>
    ${max != null && html`<div className="progress" role="progressbar" aria-valuemin="0" aria-valuemax=${max} aria-valuenow=${e.ch} aria-label="Reading progress"><i style=${{ width: Math.min(100, (e.ch / max) * 100) + "%" }}></i></div>`}
    <p className="note">${max == null ? "AniList lists no final chapter count, so there's no total to measure against." : e.ch >= max ? "You've reached the last listed chapter." : `${max - e.ch} chapters to go.`}</p>
  </div>`;
}

function RatingPanel({ s }) {
  const { agg, ratings, rate, rt, commWritable } = useApp();
  const r = agg.rating[s.id];
  const mine = ratings[s.id] || null;
  const maxBucket = r ? Math.max(...r.dist) : 0;
  return html`<div className="panel" id="rate"><h3>Ratings</h3>
    <div style=${{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      <div><div className="label">Readers here</div>
        <div className="big-score" style=${{ marginTop: "8px" }}>${r ? html`<b className="tnum">${fmtScore(r.sum / r.n)}</b><span className="muted">/ 10</span>` : html`<b className="muted" style=${{ fontSize: "22px", lineHeight: "40px" }}>None yet</b>`}</div>
        <div className="note" style=${{ marginTop: "4px" }}>${r ? plural(r.n, "rating") : "No ratings yet"}</div></div>
      <div><div className="label">AniList</div>
        <div className="big-score" style=${{ marginTop: "8px" }}><b className="tnum">${fmtScore(s.score)}</b><span className="muted">/ 10</span></div>
        <div className="note" style=${{ marginTop: "4px" }}>Average member score</div></div>
    </div>
    ${r && r.n > 1 && html`<div className="dist" aria-label="Reader rating distribution">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => html`<div key=${n}><span>${n}</span><span className="bar" style=${{ maxWidth: "none" }}><i style=${{ width: (r.dist[n - 1] / maxBucket) * 100 + "%" }}></i></span><span>${r.dist[n - 1]}</span></div>`)}</div>`}
    <div style=${{ marginTop: "18px" }}>
      <div className="label">Your rating${mine ? `: ${mine}/10` : ""}</div>
      <div className="rate" role="group" aria-label="Rate from 1 to 10">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => html`<button key=${n} type="button" data-on=${mine != null && n <= mine} aria-pressed=${mine === n} aria-label=${`Rate ${n} out of 10`}
          disabled=${rt.mode === "cloud" && !commWritable} onClick=${() => rate(s.id, mine === n ? null : n)}>${n}</button>`)}
      </div>
      <p className="note">${rt.mode === "cloud" ? (commWritable ? "Your rating is public and counts toward the reader average. Tap it again to clear it." : "Your access to this page is view-only, so you can't rate here.") : "Saved in this browser only. Open this page signed in to claude.ai to share ratings with other readers."}</p>
    </div>
  </div>`;
}

function ReviewForm({ s, initial, onDone }) {
  const { saveReview } = useApp();
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");
  const [spoiler, setSpoiler] = useState(!!initial?.spoiler);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (title.trim().length < 3) return setErr("Give your review a title of at least 3 characters.");
    if (body.trim().length < 30) return setErr(`Write at least 30 characters (${body.trim().length} so far).`);
    setErr("");
    setBusy(true);
    const ok = await saveReview(s.id, { title: title.trim().slice(0, 120), body: body.trim().slice(0, 5000), spoiler });
    setBusy(false);
    if (ok) onDone();
  };
  return html`<form className="form panel" onSubmit=${submit} noValidate>
    <h3 style=${{ marginBottom: 0 }}>${initial ? "Edit your review" : `Review ${s.title}`}</h3>
    <label className="field" htmlFor="rv-title">Title
      <input id="rv-title" className="input" maxLength="120" value=${title} onChange=${(e) => setTitle(e.target.value)} placeholder="One line that sums it up" /></label>
    <label className="field" htmlFor="rv-body">Review
      <textarea id="rv-body" maxLength="5000" value=${body} onChange=${(e) => setBody(e.target.value)} placeholder="What works, what doesn't, and who it's for."></textarea></label>
    <label className="check" htmlFor="rv-spoiler"><input id="rv-spoiler" type="checkbox" checked=${spoiler} onChange=${(e) => setSpoiler(e.target.checked)} /> Contains spoilers (readers must tap to reveal)</label>
    ${err && html`<p className="err" role="alert">${err}</p>`}
    <div className="actions" style=${{ marginTop: 0 }}>
      <button type="submit" className="btn btn-brand" disabled=${busy}>${busy ? "Publishing…" : initial ? "Save changes" : "Publish review"}</button>
      <button type="button" className="btn" onClick=${onDone}>Cancel</button>
    </div>
    <p className="note" style=${{ marginTop: 0 }}>Reviews are public to everyone who can open this page. Your rating, if you gave one, shows beside it.</p>
  </form>`;
}

function ReviewItem({ r, profile, s }) {
  const { rt, toggleHelpful, deleteReview, removeReview, mineHelpful, commWritable } = useApp();
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const own = r.uid === rt.uid;
  const name = (profile && profile.name) || (own ? "You" : "A reader");
  const voted = !!mineHelpful[r.uid + "|" + s.id];
  return html`<article className="review">
    <div className="review-head">
      ${profile && html`<img className="avatar" src=${profile.avatarUrl} alt="" />`}
      <div style=${{ minWidth: 0 }}>
        <div style=${{ fontWeight: 650 }}>${name}${own && html` <span className="pill" style=${{ marginLeft: "6px" }}>You</span>`}</div>
        <div className="note" style=${{ marginTop: 0 }}>${ago(r.at)}${r.edited ? " · edited" : ""}${r.score ? ` · rated ${r.score}/10` : ""}</div>
      </div>
    </div>
    <h4>${r.title}</h4>
    ${r.spoiler && !show && html`<button type="button" className="btn btn-sm" style=${{ marginBottom: "8px" }} onClick=${() => setShow(true)}>Contains spoilers · Show</button>`}
    <p className=${"review-body" + (r.spoiler && !show ? " spoiler" : "")} aria-hidden=${r.spoiler && !show}>${r.body}</p>
    <div className="review-foot">
      <span className="tnum">${r.helpful ? plural(r.helpful, "reader") + " found this helpful" : ""}</span>
      ${!own && rt.mode === "cloud" && commWritable && html`<button type="button" className="btn btn-sm" aria-pressed=${voted} onClick=${() => toggleHelpful(r.uid, s.id)}><${Icon} name="thumb" size=${14} />Helpful</button>`}
      ${(own || rt.isOwner) && !confirm && html`<button type="button" className="btn btn-sm" onClick=${() => setConfirm(true)}><${Icon} name="trash" size=${14} />${own ? "Delete" : "Remove"}</button>`}
      ${confirm && html`<span style=${{ display: "inline-flex", gap: "8px", alignItems: "center" }}>${own ? "Delete your review?" : "Remove this review for everyone?"}
        <button type="button" className="btn btn-sm" style=${{ borderColor: "var(--coral)", color: "var(--coral)" }} onClick=${() => (own ? deleteReview(s.id) : removeReview(r.uid, s.id))}>${own ? "Delete" : "Remove"}</button>
        <button type="button" className="btn btn-sm" onClick=${() => setConfirm(false)}>Keep</button></span>`}
    </div>
  </article>`;
}

function Reviews({ s }) {
  const { agg, rt, commWritable } = useApp();
  const list = agg.reviews.filter((r) => r.sid === s.id).sort((a, b) => b.helpful - a.helpful || b.at - a.at);
  const profiles = useProfiles(list.map((r) => r.uid));
  const mine = list.find((r) => r.uid === rt.uid);
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [s.id]);
  let action = null;
  if (rt.mode === "cloud" && commWritable && !editing) {
    action = html`<button type="button" className=${"btn btn-sm" + (mine ? "" : " btn-brand")} onClick=${() => setEditing(true)}><${Icon} name=${mine ? "edit" : "plus"} size=${15} />${mine ? "Edit your review" : "Write a review"}</button>`;
  }
  return html`<${Section} id="reviews" title=${`Reader reviews${list.length ? ` (${list.length})` : ""}`} desc="Written by people using MangaVerse. Most helpful first." action=${action}>
    ${editing && html`<${ReviewForm} s=${s} initial=${mine} onDone=${() => setEditing(false)} />`}
    ${list.length
      ? html`<div>${list.map((r) => html`<${ReviewItem} key=${r.uid} r=${r} s=${s} profile=${profiles[r.uid]} />`)}</div>`
      : !editing && html`<div className="empty"><strong>No reviews yet</strong>${rt.mode === "cloud"
          ? commWritable ? "Be the first to say what this series does well, or doesn't." : "Your access to this page is view-only, so you can read reviews but not write them."
          : "Reviews are shared through claude.ai. Open this page while signed in to read and write them."}</div>`}
  <//>`;
}

function SeriesPage({ id }) {
  const { go, visit, back } = useApp();
  const s = BY_ID.get(id);
  useEffect(() => { if (s) visit(s.id); }, [id]);
  const similar = useMemo(() => (s ? similarTo(s, 12) : []), [id]);
  if (!s) return html`<main className="wrap"><div className="empty" style=${{ marginTop: "40px" }}><strong>Series not found</strong><button className="link" onClick=${() => go("explore")}>Browse the catalog</button></div></main>`;
  const url = anilistUrl(s);
  const alt = [s.native, s.romaji].filter((x, i, a) => x && x !== s.title && a.indexOf(x) === i);
  return html`<main style=${{ "--acc": s.art.accent }}>
    <div className="band">
      <div className="band-bg" style=${{ background: s.bg }} aria-hidden="true"></div>
      <div className="wrap">
        <div className="crumbs">
          <button type="button" onClick=${back}><${Icon} name="left" size=${14} /> Back</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick=${() => go("explore", { preset: { types: [s.type] } })}>${TYPES[s.type].label}</button>
        </div>
        <div className="series-top">
          <${Cover} s=${s} />
          <div style=${{ minWidth: 0 }}>
            <div className="hero-meta" style=${{ marginTop: 0 }}>
              <${TypeTag} type=${s.type} />
              <span className=${"pill" + (s.status === "ONGOING" ? " ongoing" : "")}>${STATUS[s.status]}</span>
              ${s.curated && html`<span className="pill" title="This entry has a summary written by MangaVerse editors">Editor summary</span>`}
            </div>
            <h1>${s.title}</h1>
            ${alt.length > 0 && html`<p className="alt">${alt.map((a, i) => html`<span key=${a} className=${CJK.test(a) ? "native" : ""} lang=${CJK.test(a) ? TYPES[s.type].lang : undefined}>${i ? " · " : ""}${a}</span>`)}</p>`}
            <div className="hero-genres">${s.genres.map((g) => html`<${GenreChip} key=${g} g=${g} onClick=${() => go("explore", { preset: { genres: [g] } })} />`)}</div>
            <div className="actions">
              <${ShelfButton} s=${s} />
              <${FavButton} s=${s} />
              <a className="btn" href="#rate" onClick=${(e) => { e.preventDefault(); document.getElementById("rate")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><${Icon} name="star" size=${16} />Rate</a>
              ${url && html`<a className="btn" href=${url} target="_blank" rel="noopener">AniList<${Icon} name="out" size=${15} /></a>`}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="wrap">
      <dl className="facts">
        <div><dt>Story</dt><dd>${s.authors.join(", ") || "Not listed"}</dd></div>
        <div><dt>Art</dt><dd>${s.artists.join(", ") || "Not listed"}</dd></div>
        <div><dt>Origin</dt><dd>${TYPES[s.type].label} · ${TYPES[s.type].origin}</dd></div>
        <div><dt>Demographic</dt><dd>${s.demo ? DEMO[s.demo] : "Not listed"}</dd></div>
        <div><dt>Published</dt><dd className="tnum">${published(s)}</dd></div>
        <div><dt>Length</dt><dd className="tnum">${chapterLine(s)}</dd></div>
        <div><dt>AniList score</dt><dd className="tnum">${s.score != null ? `${fmtScore(s.score)} / 10` : "Not enough scores"}</dd></div>
        <div><dt>Popularity</dt><dd className="tnum">${s.popRank ? `#${s.popRank} all-time on AniList` : `#${s.catRank} in this catalog`} · ${fmtK(s.pop)} members</dd></div>
      </dl>
      <p className="src-line"><span>Facts from AniList · synced ${fmtDate(SYNCED)}</span>${url && html`<a href=${url} target="_blank" rel="noopener">See official cover art and links on AniList ↗</a>`}<span>MangaVerse hosts no chapters.</span></p>

      <div className="series-body" style=${{ marginTop: "30px" }}>
        <div style=${{ minWidth: 0 }}>
          <div className="panel">
            <div className="label" style=${{ marginBottom: "10px" }}>${s.summary ? "MangaVerse summary" : "Summary"}</div>
            ${s.summary
              ? html`<p className="prose">${s.summary}</p>`
              : html`<p className="prose muted">We haven't written our own summary for this one yet.${url && html` The publisher's synopsis is on <a href=${url} target="_blank" rel="noopener" style=${{ color: "var(--violet)" }}>its AniList page</a>.`}</p>`}
            ${s.tags.length > 0 && html`<div style=${{ marginTop: "18px" }}><div className="label" style=${{ marginBottom: "10px" }}>Themes</div><div className="tags">${s.tags.map((t) => html`<span key=${t} className="tag">${t}</span>`)}</div></div>`}
          </div>
          <${Reviews} s=${s} />
        </div>
        <div style=${{ minWidth: 0 }}>
          <${ProgressPanel} s=${s} />
          <${RatingPanel} s=${s} />
        </div>
      </div>

      <${Section} title="If you like this" desc="Matched on shared genres and themes, with a nudge toward the same origin.">
        <${Row} items=${similar} render=${(x) => html`<${Card} s=${x.s} sub=${"Shares " + x.why.join(" · ")} />`} />
      <//>
    </div>
  </main>`;
}

/* ───────── Rankings ───────── */
function Rankings() {
  const { agg } = useApp();
  const [kind, setKind] = useState("popular");
  const [type, setType] = useState("ALL");
  const [n, setN] = useState(50);
  const pool = SERIES.filter((s) => type === "ALL" || s.type === type);
  let list, val, label, max;
  if (kind === "popular") {
    list = [...pool].sort((a, b) => (b.pop || 0) - (a.pop || 0));
    max = list[0]?.pop || 1;
    val = (s) => [fmtK(s.pop) + " members", (s.pop || 0) / max];
    label = "AniList members tracking this series";
  } else if (kind === "score") {
    list = pool.filter((s) => s.score != null && (s.pop || 0) > 5000).sort((a, b) => b.score - a.score || b.pop - a.pop);
    val = (s) => [fmtScore(s.score) + " / 10", (s.score - 5) / 5];
    label = "AniList average score";
  } else {
    list = pool.filter((s) => agg.rating[s.id]).sort((a, b) => {
      const ra = agg.rating[a.id], rb = agg.rating[b.id];
      return rb.sum / rb.n - ra.sum / ra.n || rb.n - ra.n;
    });
    val = (s) => { const r = agg.rating[s.id]; return [`${fmtScore(r.sum / r.n)} · ${plural(r.n, "rating")}`, r.sum / r.n / 10]; };
    label = "Average rating from MangaVerse readers";
  }
  const desc = {
    popular: "How many AniList members track each series. The broadest measure of reach.",
    score: "AniList's average member score, for series with more than 5,000 members so a handful of votes can't top the chart.",
    readers: "Average ratings from people using this MangaVerse page. Rate any series to add yours.",
  }[kind];
  return html`<main>
    <div className="wrap page-head"><div className="aurora" aria-hidden="true"></div>
      <h1>Rankings</h1><p>${desc}</p>
    </div>
    <div className="wrap">
      <div style=${{ display: "flex", flexWrap: "wrap", gap: "12px 20px", justifyContent: "space-between", marginBottom: "22px" }}>
        <${Tabs} label="Ranking" value=${kind} onChange=${(k) => { setKind(k); setN(50); }} options=${[["popular", "Most popular"], ["score", "Highest rated"], ["readers", "Reader favorites"]]} />
        <${Tabs} label="Origin" value=${type} onChange=${(t) => { setType(t); setN(50); }} options=${[["ALL", "All origins"], ...TYPE_KEYS.map((k) => [k, TYPES[k].label])]} />
      </div>
      ${list.length
        ? html`<ol className="rank-list">${list.slice(0, n).map((s, i) => { const [v, ratio] = val(s); return html`<${RankItem} key=${s.id} s=${s} rank=${i + 1} value=${v} valueLabel=${label} ratio=${ratio} />`; })}</ol>
          ${n < list.length && html`<div className="more"><button type="button" className="btn" onClick=${() => setN((x) => x + 50)}>Show the next ${Math.min(50, list.length - n)}</button></div>`}`
        : html`<div className="empty"><strong>No reader ratings yet</strong>Open any series and rate it from 1 to 10. Rankings appear here as soon as readers rate.</div>`}
      <${Note}>${kind === "readers" ? "Reader ratings come only from people using this page; nothing is imported or estimated." : `Figures from AniList, synced ${fmtDate(SYNCED)}. They are AniList's numbers, not sales charts.`}<//>
    </div>
  </main>`;
}

/* ───────── Seasonal ───────── */
const SEASON_COLOR = { WINTER: "var(--cyan)", SPRING: "var(--green)", SUMMER: "var(--amber)", FALL: "var(--coral)" };
function Seasonal() {
  const order = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
  const cols = [...DATA.seasonal].sort((a, b) => b.year - a.year || order[b.season] - order[a.season]);
  return html`<main>
    <div className="wrap page-head"><div className="aurora" aria-hidden="true"></div>
      <h1>Seasonal collections</h1>
      <p>Reading lists our editors put together for each season, with a note on every pick. They're recommendations, not a release calendar.</p>
    </div>
    <div className="wrap">
      ${cols.map((c) => html`<section key=${c.title} className="collection" style=${{ "--c": SEASON_COLOR[c.season] }}>
        <span className="season"><${Icon} name="clock" size=${13} />${c.season.toLowerCase()} ${c.year}</span>
        <h2>${c.title}</h2>
        <p>${c.description}</p>
        <${Row} items=${c.items.map((it) => ({ ...it, s: BY_ID.get(it.id) })).filter((x) => x.s)} render=${(x) => html`<${Card} s=${x.s} sub=${x.note} />`} />
      </section>`)}
    </div>
  </main>`;
}

/* ───────── My shelf ───────── */
function LibRow({ s, e }) {
  const { setStatus, setProgress, removeEntry, toggleFav } = useApp();
  return html`<div className="lib-row">
    <${SeriesLink} s=${s}><${Cover} s=${s} size="xs" /><//>
    <div style=${{ minWidth: 0 }}>
      <${SeriesLink} s=${s} className="lib-title">${s.title}<//>
      <div className="card-meta" style=${{ marginTop: "4px" }}><${TypeTag} type=${s.type} /><span>Series ${STATUS[s.status].toLowerCase()}</span>${e.fav && html`<span style=${{ color: "var(--pink)" }}>♥ Favorite</span>`}</div>
      <div className="bar-line"><span className="bar" style=${{ maxWidth: "220px" }}><i style=${{ width: s.ch ? Math.min(100, (e.ch / s.ch) * 100) + "%" : e.ch ? "100%" : "0%", opacity: s.ch ? 1 : 0.35 }}></i></span>
        <span className="tnum">Ch. ${e.ch}${s.ch ? ` / ${s.ch}` : ""}</span></div>
    </div>
    <div className="lib-ctrl">
      <button type="button" className="btn btn-sm" aria-label=${"Log one more chapter of " + s.title} onClick=${() => setProgress(s.id, e.ch + 1)} disabled=${s.ch != null && e.ch >= s.ch}><${Icon} name="plus" size=${14} />1 ch.</button>
      <label className="sr" htmlFor=${"st-" + s.id}>Status for ${s.title}</label>
      <select id=${"st-" + s.id} className="select" style=${{ width: "auto", height: "34px" }} value=${e.status} onChange=${(ev) => setStatus(s.id, ev.target.value)}>
        ${SHELF.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
      </select>
      <button type="button" className="icon-btn" style=${{ width: "34px", height: "34px" }} aria-pressed=${e.fav} aria-label=${(e.fav ? "Unfavorite " : "Favorite ") + s.title} onClick=${() => toggleFav(s.id)}><${Icon} name="heart" size=${15} fill=${e.fav} /></button>
      <button type="button" className="icon-btn" style=${{ width: "34px", height: "34px" }} aria-label=${"Remove " + s.title + " from shelf"} onClick=${() => removeEntry(s.id)}><${Icon} name="trash" size=${15} /></button>
    </div>
  </div>`;
}

function Shelf() {
  const { shelf, ratings, rt, go, clearHistory, shelfLocalOnly } = useApp();
  const [tab, setTab] = useState("ALL");
  const entries = Object.entries(shelf.entries).map(([id, e]) => ({ s: BY_ID.get(id), e })).filter((x) => x.s).sort((a, b) => b.e.at - a.e.at);
  const recs = useMemo(() => recommend(shelf.entries, ratings, 12), [shelf.entries, ratings]);
  const counts = Object.fromEntries(SHELF.map(([v]) => [v, entries.filter((x) => x.e.status === v).length]));
  const favs = entries.filter((x) => x.e.fav);
  const chapters = entries.reduce((n, x) => n + x.e.ch, 0);
  const taste = useMemo(() => {
    const c = {};
    for (const { s, e } of entries) if (e.status !== "DROPPED") for (const g of s.genres) c[g] = (c[g] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [shelf.entries]);
  const cloud = rt.mode === "cloud" && !shelfLocalOnly;
  const shown = tab === "ALL" ? entries : tab === "FAV" ? favs : entries.filter((x) => x.e.status === tab);
  const starters = [...DATA.featured.map((f) => BY_ID.get(f.id)), ...BY_POP.slice(0, 10)].filter((s, i, a) => s && a.indexOf(s) === i).slice(0, 12);
  return html`<main>
    <div className="wrap page-head"><div className="aurora" aria-hidden="true"></div>
      <div style=${{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", justifyContent: "space-between" }}>
        <h1>My shelf</h1>
        <span className=${"sync" + (cloud ? "" : " local")}><i></i>${cloud ? "Private to you · saved to your claude.ai account" : rt.ready ? "Saved in this browser only" : "Connecting…"}</span>
      </div>
      <p>Everything you're reading, planning, finished or dropped, with chapter progress. Only you can see your shelf.</p>
    </div>
    <div className="wrap">
      ${entries.length === 0
        ? html`<div className="empty"><strong>Your shelf is empty</strong>Use “Add to shelf” on any series to start tracking it. A few popular places to begin:</div>
            <div style=${{ marginTop: "22px" }}><${Row} items=${starters} /></div>`
        : html`
          <div className="statline">
            <div><b>${entries.length}</b><span>On your shelf</span></div>
            <div><b>${counts.READING}</b><span>Reading</span></div>
            <div><b>${counts.COMPLETED}</b><span>Completed</span></div>
            <div><b>${chapters.toLocaleString("en-US")}</b><span>Chapters logged</span></div>
            <div><b>${favs.length}</b><span>Favorites</span></div>
          </div>
          <div className="series-body" style=${{ marginTop: "28px" }}>
            <div style=${{ minWidth: 0 }}>
              <${Tabs} label="Shelf status" value=${tab} onChange=${setTab} options=${[["ALL", `All ${entries.length}`], ...SHELF.map(([v, l]) => [v, `${l} ${counts[v]}`]), ["FAV", `Favorites ${favs.length}`]]} />
              <div style=${{ marginTop: "18px" }}>
                ${shown.length ? shown.map(({ s, e }) => html`<${LibRow} key=${s.id} s=${s} e=${e} />`) : html`<div className="empty">Nothing here yet.</div>`}
              </div>
            </div>
            <div style=${{ minWidth: 0 }}>
              <div className="panel"><h3>Your taste</h3>
                ${taste.map(([g, n]) => html`<div key=${g} className="gbar" style=${{ "--c": genreColor(g) }}><span>${g}</span><span className="bar"><i style=${{ width: (n / taste[0][1]) * 100 + "%" }}></i></span><span className="tnum muted">${n}</span></div>`)}
                <p className="note">Genres across your shelf, excluding dropped series. Recommendations lean on these, your ratings and favorites.</p>
              </div>
              <div className="panel"><h3>Recently viewed</h3>
                ${shelf.history.length
                  ? html`<div style=${{ display: "grid", gap: "10px" }}>${shelf.history.slice(0, 6).map((h) => { const s = BY_ID.get(h.id); return html`<${SeriesLink} key=${h.id} s=${s} style=${{ display: "flex", gap: "10px", alignItems: "center", textDecoration: "none" }}>
                      <${Cover} s=${s} size="xs" style=${{ width: "34px", borderRadius: "5px" }} /><span style=${{ minWidth: 0 }}><span className="lib-title" style=${{ fontSize: "14px" }}>${s.title}</span><span className="note" style=${{ marginTop: 0 }}>${ago(h.at)}</span></span><//>`; })}</div>
                    <button type="button" className="link" style=${{ marginTop: "14px", fontSize: "13px" }} onClick=${clearHistory}>Clear history</button>`
                  : html`<p className="muted">Series you open show up here.</p>`}
              </div>
            </div>
          </div>
          ${recs.length > 0 && html`<${Section} title="For you" desc="Each pick says which series on your shelf it's matched to and what they share.">
            <${Row} items=${recs} render=${(r) => html`<${Card} s=${r.s} sub=${r.because ? `Like ${r.because.title}: ${r.why.join(", ")}` : r.why.join(" · ")} />`} />
          <//>`}`}
      ${!cloud && rt.ready && html`<${Note}>${rt.mode === "cloud" ? "Your access to this page can't save to your account, so your shelf is kept in this browser." : "Your shelf is kept in this browser. Open this page signed in to claude.ai to keep it with your account across devices."}<//>`}
    </div>
  </main>`;
}
