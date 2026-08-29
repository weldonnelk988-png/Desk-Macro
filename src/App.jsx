import React, { useState, useEffect, useCallback, useRef } from "react";
import { Compass, ScrollText, Target, Plus, X, ChevronDown, ChevronRight, Loader2, Star, Globe2, Download, Link2, Image as ImageIcon, Search, LogOut, Eye, AlertTriangle, StickyNote, Folder, Archive } from "lucide-react";
import { storageGet, storageSet } from "./storage";
import { auth } from "./firebase";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";

// ---------- Design tokens ----------
const C = {
  ink: "#0F1215",
  surface: "#171B20",
  surfaceRaised: "#1F242B",
  border: "#2A2F36",
  borderLight: "#343B44",
  hawk: "#C88A45",
  dove: "#4C8FA6",
  neutral: "#8A8478",
  gold: "#C4A661",
  stale: "#C9694A",
  trade: "#6D9C82",
  textPrimary: "#ECE8E1",
  textSecondary: "#8D9199",
  textFaint: "#5C6167",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const PRINT_CSS = `
@media print {
  .app-shell { display: none !important; }
  .export-modal { display: none !important; }
  .print-view { display: block !important; }
  body { background: #fff !important; }
}
.print-view { display: none; }
`;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function emptyContent() {
  return { text: "", images: [], links: [], refs: [] };
}
function ensureContent(c) {
  return { text: c?.text || "", images: c?.images || [], links: c?.links || [], refs: c?.refs || [] };
}
const FRESHNESS_DAYS = 14;
function UpdatedBadge({ updatedAt }) {
  if (!updatedAt) return null;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
  const stale = days > FRESHNESS_DAYS;
  return (
    <p className="text-[10px] mt-3" style={{ color: stale ? C.stale : C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
      {stale ? `⚠ Pas mis à jour depuis ${days} j` : `Mis à jour le ${formatDate(updatedAt)}`}
    </p>
  );
}
function HistoryList({ history, onUpdateEntry, onDeleteEntry }) {
  const [open, setOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [draft, setDraft] = useState("");
  if (!history || history.length === 0) return null;
  const startEdit = (idx, text) => { setEditingIdx(idx); setDraft(text); };
  const saveEdit = (idx) => { onUpdateEntry(idx, draft); setEditingIdx(null); };
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Historique ({history.length})
      </button>
      {open && (
        <div className="mt-1 pl-3 flex flex-col gap-1.5" style={{ borderLeft: `1px solid ${C.border}` }}>
          {history.map((h, idx) => ({ h, idx })).slice().reverse().map(({ h, idx }) => (
            <div key={idx}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{formatDate(h.date)}</p>
                {onUpdateEntry && editingIdx !== idx && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(idx, h.text)} className="text-[10px]" style={{ color: C.gold, fontFamily: "'IBM Plex Sans', sans-serif" }}>modifier</button>
                    {onDeleteEntry && <button onClick={() => onDeleteEntry(idx)} title="Supprimer cette entrée"><X size={10} color={C.textFaint} /></button>}
                  </div>
                )}
              </div>
              {editingIdx === idx ? (
                <div className="mt-1">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} className="bg-transparent outline-none w-full text-xs resize-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 6, padding: 4 }} rows={2} />
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => saveEdit(idx)} className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: C.gold, color: C.ink, fontFamily: "'IBM Plex Sans', sans-serif" }}>Enregistrer</button>
                    <button onClick={() => setEditingIdx(null)} className="text-[10px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Annuler</button>
                  </div>
                </div>
              ) : (
                <p className="text-xs" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>{h.text}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Seed data ----------
const ASSET_CLASS_DEFS = [
  { id: "forex", label: "Forex", seeds: ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"] },
  { id: "crypto", label: "Crypto", seeds: ["BTC", "ETH"] },
  { id: "actions", label: "Actions", seeds: [] },
  { id: "commodities", label: "Matières premières", seeds: ["Or", "Pétrole (WTI)", "Argent"] },
  { id: "indices", label: "Indices", seeds: ["S&P 500", "Nasdaq 100", "DAX", "Nikkei 225"] },
  { id: "rates", label: "Taux / Obligations", seeds: ["US10Y", "Bund 10Y"] },
];
const ASSET_CLASSES = ASSET_CLASS_DEFS.map((a) => a.label);

function seedTheses() {
  const obj = {};
  ASSET_CLASS_DEFS.forEach((cls) => {
    obj[cls.id] = {
      instruments: cls.seeds.map((s, i) => ({
        id: `${cls.id}-${i}`,
        symbol: s,
        content: emptyContent(),
        history: [],
        archived: false,
        direction: null,
        status: "idee",
        conviction: null,
        horizon: null,
        context: "",
        argumentsFor: "",
        argumentsAgainst: "",
        catalysts: "",
        risks: "",
        originalSnapshot: null,
        createdAt: null,
        updatedAt: null,
      })),
    };
  });
  return obj;
}

const CONVICTIONS = [
  { key: "haute", label: "Haute", color: C.hawk },
  { key: "moyenne", label: "Moyenne", color: C.gold },
  { key: "faible", label: "Faible", color: C.neutral },
];
const HORIZONS = [
  { key: "court", label: "Court terme" },
  { key: "moyen", label: "Moyen terme" },
  { key: "long", label: "Long terme" },
];
const DIRECTIONS = [
  { key: "long", label: "Long", color: C.hawk },
  { key: "short", label: "Short", color: C.dove },
];
const THESIS_STATUSES = [
  { key: "idee", label: "Idée", color: C.neutral },
  { key: "active", label: "Active", color: C.gold },
  { key: "invalidee", label: "Invalidée", color: C.stale },
  { key: "realisee", label: "Réalisée", color: C.dove },
];
const TRADE_RESULTS = [
  { key: "en_cours", label: "En cours", color: C.neutral },
  { key: "gagnant", label: "Gagnant", color: C.dove },
  { key: "perdant", label: "Perdant", color: C.stale },
  { key: "breakeven", label: "Breakeven", color: C.gold },
];

const NAV_ITEMS = [
  { id: "overview", label: "Vue d'ensemble", icon: AlertTriangle },
  { id: "drivers", label: "Drivers Macro", icon: Compass },
  { id: "thesis", label: "Thèse Macro", icon: ScrollText },
  { id: "trades", label: "Trades", icon: Target },
  { id: "watchlist", label: "Watchlist", icon: Eye },
  { id: "notebook", label: "Bloc-Note", icon: StickyNote },
];

// ---------- Shared bits ----------
function TagButton({ active, color, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
      style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: active ? color : "transparent", color: active ? C.ink : C.textSecondary, border: `1px solid ${active ? color : C.border}` }}
    >
      {label}
    </button>
  );
}

function LabeledTextarea({ label, value, onChange, placeholder, rows = 2 }) {
  return (
    <div className="mt-2.5">
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</p>
      <textarea
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none w-full text-sm resize-none"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary, lineHeight: 1.5, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px" }}
        rows={rows}
      />
    </div>
  );
}

function LabeledInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</p>
      <input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent outline-none w-full text-sm"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px" }}
      />
    </div>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <>
      <h2 className="text-2xl mb-1" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }}>{title}</h2>
      {subtitle && <p className="text-sm mb-6" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>{subtitle}</p>}
    </>
  );
}

// Reusable rich content editor: text + images (url) + links + @ references to Drivers/Thèse/Trades
function RichContentEditor({ content, onChange, refOptions, onNavigateRef, placeholder, rows = 4, onSnapshot }) {
  const addImage = () => {
    const url = window.prompt("URL de l'image :");
    if (url) onChange({ ...content, images: [...content.images, { id: uid(), url }] });
  };
  const addLink = () => {
    const url = window.prompt("URL du lien :");
    if (!url) return;
    const label = window.prompt("Libellé du lien (optionnel) :") || url;
    onChange({ ...content, links: [...content.links, { id: uid(), url, label }] });
  };
  const removeImage = (id) => onChange({ ...content, images: content.images.filter((i) => i.id !== id) });
  const removeLink = (id) => onChange({ ...content, links: content.links.filter((l) => l.id !== id) });
  const removeRef = (id, type) => onChange({ ...content, refs: content.refs.filter((r) => !(r.id === id && r.type === type)) });
  const addRef = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [type, id] = val.split(":");
    const opt = refOptions.find((o) => o.type === type && String(o.id) === id);
    if (opt && !content.refs.some((r) => r.id === opt.id && r.type === opt.type)) {
      onChange({ ...content, refs: [...content.refs, opt] });
    }
    e.target.value = "";
  };
  const refColor = { driver: C.gold, instrument: C.neutral, trade: C.trade };

  return (
    <div>
      <textarea
        value={content.text}
        onChange={(e) => onChange({ ...content, text: e.target.value })}
        onBlur={() => onSnapshot && onSnapshot(content.text)}
        placeholder={placeholder}
        className="bg-transparent outline-none w-full text-sm resize-none"
        style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary, lineHeight: 1.6 }}
        rows={rows}
      />

      {content.images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {content.images.map((img) => (
            <div key={img.id} className="relative">
              <img src={img.url} alt="" className="rounded-md object-cover" style={{ width: 76, height: 76, border: `1px solid ${C.border}` }} />
              <button onClick={() => removeImage(img.id)} className="absolute -top-1.5 -right-1.5 rounded-full p-0.5" style={{ backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
                <X size={10} color={C.textFaint} />
              </button>
            </div>
          ))}
        </div>
      )}

      {content.links.length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          {content.links.map((l) => (
            <div key={l.id} className="flex items-center gap-1.5 text-xs">
              <Link2 size={11} color={C.textFaint} />
              <a href={l.url} target="_blank" rel="noreferrer" className="truncate underline" style={{ color: C.dove, fontFamily: "'IBM Plex Sans', sans-serif" }}>{l.label}</a>
              <button onClick={() => removeLink(l.id)}><X size={11} color={C.textFaint} /></button>
            </div>
          ))}
        </div>
      )}

      {content.refs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {content.refs.map((r) => (
            <span key={`${r.type}-${r.id}`} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace", color: refColor[r.type], border: `1px solid ${refColor[r.type]}` }}>
              <button onClick={() => onNavigateRef(r.type)}>@{r.label}</button>
              <button onClick={() => removeRef(r.id, r.type)}><X size={10} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button onClick={addImage} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <ImageIcon size={12} /> Image
        </button>
        <button onClick={addLink} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Link2 size={12} /> Lien
        </button>
        <select onChange={addRef} defaultValue="" className="text-[11px] px-2 py-1 rounded-md bg-transparent" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <option value="" style={{ color: "#000" }}>@ Référencer...</option>
          {refOptions.filter((o) => o.type === "driver").length > 0 && (
            <optgroup label="Drivers Macro" style={{ color: "#000" }}>
              {refOptions.filter((o) => o.type === "driver").map((o) => (<option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`} style={{ color: "#000" }}>{o.label}</option>))}
            </optgroup>
          )}
          {refOptions.filter((o) => o.type === "instrument").length > 0 && (
            <optgroup label="Thèse Macro (instruments)" style={{ color: "#000" }}>
              {refOptions.filter((o) => o.type === "instrument").map((o) => (<option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`} style={{ color: "#000" }}>{o.label}</option>))}
            </optgroup>
          )}
          {refOptions.filter((o) => o.type === "trade").length > 0 && (
            <optgroup label="Trades" style={{ color: "#000" }}>
              {refOptions.filter((o) => o.type === "trade").map((o) => (<option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`} style={{ color: "#000" }}>{o.label}</option>))}
            </optgroup>
          )}
          {refOptions.length === 0 && (
            <option value="" disabled style={{ color: "#999" }}>— rien à référencer pour l'instant —</option>
          )}
        </select>
      </div>
    </div>
  );
}

// ================= BLOC-NOTE =================
function ChecklistEditor({ items, onChange }) {
  const list = items || [];
  const addItem = () => onChange([...list, { id: uid(), text: "", done: false }]);
  const updateItem = (id, patch) => onChange(list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const deleteItem = (id) => onChange(list.filter((it) => it.id !== id));
  return (
    <div className="mt-2">
      {list.map((it) => (
        <div key={it.id} className="flex items-center gap-2 mb-1">
          <input type="checkbox" checked={it.done} onChange={(e) => updateItem(it.id, { done: e.target.checked })} />
          <input
            value={it.text}
            onChange={(e) => updateItem(it.id, { text: e.target.value })}
            placeholder="Tâche..."
            className="bg-transparent outline-none text-xs flex-1"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: it.done ? C.textFaint : C.textSecondary, textDecoration: it.done ? "line-through" : "none" }}
          />
          <button onClick={() => deleteItem(it.id)}><X size={12} color={C.textFaint} /></button>
        </div>
      ))}
      <button onClick={addItem} className="flex items-center gap-1 text-[11px] mt-1 px-2 py-1 rounded-md w-full justify-center transition-colors hover:opacity-80" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Plus size={12} /> Tâche
      </button>
    </div>
  );
}

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState("");
  const list = tags || [];
  const addTag = () => {
    const t = input.trim();
    if (!t || list.includes(t)) { setInput(""); return; }
    onChange([...list, t]);
    setInput("");
  };
  const removeTag = (t) => onChange(list.filter((x) => x !== t));
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5">
      {list.map((t) => (
        <span key={t} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.gold, border: `1px solid ${C.gold}` }}>
          #{t} <button onClick={() => removeTag(t)}><X size={9} /></button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
        onBlur={addTag}
        placeholder="+ tag"
        className="bg-transparent outline-none text-[10px] w-16"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint }}
      />
    </div>
  );
}

function NoteCard({ note, folders, onUpdate, onDelete, refOptions, onNavigateRef }) {
  const touch = (patch) => onUpdate({ ...note, ...patch, updatedAt: new Date().toISOString() });
  const snapshot = (text) => {
    if (!text || !text.trim()) return;
    const last = note.history?.[note.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(note.history || []), { date: new Date().toISOString(), text }].slice(-15);
    onUpdate({ ...note, history });
  };
  const openCount = (note.checklist || []).filter((c) => !c.done).length;
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${note.pinned ? C.gold : C.border}` }}>
      <div className="flex items-start gap-2">
        <button onClick={() => touch({ pinned: !note.pinned })} className="mt-0.5 flex-shrink-0" title="Épingler">
          <Star size={16} fill={note.pinned ? C.gold : "none"} color={note.pinned ? C.gold : C.textFaint} strokeWidth={1.5} />
        </button>
        <input value={note.title} onChange={(e) => touch({ title: e.target.value })} placeholder="Titre de la note" className="bg-transparent outline-none flex-1 text-base font-medium" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }} />
        <button onClick={() => touch({ archived: !note.archived })} className="p-0.5 flex-shrink-0" title={note.archived ? "Désarchiver" : "Archiver"} style={{ color: note.archived ? C.gold : C.textFaint }}>
          <Archive size={14} />
        </button>
        <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70 flex-shrink-0" style={{ color: C.textFaint }}><X size={14} /></button>
      </div>
      <select
        value={note.folderId || ""}
        onChange={(e) => touch({ folderId: e.target.value || null })}
        className="mt-2 ml-6 text-[11px] bg-transparent outline-none"
        style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 5px" }}
      >
        <option value="" style={{ color: "#000" }}>Sans dossier</option>
        {folders.map((f) => (<option key={f.id} value={f.id} style={{ color: "#000" }}>{f.name}</option>))}
      </select>
      <div className="mt-2 ml-6" style={{ width: "calc(100% - 1.5rem)" }}>
        <RichContentEditor content={ensureContent(note.content)} onChange={(c) => touch({ content: c })} onSnapshot={snapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Écris ta note..." rows={3} />
      </div>
      <div className="ml-6">
        <TagEditor tags={note.tags} onChange={(tags) => touch({ tags })} />
        <ChecklistEditor items={note.checklist} onChange={(checklist) => touch({ checklist })} />
        {openCount > 0 && <p className="text-[10px] mt-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{openCount} tâche{openCount > 1 ? "s" : ""} en cours</p>}
      </div>
      {note.updatedAt && <UpdatedBadge updatedAt={note.updatedAt} />}
      <div className="ml-6"><HistoryList history={note.history} /></div>
    </div>
  );
}

function NotebookSection({ notebook, onUpdate, onAddNote, onDeleteNote, onAddFolder, onDeleteFolder, refOptions, onNavigateRef }) {
  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState("all");
  const [activeTag, setActiveTag] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const notes = notebook.notes || [];
  const folders = notebook.folders || [];
  const allTags = [...new Set(notes.flatMap((n) => n.tags || []))];

  const q = search.trim().toLowerCase();
  let filtered = notes.filter((n) => Boolean(n.archived) === showArchived);
  if (activeFolder === "none") filtered = filtered.filter((n) => !n.folderId);
  else if (activeFolder !== "all") filtered = filtered.filter((n) => n.folderId === activeFolder);
  if (activeTag) filtered = filtered.filter((n) => (n.tags || []).includes(activeTag));
  if (q) filtered = filtered.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.content?.text || "").toLowerCase().includes(q) || (n.tags || []).some((t) => t.toLowerCase().includes(q)));
  filtered = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  const updateNote = (updated) => onUpdate({ ...notebook, notes: notes.map((n) => (n.id === updated.id ? updated : n)) });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1" style={{ border: `1px solid ${C.border}` }}>
          <Search size={13} color={C.textFaint} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans les notes..." className="bg-transparent outline-none text-xs flex-1" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }} />
          {search && <button onClick={() => setSearch("")}><X size={12} color={C.textFaint} /></button>}
        </div>
        <button onClick={onAddNote} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors hover:opacity-80" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Plus size={13} /> Note
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <button onClick={() => setActiveFolder("all")} className="text-[11px] px-2 py-1 rounded-md transition-colors" style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: activeFolder === "all" ? C.gold : "transparent", color: activeFolder === "all" ? C.ink : C.textSecondary, border: `1px solid ${activeFolder === "all" ? C.gold : C.border}` }}>Toutes</button>
        <button onClick={() => setActiveFolder("none")} className="text-[11px] px-2 py-1 rounded-md transition-colors" style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: activeFolder === "none" ? C.gold : "transparent", color: activeFolder === "none" ? C.ink : C.textSecondary, border: `1px solid ${activeFolder === "none" ? C.gold : C.border}` }}>Sans dossier</button>
        {folders.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <button onClick={() => setActiveFolder(f.id)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors" style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: activeFolder === f.id ? C.gold : "transparent", color: activeFolder === f.id ? C.ink : C.textSecondary, border: `1px solid ${activeFolder === f.id ? C.gold : C.border}` }}>
              <Folder size={11} /> {f.name}
            </button>
            <button onClick={() => onDeleteFolder(f.id)} title="Supprimer le dossier"><X size={10} color={C.textFaint} /></button>
          </span>
        ))}
        <button onClick={onAddFolder} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md" style={{ color: C.textFaint, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Folder size={11} /> + dossier
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {allTags.map((t) => (
            <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)} className="text-[10px] px-1.5 py-0.5 rounded transition-colors" style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: activeTag === t ? C.gold : "transparent", color: activeTag === t ? C.ink : C.textFaint, border: `1px solid ${activeTag === t ? C.gold : C.border}` }}>#{t}</button>
          ))}
        </div>
      )}

      <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-1 text-[11px] mb-3" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Archive size={12} /> {showArchived ? "Retour aux notes actives" : "Voir les archives"}
      </button>

      {filtered.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{showArchived ? "Aucune note archivée." : "Aucune note pour l'instant — crée-en une."}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((n) => (<NoteCard key={n.id} note={n} folders={folders} onUpdate={updateNote} onDelete={() => onDeleteNote(n.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />))}
        </div>
      )}
    </div>
  );
}

function WatchItemRow({ item, onUpdate, onDelete }) {
  const biasOpts = [{ key: "haussier", label: "Haussier", color: C.hawk }, { key: "baissier", label: "Baissier", color: C.dove }, { key: "neutre", label: "Neutre", color: C.neutral }];
  return (
    <div className="rounded-lg p-2.5 mb-1.5" style={{ backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <input value={item.symbol} onChange={(e) => onUpdate({ ...item, symbol: e.target.value })} placeholder="Symbole (ex. EUR/USD, AAPL, BTC...)" className="bg-transparent outline-none flex-1 text-sm font-medium" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }} />
        <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70 flex-shrink-0" style={{ color: C.textFaint }}><X size={13} /></button>
      </div>
      <div className="flex gap-1 mt-1.5">
        {biasOpts.map((o) => (
          <button key={o.key} onClick={() => onUpdate({ ...item, bias: item.bias === o.key ? null : o.key })} className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors" style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: item.bias === o.key ? o.color : "transparent", color: item.bias === o.key ? C.ink : C.textFaint, border: `1px solid ${item.bias === o.key ? o.color : C.border}` }}>{o.label}</button>
        ))}
      </div>
      <input value={item.level} onChange={(e) => onUpdate({ ...item, level: e.target.value })} placeholder="Niveau à surveiller (ex. 1.0850, 65 000...)" className="bg-transparent outline-none text-xs w-full mt-1.5" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px" }} />
      <textarea value={item.note} onChange={(e) => onUpdate({ ...item, note: e.target.value })} placeholder="Note..." className="bg-transparent outline-none w-full text-xs mt-1.5 resize-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }} rows={1} />
    </div>
  );
}

function WatchlistCard({ watchlist, onUpdate, onDelete }) {
  const touch = (patch) => onUpdate({ ...watchlist, ...patch, updatedAt: new Date().toISOString() });
  const addItem = () => touch({ items: [...watchlist.items, { id: uid(), symbol: "", bias: null, level: "", note: "" }] });
  const updateItem = (id, updated) => touch({ items: watchlist.items.map((i) => (i.id === id ? updated : i)) });
  const deleteItem = (id) => touch({ items: watchlist.items.filter((i) => i.id !== id) });
  return (
    <div className="rounded-xl p-4 transition-colors" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2">
        <input value={watchlist.name} onChange={(e) => touch({ name: e.target.value })} placeholder="Nom de la watchlist" className="bg-transparent outline-none text-lg flex-1 min-w-0" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }} />
        <span className="text-[10px] flex-shrink-0" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{watchlist.items.length}</span>
        <button onClick={onDelete} className="p-0.5 rounded flex-shrink-0 hover:opacity-70" style={{ color: C.textFaint }} title="Supprimer la watchlist"><X size={14} /></button>
      </div>
      <div className="mt-2">
        {watchlist.items.map((i) => (<WatchItemRow key={i.id} item={i} onUpdate={(u) => updateItem(i.id, u)} onDelete={() => deleteItem(i.id)} />))}
        <button onClick={addItem} className="flex items-center gap-1 text-[11px] mt-1 px-2 py-1 rounded-md w-full justify-center transition-colors hover:opacity-80" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Plus size={12} /> Ajouter un élément
        </button>
      </div>
      {watchlist.updatedAt && <UpdatedBadge updatedAt={watchlist.updatedAt} />}
    </div>
  );
}

function WatchlistSection({ watchlists, onUpdate, onAdd, onDelete }) {
  return (
    <div>
      <button onClick={onAdd} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg mb-4 transition-colors hover:opacity-80" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Plus size={13} /> Nouvelle watchlist
      </button>
      {watchlists.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Aucune watchlist pour l'instant — crée-en une pour suivre tes instruments de près.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {watchlists.map((w) => <WatchlistCard key={w.id} watchlist={w} onUpdate={onUpdate} onDelete={() => onDelete(w.id)} />)}
        </div>
      )}
    </div>
  );
}

// ================= DRIVERS MACRO =================
function AssetChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} className="px-2 py-1 rounded-full text-[11px]" style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: active ? C.surfaceRaised : "transparent", color: active ? C.textPrimary : C.textFaint, border: `1px solid ${active ? C.gold : C.border}` }}>{label}</button>
  );
}

function DriverCard({ driver, onUpdate, onDelete, onSetMain, refOptions, onNavigateRef }) {
  const toggleAsset = (asset) => { const has = driver.assetClasses.includes(asset); onUpdate({ ...driver, assetClasses: has ? driver.assetClasses.filter((a) => a !== asset) : [...driver.assetClasses, asset] }); };
  const content = ensureContent(driver.content || { text: driver.description || "" });
  const snapshot = (text) => {
    if (!text || !text.trim()) return;
    const last = driver.history?.[driver.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(driver.history || []), { date: new Date().toISOString(), text }].slice(-15);
    onUpdate({ ...driver, history });
  };
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${driver.isMain ? C.gold : C.border}` }}>
      <div className="flex items-start gap-2">
        <button onClick={onSetMain} className="mt-0.5 flex-shrink-0" title="Marquer comme driver principal">
          <Star size={16} fill={driver.isMain ? C.gold : "none"} color={driver.isMain ? C.gold : C.textFaint} strokeWidth={1.5} />
        </button>
        <input value={driver.name} onChange={(e) => onUpdate({ ...driver, name: e.target.value })} placeholder="Nom du driver (ex. Désinflation US...)" className="bg-transparent outline-none flex-1 text-base font-medium" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }} />
        <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70 flex-shrink-0" style={{ color: C.textFaint }}><X size={14} /></button>
      </div>
      {driver.isMain && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ml-6 inline-block mt-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.gold, border: `1px solid ${C.gold}` }}>Driver principal</span>}
      <div className="mt-2 ml-6" style={{ width: "calc(100% - 1.5rem)" }}>
        <RichContentEditor content={content} onChange={(c) => onUpdate({ ...driver, content: c, description: undefined })} onSnapshot={snapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Description — pourquoi ce driver compte..." rows={2} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2 ml-6">{ASSET_CLASSES.map((a) => <AssetChip key={a} label={a} active={driver.assetClasses.includes(a)} onClick={() => toggleAsset(a)} />)}</div>
      {driver.updatedAt && <UpdatedBadge updatedAt={driver.updatedAt} />}
      <div className="ml-6"><HistoryList history={driver.history} /></div>
    </div>
  );
}

function DriversSection({ drivers, onUpdate, onAdd, onDelete, onSetMain, refOptions, onNavigateRef }) {
  const sorted = [...drivers].sort((a, b) => (b.isMain ? 1 : 0) - (a.isMain ? 1 : 0));
  return (
    <div>
      <div className="flex flex-col gap-3">{sorted.map((d) => (<DriverCard key={d.id} driver={d} onUpdate={(u) => onUpdate(d.id, u)} onDelete={() => onDelete(d.id)} onSetMain={() => onSetMain(d.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />))}</div>
      <button onClick={onAdd} className="flex items-center gap-1.5 text-sm mt-3 px-3 py-2 rounded-lg w-full justify-center" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}><Plus size={14} /> Ajouter un driver</button>
    </div>
  );
}

// ================= THÈSE MACRO =================
function GlobalThesisCard({ content, updatedAt, history, onUpdate, onSnapshot, onUpdateHistoryEntry, onDeleteHistoryEntry, refOptions, onNavigateRef }) {
  return (
    <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: C.surfaceRaised, border: `1px solid ${C.gold}` }}>
      <div className="flex items-center gap-2">
        <Globe2 size={16} color={C.gold} strokeWidth={1.75} />
        <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary, fontSize: "1.05rem" }}>Vue d'ensemble globale des marchés</h3>
      </div>
      <div className="mt-2">
        <RichContentEditor content={content} onChange={onUpdate} onSnapshot={onSnapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Ta lecture d'ensemble : cycle, régime de marché, comment tout se connecte..." rows={5} />
      </div>
      {updatedAt && <UpdatedBadge updatedAt={updatedAt} />}
      <HistoryList history={history} onUpdateEntry={onUpdateHistoryEntry} onDeleteEntry={onDeleteHistoryEntry} />
    </div>
  );
}

function OriginalThesisBlock({ snapshot }) {
  const [open, setOpen] = useState(false);
  if (!snapshot) return null;
  const dir = DIRECTIONS.find((d) => d.key === snapshot.direction);
  const stat = THESIS_STATUSES.find((s) => s.key === snapshot.status);
  const hor = HORIZONS.find((h) => h.key === snapshot.horizon);
  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.gold}` }}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[11px]" style={{ color: C.gold, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 🔒 Thèse figée le {formatDate(snapshot.frozenAt)}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg" style={{ backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
          <p className="text-xs mb-1.5" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {dir?.label || "—"} · {stat?.label || "—"} · Conviction {snapshot.conviction || "—"}/10 · {hor?.label || "—"}
          </p>
          {snapshot.context && <p className="text-xs mb-1.5" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}><em>Contexte :</em> {snapshot.context}</p>}
          {snapshot.thesisText && <p className="text-xs mb-1.5" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}>{snapshot.thesisText}</p>}
          {snapshot.argumentsFor && <p className="text-xs mb-1.5" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}><em>Pour :</em> {snapshot.argumentsFor}</p>}
          {snapshot.argumentsAgainst && <p className="text-xs mb-1.5" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}><em>Contre :</em> {snapshot.argumentsAgainst}</p>}
          {snapshot.catalysts && <p className="text-xs mb-1.5" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}><em>Catalyseurs :</em> {snapshot.catalysts}</p>}
          {snapshot.risks && <p className="text-xs" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif", whiteSpace: "pre-wrap" }}><em>Risques :</em> {snapshot.risks}</p>}
        </div>
      )}
    </div>
  );
}

function InstrumentRow({ instrument, onUpdate, onDelete, onArchiveToggle, refOptions, onNavigateRef, placeholder }) {
  const [open, setOpen] = useState(false);
  const touch = (patch) => onUpdate({ ...instrument, ...patch, ...(!instrument.createdAt ? { createdAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() });
  const snapshot = (text) => {
    if (!text || !text.trim()) return;
    const last = instrument.history?.[instrument.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(instrument.history || []), { date: new Date().toISOString(), text }].slice(-15);
    onUpdate({ ...instrument, history });
  };
  const updateHistoryEntry = (idx, text) => onUpdate({ ...instrument, history: instrument.history.map((h, i) => (i === idx ? { ...h, text } : h)) });
  const deleteHistoryEntry = (idx) => onUpdate({ ...instrument, history: instrument.history.filter((_, i) => i !== idx) });

  const freeze = () => {
    if (instrument.originalSnapshot) return;
    if (!window.confirm("Figer cette thèse maintenant ? Ça enregistre un instantané permanent de ta pensée actuelle — impossible à modifier ensuite.")) return;
    touch({
      originalSnapshot: {
        frozenAt: new Date().toISOString(),
        direction: instrument.direction || null,
        status: instrument.status || "idee",
        conviction: instrument.conviction || null,
        horizon: instrument.horizon || null,
        context: instrument.context || "",
        thesisText: instrument.content?.text || "",
        argumentsFor: instrument.argumentsFor || "",
        argumentsAgainst: instrument.argumentsAgainst || "",
        catalysts: instrument.catalysts || "",
        risks: instrument.risks || "",
      },
    });
  };

  const dirInfo = DIRECTIONS.find((d) => d.key === instrument.direction);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:opacity-90" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <Folder size={14} color={C.textFaint} />
        <span className="text-sm font-medium truncate" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: instrument.archived ? C.textFaint : C.textPrimary }}>{instrument.symbol || "(sans nom)"}</span>
        {dirInfo && <span className="text-[10px] uppercase px-1 py-0.5 rounded flex-shrink-0" style={{ fontFamily: "'IBM Plex Mono', monospace", color: dirInfo.color, border: `1px solid ${dirInfo.color}` }}>{dirInfo.label}</span>}
        {instrument.conviction ? <span className="text-[10px] flex-shrink-0" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{instrument.conviction}/10</span> : null}
        {instrument.archived && <Archive size={12} color={C.textFaint} />}
        <span className="flex-1" />
        {instrument.updatedAt && <span className="text-[10px] flex-shrink-0" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{formatDate(instrument.updatedAt)}</span>}
      </button>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.gold}` }}>
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(false)} className="p-0.5 flex-shrink-0" style={{ color: C.textFaint }}><ChevronDown size={14} /></button>
        <input value={instrument.symbol} onChange={(e) => touch({ symbol: e.target.value })} placeholder="Symbole" className="bg-transparent outline-none text-base font-medium flex-1 min-w-0" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }} />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <input
            type="date"
            value={instrument.thesisDate || ""}
            onChange={(e) => touch({ thesisDate: e.target.value })}
            title="Date de cette thèse"
            className="bg-transparent outline-none text-[11px]"
            style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint, border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 5px" }}
          />
          <button onClick={onArchiveToggle} title={instrument.archived ? "Désarchiver" : "Archiver"} style={{ color: instrument.archived ? C.gold : C.textFaint }}><Archive size={14} /></button>
          <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70" style={{ color: C.textFaint }}><X size={14} /></button>
        </div>
      </div>

      {instrument.createdAt && <p className="text-[10px] mt-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>Créée le {formatDate(instrument.createdAt)}</p>}

      <div className="flex flex-wrap gap-1.5 mt-2">{DIRECTIONS.map((d) => <TagButton key={d.key} active={instrument.direction === d.key} color={d.color} label={d.label} onClick={() => touch({ direction: instrument.direction === d.key ? null : d.key })} />)}</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">{THESIS_STATUSES.map((s) => <TagButton key={s.key} active={instrument.status === s.key} color={s.color} label={s.label} onClick={() => touch({ status: instrument.status === s.key ? null : s.key })} />)}</div>
      <div className="flex flex-wrap items-center gap-3 mt-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Conviction</span>
          <input type="number" min="1" max="10" value={instrument.conviction || ""} onChange={(e) => touch({ conviction: e.target.value ? Number(e.target.value) : null })} placeholder="—" className="bg-transparent outline-none text-xs w-12 text-center" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 4px" }} />
          <span className="text-[11px]" style={{ color: C.textFaint }}>/10</span>
        </div>
        <div className="flex gap-1.5">{HORIZONS.map((h) => <TagButton key={h.key} active={instrument.horizon === h.key} color={C.gold} label={h.label} onClick={() => touch({ horizon: instrument.horizon === h.key ? null : h.key })} />)}</div>
      </div>

      <LabeledTextarea label="Contexte macro" value={instrument.context} onChange={(v) => touch({ context: v })} placeholder="Le contexte macro qui sous-tend l'idée..." rows={2} />

      <div className="mt-2.5">
        <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>Thèse fondamentale</p>
        <RichContentEditor content={instrument.content} onChange={(c) => touch({ content: c })} onSnapshot={snapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder={placeholder} rows={3} />
      </div>

      <LabeledTextarea label="Arguments en faveur" value={instrument.argumentsFor} onChange={(v) => touch({ argumentsFor: v })} placeholder="Ce qui soutient la thèse..." rows={2} />
      <LabeledTextarea label="Arguments contre" value={instrument.argumentsAgainst} onChange={(v) => touch({ argumentsAgainst: v })} placeholder="Ce qui pourrait l'invalider..." rows={2} />
      <LabeledTextarea label="Catalyseurs" value={instrument.catalysts} onChange={(v) => touch({ catalysts: v })} placeholder="Événements à surveiller..." rows={2} />
      <LabeledTextarea label="Risques / invalidation" value={instrument.risks} onChange={(v) => touch({ risks: v })} placeholder="Ce qui invaliderait la thèse..." rows={2} />

      {instrument.updatedAt && <UpdatedBadge updatedAt={instrument.updatedAt} />}

      {instrument.originalSnapshot ? (
        <OriginalThesisBlock snapshot={instrument.originalSnapshot} />
      ) : (
        <button onClick={freeze} className="flex items-center gap-1.5 text-[11px] mt-3 px-2.5 py-1.5 rounded-md" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          🔒 Figer cette thèse
        </button>
      )}

      <HistoryList history={instrument.history} onUpdateEntry={updateHistoryEntry} onDeleteEntry={deleteHistoryEntry} />
    </div>
  );
}

function AssetClassBlock({ cls, data, onUpdateInstrument, onAdd, onDelete, refOptions, onNavigateRef }) {
  const [open, setOpen] = useState(cls.id === "forex");
  const [showArchived, setShowArchived] = useState(false);
  const instruments = data?.instruments || [];
  const visible = instruments.filter((i) => Boolean(i.archived) === showArchived);
  const archivedCount = instruments.filter((i) => i.archived).length;
  return (
    <div className="mb-5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left mb-2" style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "1.1rem" }}>{cls.label}</span>
        <span className="text-xs" style={{ color: C.textFaint }}>({instruments.filter((i) => !i.archived).length})</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5">
          {visible.map((inst) => (
            <InstrumentRow
              key={inst.id}
              instrument={inst}
              onUpdate={(u) => onUpdateInstrument(inst.id, u)}
              onDelete={() => onDelete(inst.id)}
              onArchiveToggle={() => onUpdateInstrument(inst.id, { ...inst, archived: !inst.archived, updatedAt: new Date().toISOString() })}
              refOptions={refOptions}
              onNavigateRef={onNavigateRef}
              placeholder={`Ta thèse et ton biais sur ${inst.symbol || "cet instrument"}...`}
            />
          ))}
          {visible.length === 0 && (
            <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{showArchived ? "Aucun instrument archivé." : "Aucun instrument."}</p>
          )}
          <button onClick={onAdd} className="flex items-center justify-center gap-1.5 text-sm rounded-xl py-2.5" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <Plus size={14} /> Ajouter {cls.label.toLowerCase() === "actions" ? "une action" : "un instrument"}
          </button>
          {archivedCount > 0 && (
            <button onClick={() => setShowArchived(!showArchived)} className="flex items-center gap-1 text-[11px] mt-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              <Archive size={11} /> {showArchived ? "Retour aux instruments actifs" : `Voir les archives (${archivedCount})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ThesisSection({ globalThesis, onUpdateGlobal, onSnapshotGlobal, onUpdateGlobalHistoryEntry, onDeleteGlobalHistoryEntry, theses, onUpdateInstrument, onAddInstrument, onDeleteInstrument, refOptions, onNavigateRef }) {
  return (
    <div>
      <GlobalThesisCard content={globalThesis.content} updatedAt={globalThesis.updatedAt} history={globalThesis.history} onUpdate={onUpdateGlobal} onSnapshot={onSnapshotGlobal} onUpdateHistoryEntry={onUpdateGlobalHistoryEntry} onDeleteHistoryEntry={onDeleteGlobalHistoryEntry} refOptions={refOptions} onNavigateRef={onNavigateRef} />
      {ASSET_CLASS_DEFS.map((cls) => (
        <AssetClassBlock
          key={cls.id}
          cls={cls}
          data={theses[cls.id]}
          onUpdateInstrument={(instId, u) => onUpdateInstrument(cls.id, instId, u)}
          onAdd={() => onAddInstrument(cls.id)}
          onDelete={(instId) => onDeleteInstrument(cls.id, instId)}
          refOptions={refOptions}
          onNavigateRef={onNavigateRef}
        />
      ))}
    </div>
  );
}

// ================= TRADES =================
function TradeCard({ trade, onUpdate, onDelete, refOptions, onNavigateRef }) {
  const touch = (patch) => onUpdate({ ...trade, ...patch, updatedAt: new Date().toISOString() });
  const convictionColor = CONVICTIONS.find((c) => c.key === trade.conviction)?.color;
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${convictionColor || C.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <input value={trade.ticker} onChange={(e) => touch({ ticker: e.target.value })} placeholder="Actif / ticker" className="bg-transparent outline-none text-base font-medium" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary, width: "9rem" }} />
          {trade.direction && <span className="text-[10px] uppercase px-1.5 py-0.5 rounded" style={{ fontFamily: "'IBM Plex Mono', monospace", color: DIRECTIONS.find((d) => d.key === trade.direction)?.color, border: `1px solid ${DIRECTIONS.find((d) => d.key === trade.direction)?.color}` }}>{DIRECTIONS.find((d) => d.key === trade.direction)?.label}</span>}
        </div>
        <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70" style={{ color: C.textFaint }}><X size={14} /></button>
      </div>
      <select value={trade.assetClass} onChange={(e) => touch({ assetClass: e.target.value })} className="bg-transparent outline-none text-xs mt-2" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px" }}>
        <option value="" style={{ color: "#000" }}>Classe d'actif...</option>
        {ASSET_CLASSES.map((a) => <option key={a} value={a} style={{ color: "#000" }}>{a}</option>)}
      </select>
      <div className="flex flex-wrap gap-1.5 mt-2">{DIRECTIONS.map((d) => <TagButton key={d.key} active={trade.direction === d.key} color={d.color} label={d.label} onClick={() => touch({ direction: trade.direction === d.key ? null : d.key })} />)}</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">{CONVICTIONS.map((c) => <TagButton key={c.key} active={trade.conviction === c.key} color={c.color} label={`Conviction ${c.label.toLowerCase()}`} onClick={() => touch({ conviction: trade.conviction === c.key ? null : c.key })} />)}</div>
      <div className="flex flex-wrap gap-1.5 mt-1.5">{HORIZONS.map((h) => <TagButton key={h.key} active={trade.horizon === h.key} color={C.gold} label={h.label} onClick={() => touch({ horizon: trade.horizon === h.key ? null : h.key })} />)}</div>

      <div className="mt-3">
        <p className="text-[11px] mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>RAISONS DU TRADE (la thèse)</p>
        <RichContentEditor content={trade.reasons} onChange={(c) => touch({ reasons: c })} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Pourquoi ce trade — fondamentaux, driver, catalyseur..." rows={2} />
      </div>

      <div className="mt-3">
        <p className="text-[11px] mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>ATTENTES</p>
        <textarea value={trade.expectations} onChange={(e) => touch({ expectations: e.target.value })} placeholder="Ce que tu attends — niveaux, scénario, invalidation..." className="bg-transparent outline-none w-full text-sm resize-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary, lineHeight: 1.5 }} rows={2} />
      </div>

      <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
        <p className="text-[11px] mb-2" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>EXÉCUTION</p>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput label="Entrée" value={trade.entry} onChange={(v) => touch({ entry: v })} placeholder="Prix d'entrée" />
          <LabeledInput label="Stop" value={trade.stop} onChange={(v) => touch({ stop: v })} placeholder="Stop loss" />
          <LabeledInput label="Take Profit" value={trade.takeProfit} onChange={(v) => touch({ takeProfit: v })} placeholder="Objectif" />
          <LabeledInput label="Taille" value={trade.size} onChange={(v) => touch({ size: v })} placeholder="Taille de position" />
          <LabeledInput label="Risque %" value={trade.riskPercent} onChange={(v) => touch({ riskPercent: v })} placeholder="Ex. 1%" />
        </div>
      </div>

      <div className="mt-3">
        <p className="text-[11px] mb-1.5" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>RÉSULTAT</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">{TRADE_RESULTS.map((r) => <TagButton key={r.key} active={(trade.resultStatus || "en_cours") === r.key} color={r.color} label={r.label} onClick={() => touch({ resultStatus: r.key })} />)}</div>
        <input value={trade.result} onChange={(e) => touch({ result: e.target.value })} placeholder="Ex. +2.3R, -1R, +450$" className="bg-transparent outline-none text-sm w-full" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 7px" }} />
      </div>

      <div className="mt-3">
        <p className="text-[11px] mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>COMMENTAIRE POST-TRADE (ajoute une capture via l'image)</p>
        <RichContentEditor content={ensureContent(trade.postComment)} onChange={(c) => touch({ postComment: c })} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Thèse bonne, exécution mauvaise ? Débrief..." rows={2} />
      </div>

      {trade.updatedAt && <UpdatedBadge updatedAt={trade.updatedAt} />}
    </div>
  );
}

function TradesSection({ trades, onUpdate, onAdd, onDelete, refOptions, onNavigateRef }) {
  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{trades.map((t) => (<TradeCard key={t.id} trade={t} onUpdate={onUpdate} onDelete={() => onDelete(t.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />))}</div>
      <button onClick={onAdd} className="flex items-center gap-1.5 text-sm mt-3 px-3 py-2 rounded-lg w-full justify-center" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}><Plus size={14} /> Ajouter un trade</button>
    </div>
  );
}

// ================= EXPORT PDF =================
function ExportGroup({ title, items, selected, onToggle, onAll }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-medium" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Mono', monospace" }}>{title.toUpperCase()}</p>
        <div className="flex gap-2">
          <button onClick={() => onAll(true)} className="text-[10px]" style={{ color: C.textFaint }}>tout</button>
          <button onClick={() => onAll(false)} className="text-[10px]" style={{ color: C.textFaint }}>aucun</button>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px]" style={{ color: C.textFaint }}>Aucun élément</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pl-1">
          {items.map((it) => (
            <label key={it.id} className="flex items-center gap-2 text-xs" style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
              <input type="checkbox" checked={!!selected[it.id]} onChange={() => onToggle(it.id)} /> {it.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ================= VUE D'ENSEMBLE =================
function daysAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function OverviewSection({ theses, trades, onNavigate }) {
  const allInstruments = ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).filter((i) => !i.archived).map((i) => ({ ...i, clsLabel: cls.label })));

  const activeTheses = allInstruments
    .filter((i) => i.status === "active")
    .sort((a, b) => (b.conviction || 0) - (a.conviction || 0));

  const latestIdeas = [...allInstruments]
    .filter((i) => i.createdAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  const toReview = allInstruments
    .filter((i) => i.updatedAt && daysAgo(i.updatedAt) > FRESHNESS_DAYS)
    .sort((a, b) => daysAgo(b.updatedAt) - daysAgo(a.updatedAt));

  const openTrades = trades.filter((t) => (t.resultStatus || "en_cours") === "en_cours");

  const Block = ({ title, children, isEmpty, empty }) => (
    <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{title}</p>
      {isEmpty ? <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{empty}</p> : children}
    </div>
  );

  return (
    <div>
      <Block title={`Thèses actives — ${activeTheses.length}`} isEmpty={activeTheses.length === 0} empty="Aucune thèse marquée « Active » pour l'instant.">
        <div className="flex flex-col gap-1.5">
          {activeTheses.map((i) => {
            const dir = DIRECTIONS.find((d) => d.key === i.direction);
            return (
              <button key={i.id} onClick={() => onNavigate("thesis")} className="flex items-center justify-between text-left text-sm px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }}>
                <span>{i.symbol || "(sans nom)"} {dir && <span style={{ color: dir.color }}>— {dir.label}</span>}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint }}>{i.conviction ? `${i.conviction}/10` : "—"}</span>
              </button>
            );
          })}
        </div>
      </Block>

      <Block title="Dernières idées" isEmpty={latestIdeas.length === 0} empty="Aucune idée datée pour l'instant.">
        <div className="flex flex-col gap-1.5">
          {latestIdeas.map((i) => (
            <button key={i.id} onClick={() => onNavigate("thesis")} className="flex items-center justify-between text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }}>
              <span>{i.symbol || "(sans nom)"}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint }}>créée il y a {daysAgo(i.createdAt)} j</span>
            </button>
          ))}
        </div>
      </Block>

      <Block title="À revoir" isEmpty={toReview.length === 0} empty="Tout est à jour.">
        <div className="flex flex-col gap-1.5">
          {toReview.map((i) => (
            <button key={i.id} onClick={() => onNavigate("thesis")} className="flex items-center justify-between text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.stale}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.stale }}>
              <span>{i.symbol || "(sans nom)"}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>dernière mise à jour il y a {daysAgo(i.updatedAt)} j</span>
            </button>
          ))}
        </div>
      </Block>

      <Block title={`Trades en cours — ${openTrades.length}`} isEmpty={openTrades.length === 0} empty="Aucun trade en cours.">
        <div className="flex flex-col gap-1.5">
          {openTrades.map((t) => (
            <button key={t.id} onClick={() => onNavigate("trades")} className="text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }}>
              {t.ticker || "(sans nom)"}
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

function ExportModal({ selection, setSelection, drivers, theses, trades, notebook, autoBackups, onRestoreAutoBackup, onClose }) {
  const toggle = (group, id) => setSelection((prev) => ({ ...prev, [group]: { ...prev[group], [id]: !prev[group][id] } }));
  const toggleGlobal = () => setSelection((prev) => ({ ...prev, global: !prev.global }));
  const selectAll = (group, ids, value) => setSelection((prev) => ({ ...prev, [group]: Object.fromEntries(ids.map((id) => [id, value])) }));
  const allInstruments = ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).map((inst) => ({ ...inst, clsLabel: cls.label })));
  const notes = notebook?.notes || [];

  return (
    <div className="export-modal fixed inset-0 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="rounded-xl p-5 w-full max-w-lg max-h-[85vh] overflow-y-auto" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary, fontSize: "1.1rem" }}>Exporter en PDF</h3>
          <button onClick={onClose}><X size={16} color={C.textFaint} /></button>
        </div>
        <p className="text-xs mb-3" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          Coche ce que tu veux inclure, puis génère l'aperçu — ça ouvre la boîte d'impression de ton navigateur, où tu peux enregistrer en PDF.
        </p>
        <label className="flex items-center gap-2 text-sm mb-3" style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <input type="checkbox" checked={selection.global} onChange={toggleGlobal} /> Vue d'ensemble globale des marchés
        </label>
        <ExportGroup title="Drivers Macro" items={drivers.map((d) => ({ id: d.id, label: d.name || "(sans nom)" }))} selected={selection.drivers} onToggle={(id) => toggle("drivers", id)} onAll={(v) => selectAll("drivers", drivers.map((d) => d.id), v)} />
        <ExportGroup title="Thèse Macro par instrument" items={allInstruments.map((i) => ({ id: i.id, label: `${i.clsLabel} · ${i.symbol || "(sans nom)"}` }))} selected={selection.instruments} onToggle={(id) => toggle("instruments", id)} onAll={(v) => selectAll("instruments", allInstruments.map((i) => i.id), v)} />
        <ExportGroup title="Trades" items={trades.map((t) => ({ id: t.id, label: t.ticker || "(sans nom)" }))} selected={selection.trades} onToggle={(id) => toggle("trades", id)} onAll={(v) => selectAll("trades", trades.map((t) => t.id), v)} />
        <ExportGroup title="Bloc-Note" items={notes.map((n) => ({ id: n.id, label: n.title || "(sans titre)" }))} selected={selection.notes} onToggle={(id) => toggle("notes", id)} onAll={(v) => selectAll("notes", notes.map((n) => n.id), v)} />
        <button onClick={() => { onClose(); setTimeout(() => window.print(), 200); }} className="w-full mt-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: C.gold, color: C.ink, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          Générer l'aperçu d'impression
        </button>

        {autoBackups && autoBackups.length > 0 && (
          <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
            <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>Sauvegardes automatiques</p>
            <div className="flex flex-col gap-1.5">
              {[...autoBackups].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((ab) => (
                <div key={ab.slot} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-md" style={{ border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }}>
                  <span>{formatDate(ab.timestamp)} · {new Date(ab.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                  <button onClick={() => onRestoreAutoBackup(ab.slot)} className="px-2 py-0.5 rounded" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>Restaurer</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PrintView({ selection, drivers, globalThesis, theses, trades, notebook }) {
  const allInstruments = ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).map((inst) => ({ ...inst, clsLabel: cls.label })));
  const sDrivers = drivers.filter((d) => selection.drivers[d.id]);
  const sInstr = allInstruments.filter((i) => selection.instruments[i.id]);
  const sTrades = trades.filter((t) => selection.trades[t.id]);
  const sNotes = (notebook?.notes || []).filter((n) => selection.notes && selection.notes[n.id]);

  return (
    <div className="print-view" style={{ backgroundColor: "#fff", color: "#111", padding: "2rem", fontFamily: "Georgia, serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Desk Macro — Export</h1>
      {selection.global && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Vue d'ensemble globale</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{globalThesis.content.text}</p>
        </section>
      )}
      {sDrivers.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Drivers Macro</h2>
          {sDrivers.map((d) => (
            <div key={d.id} style={{ marginBottom: 8 }}>
              <strong>{d.name}</strong> {d.isMain && "(principal)"}
              <p>{d.content?.text || d.description}</p>
              <p style={{ fontSize: "0.85rem", color: "#555" }}>{d.assetClasses.join(", ")}</p>
            </div>
          ))}
        </section>
      )}
      {sInstr.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Thèse Macro</h2>
          {sInstr.map((i) => (
            <div key={i.id} style={{ marginBottom: 12 }}>
              <strong>{i.clsLabel} · {i.symbol}</strong> — {DIRECTIONS.find((d) => d.key === i.direction)?.label || ""} · {THESIS_STATUSES.find((s) => s.key === i.status)?.label || ""} · Conviction {i.conviction || "—"}/10 · {HORIZONS.find((h) => h.key === i.horizon)?.label || ""}
              {i.createdAt && <p style={{ fontSize: "0.8rem", color: "#555" }}>Créée le {formatDate(i.createdAt)}</p>}
              {i.context && <p><em>Contexte :</em> {i.context}</p>}
              <p style={{ whiteSpace: "pre-wrap" }}>{i.content.text}</p>
              {i.argumentsFor && <p><em>Pour :</em> {i.argumentsFor}</p>}
              {i.argumentsAgainst && <p><em>Contre :</em> {i.argumentsAgainst}</p>}
              {i.catalysts && <p><em>Catalyseurs :</em> {i.catalysts}</p>}
              {i.risks && <p><em>Risques :</em> {i.risks}</p>}
            </div>
          ))}
        </section>
      )}
      {sTrades.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Trades</h2>
          {sTrades.map((t) => (
            <div key={t.id} style={{ marginBottom: 12 }}>
              <strong>{t.ticker}</strong> — {t.direction || ""} · {t.conviction || ""} · {t.horizon || ""}
              <p><em>Raisons :</em> {t.reasons?.text}</p>
              <p><em>Attentes :</em> {t.expectations}</p>
              <p style={{ fontSize: "0.85rem", color: "#555" }}>Entrée {t.entry || "—"} · Stop {t.stop || "—"} · TP {t.takeProfit || "—"} · Taille {t.size || "—"} · Risque {t.riskPercent || "—"}</p>
              <p><em>Résultat :</em> {TRADE_RESULTS.find((r) => r.key === t.resultStatus)?.label || ""} {t.result ? `(${t.result})` : ""}</p>
              {t.postComment?.text && <p><em>Post-trade :</em> {t.postComment.text}</p>}
            </div>
          ))}
        </section>
      )}
      {sNotes.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Bloc-Note</h2>
          {sNotes.map((n) => (
            <div key={n.id} style={{ marginBottom: 8 }}>
              <strong>{n.title || "(sans titre)"}</strong> {n.tags?.length > 0 && <span style={{ fontSize: "0.85rem", color: "#555" }}>— {n.tags.map((t) => `#${t}`).join(" ")}</span>}
              <p style={{ whiteSpace: "pre-wrap" }}>{n.content?.text}</p>
              {n.checklist?.length > 0 && <ul>{n.checklist.map((c) => (<li key={c.id}>{c.done ? "☑" : "☐"} {c.text}</li>))}</ul>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

// ---------- Main App ----------
function Dashboard({ userEmail, onLogout }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [notebook, setNotebook] = useState({ notes: [], folders: [] });
  const [drivers, setDrivers] = useState([]);
  const [globalThesis, setGlobalThesis] = useState({ content: emptyContent(), updatedAt: null, history: [] });
  const [theses, setTheses] = useState(seedTheses());
  const [trades, setTrades] = useState([]);
  const [watchlists, setWatchlists] = useState([]);
  const [autoBackups, setAutoBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [showExport, setShowExport] = useState(false);
  const [exportSelection, setExportSelection] = useState({ global: false, drivers: {}, instruments: {}, trades: {}, notes: {} });
  const [searchQuery, setSearchQuery] = useState("");
  const saveTimeouts = useRef({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [nb, d, gt, th, tr, wl, ab] = await Promise.allSettled([
          storageGet("notebook-data-v1"),
          storageGet("drivers-data"),
          storageGet("global-thesis-data-v2"),
          storageGet("theses-data-v2"),
          storageGet("trades-data-v2"),
          storageGet("watchlists-data-v1"),
          storageGet("autobackup-index"),
        ]);
        if (nb.status === "fulfilled" && nb.value?.value) setNotebook(JSON.parse(nb.value.value));
        if (d.status === "fulfilled" && d.value?.value) setDrivers(JSON.parse(d.value.value));
        if (gt.status === "fulfilled" && gt.value?.value) {
          const parsed = JSON.parse(gt.value.value);
          setGlobalThesis({ content: ensureContent(parsed.content), updatedAt: parsed.updatedAt || null, history: parsed.history || [] });
        }
        if (th.status === "fulfilled" && th.value?.value) setTheses(JSON.parse(th.value.value));
        if (tr.status === "fulfilled" && tr.value?.value) {
          const parsed = JSON.parse(tr.value.value);
          setTrades(parsed.map((t) => ({ ...t, reasons: ensureContent(t.reasons) })));
        }
        if (wl.status === "fulfilled" && wl.value?.value) setWatchlists(JSON.parse(wl.value.value));
        if (ab.status === "fulfilled" && ab.value?.value) setAutoBackups(JSON.parse(ab.value.value));
      } catch (err) {
        // ignore — keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = useCallback((key, data) => {
    setSaveState("saving");
    clearTimeout(saveTimeouts.current[key]);
    saveTimeouts.current[key] = setTimeout(async () => {
      try {
        await storageSet(key, JSON.stringify(data));
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1200);
      } catch (err) {
        setSaveState("idle");
      }
    }, 400);
  }, []);

  // ---- Sauvegarde automatique périodique (indépendante de persist, silencieuse) ----
  const stateRef = useRef();
  stateRef.current = { notebook, drivers, globalThesis, theses, trades, watchlists };
  const autoBackupsRef = useRef(autoBackups);
  useEffect(() => { autoBackupsRef.current = autoBackups; }, [autoBackups]);

  useEffect(() => {
    const AUTO_BACKUP_SLOTS = 5;
    const runBackup = async () => {
      const payload = { ...stateRef.current, exportedAt: new Date().toISOString() };
      const prev = autoBackupsRef.current;
      const nextSlot = prev.length > 0 ? (Math.max(...prev.map((x) => x.slot)) + 1) % AUTO_BACKUP_SLOTS : 0;
      const nextIndex = [...prev.filter((x) => x.slot !== nextSlot), { slot: nextSlot, timestamp: payload.exportedAt }].sort((a, b) => a.slot - b.slot);
      try {
        await storageSet(`autobackup-slot-${nextSlot}`, JSON.stringify(payload));
        await storageSet("autobackup-index", JSON.stringify(nextIndex));
        autoBackupsRef.current = nextIndex;
        setAutoBackups(nextIndex);
      } catch (err) {
        // silencieux — on retentera au prochain cycle
      }
    };
    const interval = setInterval(runBackup, 5 * 60 * 1000); // toutes les 5 minutes
    const initial = setTimeout(runBackup, 60 * 1000); // une première sauvegarde peu après l'ouverture
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, []);

  const restoreAutoBackup = async (slot) => {
    if (!window.confirm("Restaurer cette sauvegarde automatique ? Ça va remplacer les données actuelles par celles de ce moment-là.")) return;
    try {
      const res = await storageGet(`autobackup-slot-${slot}`);
      if (!res?.value) { window.alert("Sauvegarde introuvable."); return; }
      const data = JSON.parse(res.value);
      if (data.notebook) { setNotebook(data.notebook); persist("notebook-data-v1", data.notebook); }
      if (data.drivers) { setDrivers(data.drivers); persist("drivers-data", data.drivers); }
      if (data.globalThesis) { setGlobalThesis(data.globalThesis); persist("global-thesis-data-v2", data.globalThesis); }
      if (data.theses) { setTheses(data.theses); persist("theses-data-v2", data.theses); }
      if (data.trades) { setTrades(data.trades); persist("trades-data-v2", data.trades); }
      if (data.watchlists) { setWatchlists(data.watchlists); persist("watchlists-data-v1", data.watchlists); }
      window.alert("Sauvegarde restaurée.");
    } catch (err) {
      window.alert("Impossible de restaurer cette sauvegarde.");
    }
  };

  const updateNotebook = (updated) => { setNotebook(updated); persist("notebook-data-v1", updated); };
  const addNote = () => {
    const next = { ...notebook, notes: [...(notebook.notes || []), { id: uid(), title: "", content: emptyContent(), tags: [], checklist: [], folderId: null, pinned: false, archived: false, history: [], updatedAt: new Date().toISOString() }] };
    updateNotebook(next);
  };
  const deleteNote = (id) => {
    if (!window.confirm("Supprimer cette note ?")) return;
    updateNotebook({ ...notebook, notes: (notebook.notes || []).filter((n) => n.id !== id) });
  };
  const addFolder = () => {
    const name = window.prompt("Nom du dossier :");
    if (!name) return;
    updateNotebook({ ...notebook, folders: [...(notebook.folders || []), { id: uid(), name }] });
  };
  const deleteFolder = (id) => {
    if (!window.confirm("Supprimer ce dossier ? Les notes qu'il contient repasseront en \"Sans dossier\".")) return;
    const next = {
      ...notebook,
      folders: (notebook.folders || []).filter((f) => f.id !== id),
      notes: (notebook.notes || []).map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
    };
    updateNotebook(next);
  };

  const addWatchlist = () => {
    const name = window.prompt("Nom de la watchlist (ex. Ma sélection, Setups en attente...) :");
    if (!name) return;
    const next = [...watchlists, { id: uid(), name, items: [], updatedAt: new Date().toISOString() }];
    setWatchlists(next); persist("watchlists-data-v1", next);
  };
  const updateWatchlist = (updated) => { const next = watchlists.map((w) => (w.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : w)); setWatchlists(next); persist("watchlists-data-v1", next); };
  const deleteWatchlist = (id) => {
    if (!window.confirm("Supprimer cette watchlist ?")) return;
    const next = watchlists.filter((w) => w.id !== id);
    setWatchlists(next); persist("watchlists-data-v1", next);
  };

  const addDriver = () => { const next = [...drivers, { id: uid(), name: "", content: emptyContent(), history: [], isMain: false, assetClasses: [], updatedAt: new Date().toISOString() }]; setDrivers(next); persist("drivers-data", next); };
  const updateDriver = (id, updated) => { const next = drivers.map((d) => (d.id === id ? { ...updated, updatedAt: new Date().toISOString() } : d)); setDrivers(next); persist("drivers-data", next); };
  const deleteDriver = (id) => { const next = drivers.filter((d) => d.id !== id); setDrivers(next); persist("drivers-data", next); };
  const setMainDriver = (id) => { const next = drivers.map((d) => ({ ...d, isMain: d.id === id ? !d.isMain : false })); setDrivers(next); persist("drivers-data", next); };

  const updateGlobalThesis = (content) => { const next = { ...globalThesis, content, updatedAt: new Date().toISOString() }; setGlobalThesis(next); persist("global-thesis-data-v2", next); };
  const snapshotGlobalThesis = (text) => {
    if (!text || !text.trim()) return;
    const last = globalThesis.history?.[globalThesis.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(globalThesis.history || []), { date: new Date().toISOString(), text }].slice(-15);
    const next = { ...globalThesis, history };
    setGlobalThesis(next); persist("global-thesis-data-v2", next);
  };
  const updateGlobalThesisHistoryEntry = (idx, text) => {
    const history = globalThesis.history.map((h, i) => (i === idx ? { ...h, text } : h));
    const next = { ...globalThesis, history };
    setGlobalThesis(next); persist("global-thesis-data-v2", next);
  };
  const deleteGlobalThesisHistoryEntry = (idx) => {
    const history = globalThesis.history.filter((_, i) => i !== idx);
    const next = { ...globalThesis, history };
    setGlobalThesis(next); persist("global-thesis-data-v2", next);
  };
  const updateInstrument = (clsId, instId, updatedInst) => {
    const next = { ...theses, [clsId]: { instruments: theses[clsId].instruments.map((i) => (i.id === instId ? updatedInst : i)) } };
    setTheses(next); persist("theses-data-v2", next);
  };
  const addInstrument = (clsId) => {
    const symbol = window.prompt("Symbole (ex. USD, BTC, AAPL...) :");
    if (!symbol) return;
    const next = {
      ...theses,
      [clsId]: {
        instruments: [
          ...theses[clsId].instruments,
          {
            id: uid(),
            symbol,
            content: emptyContent(),
            history: [],
            archived: false,
            direction: null,
            status: "idee",
            conviction: null,
            horizon: null,
            context: "",
            argumentsFor: "",
            argumentsAgainst: "",
            catalysts: "",
            risks: "",
            originalSnapshot: null,
            createdAt: new Date().toISOString(),
            updatedAt: null,
          },
        ],
      },
    };
    setTheses(next); persist("theses-data-v2", next);
  };
  const deleteInstrument = (clsId, instId) => {
    const next = { ...theses, [clsId]: { instruments: theses[clsId].instruments.filter((i) => i.id !== instId) } };
    setTheses(next); persist("theses-data-v2", next);
  };

  const addTrade = () => {
    const next = [
      ...trades,
      {
        id: uid(),
        ticker: "",
        assetClass: "",
        direction: null,
        conviction: null,
        horizon: null,
        reasons: emptyContent(),
        expectations: "",
        entry: "",
        stop: "",
        takeProfit: "",
        size: "",
        riskPercent: "",
        resultStatus: "en_cours",
        result: "",
        postComment: emptyContent(),
        updatedAt: new Date().toISOString(),
      },
    ];
    setTrades(next); persist("trades-data-v2", next);
  };
  const updateTrade = (updated) => { const next = trades.map((t) => (t.id === updated.id ? updated : t)); setTrades(next); persist("trades-data-v2", next); };
  const deleteTrade = (id) => { const next = trades.filter((t) => t.id !== id); setTrades(next); persist("trades-data-v2", next); };

  const exportBackup = () => {
    const payload = { notebook, drivers, globalThesis, theses, trades, watchlists, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `desk-macro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.notebook) { setNotebook(data.notebook); persist("notebook-data-v1", data.notebook); }
        if (data.drivers) { setDrivers(data.drivers); persist("drivers-data", data.drivers); }
        if (data.globalThesis) { setGlobalThesis(data.globalThesis); persist("global-thesis-data-v2", data.globalThesis); }
        if (data.theses) { setTheses(data.theses); persist("theses-data-v2", data.theses); }
        if (data.trades) { setTrades(data.trades); persist("trades-data-v2", data.trades); }
        if (data.watchlists) { setWatchlists(data.watchlists); persist("watchlists-data-v1", data.watchlists); }
        window.alert("Sauvegarde importée avec succès.");
      } catch (err) {
        window.alert("Fichier invalide — impossible de lire cette sauvegarde.");
      }
    };
    reader.readAsText(file);
  };

  const refOptions = [
    ...drivers.filter((d) => d.name).map((d) => ({ id: d.id, type: "driver", label: `Driver · ${d.name}` })),
    ...ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).filter((i) => i.symbol).map((i) => ({ id: i.id, type: "instrument", label: `Thèse · ${cls.label} · ${i.symbol}` }))),
    ...trades.filter((t) => t.ticker).map((t) => ({ id: t.id, type: "trade", label: `Trade · ${t.ticker}` })),
  ];
  const onNavigateRef = (type) => setActiveTab(type === "driver" ? "drivers" : type === "instrument" ? "thesis" : "trades");

  const activeItem = NAV_ITEMS.find((n) => n.id === activeTab);

  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    drivers.forEach((d) => { if (d.name && d.name.toLowerCase().includes(q)) results.push({ tab: "drivers", label: `Driver · ${d.name}` }); });
    ASSET_CLASS_DEFS.forEach((cls) => (theses[cls.id]?.instruments || []).forEach((i) => { if (i.symbol && i.symbol.toLowerCase().includes(q)) results.push({ tab: "thesis", label: `Thèse · ${cls.label} · ${i.symbol}` }); }));
    trades.forEach((t) => { if (t.ticker && t.ticker.toLowerCase().includes(q)) results.push({ tab: "trades", label: `Trade · ${t.ticker}` }); });
    watchlists.forEach((w) => w.items.forEach((i) => { if (i.symbol && i.symbol.toLowerCase().includes(q)) results.push({ tab: "watchlist", label: `Watchlist · ${w.name} · ${i.symbol}` }); }));
    (notebook.notes || []).forEach((n) => { if ((n.title && n.title.toLowerCase().includes(q)) || (n.tags || []).some((t) => t.toLowerCase().includes(q))) results.push({ tab: "notebook", label: `Note · ${n.title || "(sans titre)"}` }); });
    return results.slice(0, 12);
  })();
  const subtitles = {
    overview: "Ce qui mérite ton attention, agrégé automatiquement depuis tout le desk.",
    drivers: "Les forces qui font bouger le marché en ce moment — et laquelle domine.",
    thesis: "Ta lecture macro, par instrument et pour l'ensemble des marchés.",
    trades: "Chaque trade, sa thèse fondamentale, ses raisons et tes attentes.",
    watchlist: "Tes propres listes d'instruments à surveiller, remplies comme tu veux.",
    notebook: "Tes notes libres — dossiers, tags, checklists, tout ce que tu veux garder sous la main.",
  };

  return (
    <div className="w-full min-h-screen" style={{ backgroundColor: C.ink }}>
      <style>{FONTS + PRINT_CSS}</style>

      <div className="app-shell flex min-h-screen">
        <aside className="w-56 flex-shrink-0 flex flex-col py-6 px-3" style={{ backgroundColor: C.surface, borderRight: `1px solid ${C.border}` }}>
          <div className="px-2 mb-6">
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: C.textPrimary, fontSize: "1.05rem", lineHeight: 1.2 }}>Desk Macro</h1>
            <p className="text-[11px] mt-0.5" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>analyse fondamentale</p>
          </div>

          <div className="px-2 mb-3 relative">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}` }}>
              <Search size={13} color={C.textFaint} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="bg-transparent outline-none text-xs flex-1"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }}
              />
              {searchQuery && <button onClick={() => setSearchQuery("")}><X size={12} color={C.textFaint} /></button>}
            </div>
            {searchQuery && (
              <div className="absolute left-2 right-2 mt-1 rounded-lg overflow-hidden z-10" style={{ backgroundColor: C.surfaceRaised, border: `1px solid ${C.border}` }}>
                {searchResults.length === 0 ? (
                  <p className="text-[11px] px-2 py-2" style={{ color: C.textFaint }}>Aucun résultat</p>
                ) : (
                  searchResults.map((r, i) => (
                    <button key={i} onClick={() => { setActiveTab(r.tab); setSearchQuery(""); }} className="block w-full text-left px-2 py-1.5 text-xs" style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                      {r.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors" style={{ fontFamily: "'IBM Plex Sans', sans-serif", backgroundColor: active ? C.surfaceRaised : "transparent", color: active ? C.textPrimary : C.textSecondary }}>
                  <Icon size={16} strokeWidth={1.75} /> <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <button onClick={() => setShowExport(true)} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mt-3" style={{ color: C.textSecondary, border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <Download size={15} strokeWidth={1.75} /> Exporter en PDF
          </button>

          <button onClick={exportBackup} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mt-2" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <Download size={15} strokeWidth={1.75} /> Sauvegarder (JSON)
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm mt-2" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            Importer une sauvegarde
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importBackup(f); e.target.value = ""; }} />

          <div className="mt-auto px-2.5 text-[11px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>
            {saveState === "saving" && <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> sauvegarde...</span>}
            {saveState === "saved" && <span>✓ enregistré</span>}
          </div>
          <div className="px-2.5 mt-2 flex items-center justify-between">
            <span className="text-[10px] truncate" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{userEmail}</span>
            <button onClick={onLogout} title="Se déconnecter" style={{ color: C.textFaint }}><LogOut size={13} /></button>
          </div>
        </aside>

        <main className="flex-1 px-8 py-6 overflow-y-auto">
          <div className="max-w-4xl">
            <SectionHeading title={activeItem.label} subtitle={subtitles[activeTab]} />
            {loading ? (
              <div className="flex items-center gap-2 mt-10" style={{ color: C.textFaint }}><Loader2 size={16} className="animate-spin" /> chargement...</div>
            ) : activeTab === "overview" ? (
              <OverviewSection theses={theses} trades={trades} onNavigate={setActiveTab} />
            ) : activeTab === "drivers" ? (
              <DriversSection drivers={drivers} onUpdate={updateDriver} onAdd={addDriver} onDelete={deleteDriver} onSetMain={setMainDriver} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "thesis" ? (
              <ThesisSection globalThesis={globalThesis} onUpdateGlobal={updateGlobalThesis} onSnapshotGlobal={snapshotGlobalThesis} onUpdateGlobalHistoryEntry={updateGlobalThesisHistoryEntry} onDeleteGlobalHistoryEntry={deleteGlobalThesisHistoryEntry} theses={theses} onUpdateInstrument={updateInstrument} onAddInstrument={addInstrument} onDeleteInstrument={deleteInstrument} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "trades" ? (
              <TradesSection trades={trades} onUpdate={updateTrade} onAdd={addTrade} onDelete={deleteTrade} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "watchlist" ? (
              <WatchlistSection watchlists={watchlists} onUpdate={updateWatchlist} onAdd={addWatchlist} onDelete={deleteWatchlist} />
            ) : (
              <NotebookSection notebook={notebook} onUpdate={updateNotebook} onAddNote={addNote} onDeleteNote={deleteNote} onAddFolder={addFolder} onDeleteFolder={deleteFolder} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            )}
          </div>
        </main>
      </div>

      <PrintView selection={exportSelection} drivers={drivers} globalThesis={globalThesis} theses={theses} trades={trades} notebook={notebook} />
      {showExport && <ExportModal selection={exportSelection} setSelection={setExportSelection} drivers={drivers} theses={theses} trades={trades} notebook={notebook} autoBackups={autoBackups} onRestoreAutoBackup={restoreAutoBackup} onClose={() => setShowExport(false)} />}
    </div>
  );
}

// ================= AUTHENTIFICATION =================
function LoginScreen({ onLogin, error, loading }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: C.ink }}>
      <style>{FONTS}</style>
      <form
        onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}
        className="rounded-xl p-6 w-full max-w-xs"
        style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}
      >
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, color: C.textPrimary, fontSize: "1.2rem" }}>Desk Macro</h1>
        <p className="text-xs mb-4" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Connexion requise</p>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
          className="w-full text-sm px-3 py-2 rounded-lg mb-2 bg-transparent outline-none"
          style={{ border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}
        />
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" required
          className="w-full text-sm px-3 py-2 rounded-lg mb-3 bg-transparent outline-none"
          style={{ border: `1px solid ${C.border}`, color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}
        />
        {error && <p className="text-xs mb-2" style={{ color: C.stale }}>{error}</p>}
        <button type="submit" disabled={loading} className="w-full py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: C.gold, color: C.ink, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
        <p className="text-[11px] mt-3" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          Le compte se crée depuis la console Firebase (Authentication → Users → Add user) — voir le README.
        </p>
      </form>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setChecking(false); });
    return unsub;
  }, []);

  const handleLogin = async (email, password) => {
    setLoginError("");
    setLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError("Email ou mot de passe incorrect.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => signOut(auth);

  if (checking) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center" style={{ backgroundColor: C.ink }}>
        <Loader2 size={20} className="animate-spin" color={C.textFaint} />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loggingIn} />;
  }

  return <Dashboard userEmail={user.email} onLogout={handleLogout} />;
}
