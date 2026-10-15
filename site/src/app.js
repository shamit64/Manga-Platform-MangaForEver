/* ───────── App: routing, shelf storage, shared community data ───────── */
const PAGES = ["explore", "rankings", "seasonal", "shelf"];
function parseHash() {
  let h = "";
  try { h = decodeURIComponent((location.hash || "").slice(1)); } catch { h = ""; }
  if (h.startsWith("series-") && BY_ID.has(h.slice(7))) return { page: "series", id: h.slice(7) };
  if (PAGES.includes(h)) return { page: h };
  return { page: "home" };
}
function cleanCommunity(uid, d) {
  const out = { uid, ratings: {}, reviews: {}, helpful: {} };
  if (!d || typeof d !== "object") return out;
  for (const [sid, n] of Object.entries(d.ratings || {})) if (BY_ID.has(sid) && Number.isInteger(n) && n >= 1 && n <= 10) out.ratings[sid] = n;
  for (const [sid, r] of Object.entries(d.reviews || {})) {
    if (!BY_ID.has(sid) || !r || typeof r.title !== "string" || typeof r.body !== "string") continue;
    out.reviews[sid] = { title: r.title.slice(0, 120), body: r.body.slice(0, 5000), spoiler: !!r.spoiler, at: Number(r.at) || 0, edited: !!r.edited };
  }
  for (const k of Object.keys(d.helpful || {})) if (typeof k === "string" && k.includes("|")) out.helpful[k] = true;
  return out;
}
const plain = (c) => ({ ratings: { ...c.ratings }, reviews: JSON.parse(JSON.stringify(c.reviews)), helpful: { ...c.helpful } });
function mergeShelf(remote, local) {
  const out = { entries: { ...remote.entries }, history: [], ratings: { ...local.ratings, ...remote.ratings } };
  for (const [id, e] of Object.entries(local.entries)) if (!out.entries[id] || out.entries[id].at < e.at) out.entries[id] = e;
  const seen = new Set();
  out.history = [...remote.history, ...local.history].sort((a, b) => b.at - a.at).filter((h) => !seen.has(h.id) && seen.add(h.id)).slice(0, 40);
  return out;
}

function App() {
  const [route, setRoute] = useState(parseHash);
  const [theme, setThemeState] = useState(readTheme);
  const [shelf, setShelf] = useState(() => cleanShelf(readLocal()));
  const [rt, setRt] = useState({ mode: "local", ready: false, db: null, user: null, uid: null, isOwner: false, canWrite: null });
  const [comm, setComm] = useState([]);
  const [commReadOnly, setCommReadOnly] = useState(false);
  const [shelfLocalOnly, setShelfLocalOnly] = useState(false);
  const [ex, setEx] = useState(DEFAULT_EX);
  const [toasts, setToasts] = useState([]);
  const rtRef = useRef(rt);
  rtRef.current = rt;
  const latest = useRef(shelf);
  const dirty = useRef(false);
  const timer = useRef(null);
  const chain = useRef(Promise.resolve());
  const commChain = useRef(Promise.resolve());
  const mineRef = useRef(null);
  const localOnlyRef = useRef(false);

  const toast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => { applyTheme(theme); }, [theme]);

  /* Routing: bare #tokens so links into the page work, and Back works inside it. */
  const go = useCallback((page, opts = {}) => {
    if (page === "explore" && opts.preset) setEx({ ...DEFAULT_EX, ...opts.preset });
    const next = page === "series" ? { page, id: opts.id } : { page };
    const token = page === "series" ? "series-" + opts.id : page === "home" ? "" : page;
    try {
      if (location.hash.slice(1) !== token) history.pushState(null, "", token ? "#" + token : location.pathname + location.search);
    } catch { /* history unavailable: state routing still works */ }
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  const back = useCallback(() => {
    if (history.length > 1) history.back();
    else go("explore");
  }, [go]);
  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("popstate", on);
    window.addEventListener("hashchange", on);
    return () => { window.removeEventListener("popstate", on); window.removeEventListener("hashchange", on); };
  }, []);
  useEffect(() => {
    const base = "MangaVerse";
    const s = route.page === "series" ? BY_ID.get(route.id) : null;
    document.title = s ? `${s.title} · ${base}` : route.page === "home" ? base : `${NAV.find((n) => n[0] === route.page)?.[1] || ""} · ${base}`;
  }, [route]);

  /* Shelf persistence: the viewer's private db subtree when available, otherwise this browser. */
  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    const v = latest.current;
    const r = rtRef.current;
    if (r.mode === "cloud" && !localOnlyRef.current) {
      chain.current = chain.current
        .then(() => r.db.doc(`data/users/${r.uid}/shelf`).set({ entries: v.entries, history: v.history, ratings: v.ratings, v: 1 }))
        .catch((err) => {
          if (err && err.code === "invalid_argument") {
            localOnlyRef.current = true;
            setShelfLocalOnly(true);
          } else if (err && err.code === "quota_exceeded") toast("Your shelf couldn't be saved: this page's storage is full.");
          writeLocal(latest.current);
        });
    } else writeLocal(v);
  }, [toast]);
  const updateShelf = useCallback((fn) => {
    setShelf((prev) => {
      const next = fn(prev);
      latest.current = next;
      return next;
    });
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }, [flush]);
  useEffect(() => {
    const away = () => { if (document.visibilityState === "hidden") { clearTimeout(timer.current); flush(); } };
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", away); window.removeEventListener("pagehide", flush); };
  }, [flush]);

  /* Runtime capabilities (claude.ai viewer). Everything works without them. */
  useEffect(() => {
    let live = true;
    (async () => {
      const c = window.claude;
      if (!c || typeof c.use !== "function") { setRt((r) => ({ ...r, ready: true })); return; }
      const [db, user] = await Promise.all([c.use("db").catch(() => null), c.use("user").catch(() => null)]);
      const uid = user ? await user.id() : null;
      const isOwner = user ? await user.isOwner() : false;
      const canWrite = user ? await user.can("data.write") : null;
      if (!live) return;
      if (db && uid) {
        try {
          const snap = await db.doc(`data/users/${uid}/shelf`).get();
          if (snap.exists) {
            const remote = cleanShelf(snap.data());
            setShelf((prev) => { const next = mergeShelf(remote, prev); latest.current = next; return next; });
          }
        } catch { /* fall back to what this browser has */ }
        setRt({ mode: "cloud", ready: true, db, user, uid, isOwner, canWrite });
      } else {
        setRt({ mode: "local", ready: true, db, user, uid, isOwner, canWrite });
      }
    })();
    return () => { live = false; };
  }, []);

  /* Shared ratings and reviews: one document per reader under community/<their id>. */
  useEffect(() => {
    if (!rt.db) return;
    let unsub = null;
    try {
      unsub = rt.db.collection("community").limit(1000).onSnapshot(
        (snap) => setComm(snap.docs.filter((d) => d.exists).map((d) => cleanCommunity(d.id, d.data()))),
        () => setComm((c) => c),
      );
    } catch { /* store unavailable for this view */ }
    return () => unsub && unsub();
  }, [rt.db]);

  const agg = useMemo(() => {
    const rating = {};
    const reviews = [];
    const helpful = {};
    for (const d of comm) for (const k of Object.keys(d.helpful)) if (!k.startsWith(d.uid + "|")) helpful[k] = (helpful[k] || 0) + 1;
    for (const d of comm) {
      for (const [sid, n] of Object.entries(d.ratings)) {
        const r = (rating[sid] ||= { sum: 0, n: 0, dist: Array(10).fill(0) });
        r.sum += n; r.n += 1; r.dist[n - 1] += 1;
      }
      for (const [sid, r] of Object.entries(d.reviews)) reviews.push({ ...r, uid: d.uid, sid, score: d.ratings[sid] || null, helpful: helpful[d.uid + "|" + sid] || 0 });
    }
    return { rating, reviews, mine: comm.find((d) => d.uid === rt.uid) || null };
  }, [comm, rt.uid]);
  useEffect(() => { mineRef.current = agg.mine ? plain(agg.mine) : mineRef.current; }, [agg.mine]);

  const commWritable = rt.mode === "cloud" && rt.canWrite !== false && !commReadOnly;
  const writeMine = useCallback((fn, okMsg) => {
    const r = rtRef.current;
    const next = fn(mineRef.current ? plain(mineRef.current) : { ratings: {}, reviews: {}, helpful: {} });
    mineRef.current = next;
    const p = commChain.current.then(() => r.db.doc("community/" + r.uid).set(next));
    commChain.current = p.catch(() => {});
    return p.then(() => { if (okMsg) toast(okMsg); return true; }).catch((err) => {
      if (err && err.code === "invalid_argument") { setCommReadOnly(true); toast("Your access to this page is view-only, so that wasn't saved."); }
      else if (err && err.code === "quota_exceeded") toast("That wasn't saved: this page's shared storage is full.");
      else toast("That didn't save. Check your connection and try again.");
      return false;
    });
  }, [toast]);

  const ratings = rt.mode === "cloud" && !commReadOnly ? agg.mine?.ratings || {} : shelf.ratings;

  const api = useMemo(() => ({
    route, go, back, theme, setTheme: setThemeState, rt, ex, setEx, toast, agg, ratings, commWritable, shelfLocalOnly,
    shelf,
    mineHelpful: agg.mine?.helpful || {},
    setStatus(id, status) {
      const s = BY_ID.get(id);
      updateShelf((p) => {
        const e = p.entries[id] || { ch: 0, fav: false };
        const ch = status === "COMPLETED" && s.ch ? s.ch : e.ch;
        return { ...p, entries: { ...p.entries, [id]: { ...e, status, ch, at: Date.now() } } };
      });
      toast(`${s.title}: ${SHELF_LABEL[status]}`);
    },
    setProgress(id, n) {
      const s = BY_ID.get(id);
      const ch = Math.max(0, Math.min(Number(n) || 0, s.ch ?? 100000));
      updateShelf((p) => {
        const e = p.entries[id] || { status: "READING", fav: false };
        const status = s.ch && ch >= s.ch && s.status !== "ONGOING" ? "COMPLETED" : e.status === "PLAN_TO_READ" && ch > 0 ? "READING" : e.status;
        return { ...p, entries: { ...p.entries, [id]: { ...e, status, ch, at: Date.now() } } };
      });
    },
    toggleFav(id) {
      const s = BY_ID.get(id);
      const on = !shelf.entries[id]?.fav;
      updateShelf((p) => {
        const e = p.entries[id] || { status: "PLAN_TO_READ", ch: 0, fav: false };
        return { ...p, entries: { ...p.entries, [id]: { ...e, fav: on, at: Date.now() } } };
      });
      toast(on ? `Added ${s.title} to favorites` : `Removed ${s.title} from favorites`);
    },
    removeEntry(id) {
      updateShelf((p) => { const entries = { ...p.entries }; delete entries[id]; return { ...p, entries }; });
      toast(`Removed ${BY_ID.get(id).title} from your shelf`);
    },
    visit(id) {
      updateShelf((p) => ({ ...p, history: [{ id, at: Date.now() }, ...p.history.filter((h) => h.id !== id)].slice(0, 40) }));
    },
    clearHistory() { updateShelf((p) => ({ ...p, history: [] })); toast("Viewing history cleared"); },
    rate(id, n) {
      if (rtRef.current.mode === "cloud" && !commReadOnly) {
        writeMine((m) => { if (n == null) delete m.ratings[id]; else m.ratings[id] = n; return m; }, n == null ? "Rating cleared" : `Rated ${n}/10`);
      } else {
        updateShelf((p) => { const ratings = { ...p.ratings }; if (n == null) delete ratings[id]; else ratings[id] = n; return { ...p, ratings }; });
        toast(n == null ? "Rating cleared" : `Rated ${n}/10 (saved in this browser)`);
      }
    },
    saveReview(id, review) {
      return writeMine((m) => {
        const prev = m.reviews[id];
        m.reviews[id] = { ...review, at: prev ? prev.at : Date.now(), edited: !!prev };
        return m;
      }, "Review published");
    },
    deleteReview(id) { return writeMine((m) => { delete m.reviews[id]; return m; }, "Review deleted"); },
    toggleHelpful(authorUid, id) {
      const key = authorUid + "|" + id;
      return writeMine((m) => { if (m.helpful[key]) delete m.helpful[key]; else m.helpful[key] = true; return m; });
    },
    /** The artifact owner can take down someone else's review (moderation). */
    removeReview(authorUid, id) {
      const r = rtRef.current;
      const theirs = comm.find((d) => d.uid === authorUid);
      if (!theirs) return Promise.resolve(false);
      const next = plain(theirs);
      delete next.reviews[id];
      return r.db.doc("community/" + authorUid).set(next).then(() => { toast("Review removed"); return true; }).catch(() => { toast("Couldn't remove that review."); return false; });
    },
  }), [route, go, back, theme, rt, ex, toast, agg, ratings, commWritable, shelfLocalOnly, shelf, updateShelf, writeMine, comm, commReadOnly]);

  let page;
  if (route.page === "series") page = html`<${SeriesPage} key=${route.id} id=${route.id} />`;
  else if (route.page === "explore") page = html`<${Explore} />`;
  else if (route.page === "rankings") page = html`<${Rankings} />`;
  else if (route.page === "seasonal") page = html`<${Seasonal} />`;
  else if (route.page === "shelf") page = html`<${Shelf} />`;
  else page = html`<${Home} />`;

  return html`<${AppCtx.Provider} value=${api}>
    <${Header} />
    ${page}
    <${Footer} />
    <div className="toasts" role="status" aria-live="polite">${toasts.map((t) => html`<div key=${t.id} className="toast">${t.msg}</div>`)}</div>
  <//>`;
}

ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
