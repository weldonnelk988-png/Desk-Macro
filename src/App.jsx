import React, { useState, useEffect, useCallback, useRef } from "react";
import { Landmark, BarChart3, Compass, ScrollText, Target, Plus, X, ChevronDown, ChevronRight, Loader2, Star, Globe2, Download, Link2, Image as ImageIcon, Search, LogOut, Eye, AlertTriangle } from "lucide-react";
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
function HistoryList({ history }) {
  const [open, setOpen] = useState(false);
  if (!history || history.length === 0) return null;
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[11px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />} Historique ({history.length})
      </button>
      {open && (
        <div className="mt-1 pl-3 flex flex-col gap-1.5" style={{ borderLeft: `1px solid ${C.border}` }}>
          {[...history].reverse().map((h, i) => (
            <div key={i}>
              <p className="text-[10px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{formatDate(h.date)}</p>
              <p className="text-xs" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>{h.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Seed data ----------
const SEED_BANKS = [
  { code: "FED", name: "Réserve fédérale", zone: "États-Unis" },
  { code: "BCE", name: "Banque centrale européenne", zone: "Zone euro" },
  { code: "BoE", name: "Bank of England", zone: "Royaume-Uni" },
  { code: "BoJ", name: "Bank of Japan", zone: "Japon" },
  { code: "BoC", name: "Banque du Canada", zone: "Canada" },
  { code: "RBA", name: "Reserve Bank of Australia", zone: "Australie" },
  { code: "RBNZ", name: "Reserve Bank of New Zealand", zone: "Nouvelle-Zélande" },
  { code: "SNB", name: "Banque nationale suisse", zone: "Suisse" },
].map((b, i) => ({ id: `bank-${i}`, ...b, bias: null, members: [], updatedAt: null }));

const ECON_CATEGORIES = [
  { id: "inflation", label: "Inflation" },
  { id: "emploi", label: "Emploi" },
  { id: "croissance", label: "Croissance" },
  { id: "activite", label: "Activité (PMI & co)" },
  { id: "confiance", label: "Confiance / Sentiment" },
];

const SEED_ECONOMIES = [
  { code: "US", name: "États-Unis" },
  { code: "EUR", name: "Zone euro" },
  { code: "UK", name: "Royaume-Uni" },
  { code: "JP", name: "Japon" },
  { code: "CN", name: "Chine" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australie" },
  { code: "NZ", name: "Nouvelle-Zélande" },
  { code: "CH", name: "Suisse" },
].map((e, i) => ({ id: `econ-${i}`, ...e, updatedAt: null, categories: ECON_CATEGORIES.map((c) => ({ ...c, indicators: [] })) }));

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
    obj[cls.id] = { instruments: cls.seeds.map((s, i) => ({ id: `${cls.id}-${i}`, symbol: s, content: emptyContent(), history: [], updatedAt: null })) };
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

const NAV_ITEMS = [
  { id: "overview", label: "Vue d'ensemble", icon: AlertTriangle },
  { id: "banks", label: "Banques Centrales", icon: Landmark },
  { id: "data", label: "Data Économique", icon: BarChart3 },
  { id: "drivers", label: "Drivers Macro", icon: Compass },
  { id: "thesis", label: "Thèse Macro", icon: ScrollText },
  { id: "trades", label: "Trades", icon: Target },
  { id: "watchlist", label: "Watchlist", icon: Eye },
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

function SectionHeading({ title, subtitle }) {
  return (
    <>
      <h2 className="text-2xl mb-1" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }}>{title}</h2>
      {subtitle && <p className="text-sm mb-6" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>{subtitle}</p>}
    </>
  );
}

// Reusable rich content editor: text + images (url) + links + @ references to Banks/Data/Drivers
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
  const refColor = { bank: C.hawk, driver: C.gold, data: C.dove, instrument: C.neutral, trade: C.trade };

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
          {refOptions.filter((o) => o.type === "bank").length > 0 && (
            <optgroup label="Banques Centrales" style={{ color: "#000" }}>
              {refOptions.filter((o) => o.type === "bank").map((o) => (<option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`} style={{ color: "#000" }}>{o.label}</option>))}
            </optgroup>
          )}
          {refOptions.filter((o) => o.type === "data").length > 0 && (
            <optgroup label="Data Économique" style={{ color: "#000" }}>
              {refOptions.filter((o) => o.type === "data").map((o) => (<option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`} style={{ color: "#000" }}>{o.label}</option>))}
            </optgroup>
          )}
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

// ================= BANQUES CENTRALES =================
function VoteBar({ members }) {
  const hawks = members.filter((m) => m.vote === "hawkish").length;
  const doves = members.filter((m) => m.vote === "dovish").length;
  const neutrals = members.filter((m) => m.vote === "neutral").length;
  const total = hawks + doves + neutrals;
  if (total === 0) return <div className="w-full h-2 rounded-full" style={{ backgroundColor: C.border }} />;
  return (
    <div>
      <div className="w-full h-2 rounded-full overflow-hidden flex" style={{ backgroundColor: C.border }}>
        {hawks > 0 && <div style={{ width: `${(hawks / total) * 100}%`, backgroundColor: C.hawk }} />}
        {neutrals > 0 && <div style={{ width: `${(neutrals / total) * 100}%`, backgroundColor: C.neutral }} />}
        {doves > 0 && <div style={{ width: `${(doves / total) * 100}%`, backgroundColor: C.dove }} />}
      </div>
      <div className="flex gap-3 mt-1.5 text-[11px]" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
        <span style={{ color: C.hawk }}>{hawks} hawk{hawks > 1 ? "s" : ""}</span>
        <span style={{ color: C.dove }}>{doves} dove{doves > 1 ? "s" : ""}</span>
        {neutrals > 0 && <span style={{ color: C.neutral }}>{neutrals} neutre{neutrals > 1 ? "s" : ""}</span>}
      </div>
    </div>
  );
}

function MemberRow({ member, onUpdate, onDelete }) {
  const [editingNote, setEditingNote] = useState(false);
  const voteColors = { hawkish: C.hawk, dovish: C.dove, neutral: C.neutral };
  return (
    <div className="rounded-lg p-3 mb-2" style={{ backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input value={member.name} onChange={(e) => onUpdate({ ...member, name: e.target.value })} placeholder="Nom du membre" className="bg-transparent outline-none w-full text-sm font-medium" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }} />
          <input value={member.role} onChange={(e) => onUpdate({ ...member, role: e.target.value })} placeholder="Fonction (ex. Présidente, Gouverneur...)" className="bg-transparent outline-none w-full text-xs mt-0.5" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textFaint }} />
        </div>
        <button onClick={onDelete} className="p-1 rounded hover:opacity-70 flex-shrink-0" style={{ color: C.textFaint }}><X size={14} /></button>
      </div>
      <div className="flex gap-1.5 mt-2">
        {["hawkish", "dovish", "neutral"].map((v) => (
          <button key={v} onClick={() => onUpdate({ ...member, vote: member.vote === v ? null : v })} className="px-2 py-1 rounded text-[11px] font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: member.vote === v ? voteColors[v] : "transparent", color: member.vote === v ? C.ink : C.textSecondary, border: `1px solid ${member.vote === v ? voteColors[v] : C.border}` }}>
            {v === "hawkish" ? "Hawk" : v === "dovish" ? "Dove" : "Neutre"}
          </button>
        ))}
      </div>
      <div className="mt-2">
        {editingNote || member.note ? (
          <textarea value={member.note} onChange={(e) => onUpdate({ ...member, note: e.target.value })} onBlur={() => setEditingNote(false)} placeholder="Note (ex. déclaration du 12/08...)" className="bg-transparent outline-none w-full text-xs resize-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }} rows={2} autoFocus={editingNote} />
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-[11px]" style={{ color: C.textFaint }}>+ ajouter une note</button>
        )}
      </div>
    </div>
  );
}

function RateExpectationsBlock({ bank, onUpdate }) {
  const touch = (patch) => onUpdate({ ...bank, ...patch, updatedAt: new Date().toISOString() });
  const exp = bank.marketExpectations || { meeting1: "", meeting2: "", year2026: "", strength: null };
  const updateExp = (patch) => touch({ marketExpectations: { ...exp, ...patch } });
  const strengthOpts = [{ key: "faible", label: "Faible" }, { key: "moderee", label: "Modérée" }, { key: "forte", label: "Forte" }];
  const tension = bank.bias === "hawkish" && exp.strength === "forte";
  const inputStyle = { fontFamily: "'IBM Plex Mono', monospace", color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 7px" };
  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
      <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>Taux &amp; attentes de marché</p>
      <input
        value={bank.currentRate || ""}
        onChange={(e) => touch({ currentRate: e.target.value })}
        placeholder="Taux directeur actuel (ex. 5,25 – 5,50 %)"
        className="bg-transparent outline-none w-full text-xs mb-1.5"
        style={{ ...inputStyle, color: C.textPrimary, fontWeight: 500 }}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <input value={exp.meeting1} onChange={(e) => updateExp({ meeting1: e.target.value })} placeholder="Prochaine réunion (ex. -25 pb)" className="bg-transparent outline-none text-xs w-full" style={inputStyle} />
          <input type="date" value={exp.nextMeetingDate1 || ""} onChange={(e) => updateExp({ nextMeetingDate1: e.target.value })} title="Date de la prochaine réunion" className="bg-transparent outline-none text-[10px] w-full mt-1" style={{ ...inputStyle, color: C.textFaint }} />
        </div>
        <div>
          <input value={exp.meeting2} onChange={(e) => updateExp({ meeting2: e.target.value })} placeholder="Réunion suivante" className="bg-transparent outline-none text-xs w-full" style={inputStyle} />
          <input type="date" value={exp.nextMeetingDate2 || ""} onChange={(e) => updateExp({ nextMeetingDate2: e.target.value })} title="Date de la réunion suivante" className="bg-transparent outline-none text-[10px] w-full mt-1" style={{ ...inputStyle, color: C.textFaint }} />
        </div>
      </div>
      <input value={exp.year2026} onChange={(e) => updateExp({ year2026: e.target.value })} placeholder="Attentes fin 2026 (ex. -75 pb cumulés)" className="bg-transparent outline-none w-full text-xs mt-1.5" style={inputStyle} />
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <span className="text-[10px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Force des attentes :</span>
        {strengthOpts.map((o) => (
          <button
            key={o.key}
            onClick={() => updateExp({ strength: exp.strength === o.key ? null : o.key })}
            className="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
            style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: exp.strength === o.key ? C.gold : "transparent", color: exp.strength === o.key ? C.ink : C.textFaint, border: `1px solid ${exp.strength === o.key ? C.gold : C.border}` }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {tension && (
        <div className="mt-2 rounded-md px-2 py-1.5 text-[11px] font-medium" style={{ backgroundColor: C.stale, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}>
          ⚠ Tension : biais hawkish alors que le marché price des attentes fortes
        </div>
      )}
    </div>
  );
}

function BankCard({ bank, onUpdate }) {
  const [open, setOpen] = useState(false);
  const touch = (patch) => onUpdate({ ...bank, ...patch, updatedAt: new Date().toISOString() });
  const setBias = (bias) => touch({ bias: bank.bias === bias ? null : bias });
  const addMember = () => { touch({ members: [...bank.members, { id: uid(), name: "", role: "", vote: null, note: "" }] }); setOpen(true); };
  const updateMember = (id, updated) => touch({ members: bank.members.map((m) => (m.id === id ? updated : m)) });
  const deleteMember = (id) => touch({ members: bank.members.filter((m) => m.id !== id) });
  const biasLabel = { hawkish: "Hawkish", dovish: "Dovish", "data-dependent": "Data-dependent" };
  const biasColor = { hawkish: C.hawk, dovish: C.dove, "data-dependent": C.neutral };
  const tension = bank.bias === "hawkish" && bank.marketExpectations?.strength === "forte";

  return (
    <div className="rounded-xl p-4 overflow-hidden" style={{ backgroundColor: C.surface, border: `1px solid ${tension ? C.stale : C.border}` }}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-lg leading-none" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }}>{bank.code}</h3>
        {bank.bias && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ fontFamily: "'IBM Plex Mono', monospace", color: biasColor[bank.bias], border: `1px solid ${biasColor[bank.bias]}` }}>{biasLabel[bank.bias]}</span>}
        {bank.currentRate && <span className="text-[10px] ml-auto" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{bank.currentRate}</span>}
      </div>
      <p className="text-xs mt-0.5" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{bank.name} · {bank.zone}</p>
      <div className="flex gap-1.5 mt-3">
        <TagButton active={bank.bias === "hawkish"} color={C.hawk} label="Hawkish" onClick={() => setBias("hawkish")} />
        <TagButton active={bank.bias === "dovish"} color={C.dove} label="Dovish" onClick={() => setBias("dovish")} />
        <TagButton active={bank.bias === "data-dependent"} color={C.neutral} label="Data-dependent" onClick={() => setBias("data-dependent")} />
      </div>
      <div className="mt-3"><VoteBar members={bank.members} /></div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 mt-3 text-xs" style={{ color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Membres ({bank.members.length})
      </button>
      {open && (
        <div className="mt-2">
          {bank.members.map((m) => (<MemberRow key={m.id} member={m} onUpdate={(u) => updateMember(m.id, u)} onDelete={() => deleteMember(m.id)} />))}
          <button onClick={addMember} className="flex items-center gap-1 text-xs mt-1 px-2 py-1.5 rounded-md w-full justify-center" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <Plus size={13} /> Ajouter un membre
          </button>
        </div>
      )}
      <RateExpectationsBlock bank={bank} onUpdate={onUpdate} />
      {bank.updatedAt && <UpdatedBadge updatedAt={bank.updatedAt} />}
    </div>
  );
}

function BanksSection({ banks, onUpdateBank }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{banks.map((b) => <BankCard key={b.id} bank={b} onUpdate={onUpdateBank} />)}</div>;
}

// ================= DATA ÉCONOMIQUE =================
function SurpriseTag({ value, onChange }) {
  const opts = [{ key: "above", label: "Au-dessus", color: C.hawk }, { key: "inline", label: "En ligne", color: C.neutral }, { key: "below", label: "En dessous", color: C.dove }];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button key={o.key} onClick={() => onChange(value === o.key ? null : o.key)} className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ fontFamily: "'IBM Plex Mono', monospace", backgroundColor: value === o.key ? o.color : "transparent", color: value === o.key ? C.ink : C.textFaint, border: `1px solid ${value === o.key ? o.color : C.border}` }}>{o.label}</button>
      ))}
    </div>
  );
}

function IndicatorRow({ indicator, onUpdate, onDelete, refOptions, onNavigateRef }) {
  const content = ensureContent(indicator.content || { text: indicator.note || "" });
  const snapshot = (text) => {
    if (!text || !text.trim()) return;
    const last = indicator.history?.[indicator.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(indicator.history || []), { date: new Date().toISOString(), text }].slice(-15);
    onUpdate({ ...indicator, history });
  };
  return (
    <div className="rounded-lg p-2.5 mb-1.5" style={{ backgroundColor: C.ink, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between gap-2">
        <input value={indicator.name} onChange={(e) => onUpdate({ ...indicator, name: e.target.value })} placeholder="Nom de l'indicateur (ex. Chômage, sous-indice PMI...)" className="bg-transparent outline-none flex-1 text-sm font-medium" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }} />
        <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70 flex-shrink-0" style={{ color: C.textFaint }}><X size={13} /></button>
      </div>
      <div className="flex gap-2 mt-1.5">
        <input value={indicator.value} onChange={(e) => onUpdate({ ...indicator, value: e.target.value })} placeholder="Valeur" className="bg-transparent outline-none text-xs w-20" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px" }} />
        <input value={indicator.expected} onChange={(e) => onUpdate({ ...indicator, expected: e.target.value })} placeholder="Attendu" className="bg-transparent outline-none text-xs w-20" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px" }} />
        <input type="date" value={indicator.nextRelease || ""} onChange={(e) => onUpdate({ ...indicator, nextRelease: e.target.value })} title="Prochaine publication" className="bg-transparent outline-none text-xs flex-1" style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textSecondary, border: `1px solid ${C.border}`, borderRadius: 6, padding: "3px 6px" }} />
      </div>
      <div className="mt-1.5"><SurpriseTag value={indicator.surprise} onChange={(v) => onUpdate({ ...indicator, surprise: v })} /></div>
      <div className="mt-1.5">
        <RichContentEditor content={content} onChange={(c) => onUpdate({ ...indicator, content: c, note: undefined })} onSnapshot={snapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Note / interprétation..." rows={1} />
      </div>
      <HistoryList history={indicator.history} />
    </div>
  );
}

function CategoryBlock({ category, onUpdate, onDelete, refOptions, onNavigateRef }) {
  const [open, setOpen] = useState(false);
  const addIndicator = () => { onUpdate({ ...category, indicators: [...category.indicators, { id: uid(), name: "", value: "", expected: "", nextRelease: "", surprise: null, content: emptyContent(), history: [] }] }); setOpen(true); };
  const updateIndicator = (id, updated) => onUpdate({ ...category, indicators: category.indicators.map((i) => (i.id === id ? updated : i)) });
  const deleteIndicator = (id) => onUpdate({ ...category, indicators: category.indicators.filter((i) => i.id !== id) });
  return (
    <div className="mt-2 rounded-lg transition-colors" style={{ border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button onClick={() => setOpen(!open)} className="p-0.5 flex-shrink-0 transition-transform" style={{ color: C.textSecondary }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <input
          value={category.label}
          onChange={(e) => onUpdate({ ...category, label: e.target.value })}
          placeholder="Nom de la catégorie"
          className="bg-transparent outline-none text-xs font-medium flex-1 min-w-0"
          style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}
        />
        <span className="text-[11px] flex-shrink-0" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{category.indicators.length}</span>
        {onDelete && (
          <button onClick={onDelete} className="p-0.5 rounded flex-shrink-0 hover:opacity-70" style={{ color: C.textFaint }} title="Supprimer la catégorie">
            <X size={12} />
          </button>
        )}
      </div>
      <div style={{ maxHeight: open ? 5000 : 0, overflow: "hidden", transition: "max-height 0.25s ease" }}>
        <div className="px-2.5 pb-2.5 pt-0.5">
          {category.indicators.map((ind) => (<IndicatorRow key={ind.id} indicator={ind} onUpdate={(u) => updateIndicator(ind.id, u)} onDelete={() => deleteIndicator(ind.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />))}
          <button onClick={addIndicator} className="flex items-center gap-1 text-[11px] mt-1 px-2 py-1 rounded-md w-full justify-center transition-colors hover:opacity-80" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
            <Plus size={12} /> Ajouter un indicateur
          </button>
        </div>
      </div>
    </div>
  );
}

function EconomyCard({ economy, onUpdate, onDelete, refOptions, onNavigateRef }) {
  const [collapsed, setCollapsed] = useState(false);
  const touch = (patch) => onUpdate({ ...economy, ...patch, updatedAt: new Date().toISOString() });
  const updateCategory = (catId, updatedCat) => touch({ categories: economy.categories.map((c) => (c.id === catId ? updatedCat : c)) });
  const deleteCategory = (catId) => touch({ categories: economy.categories.filter((c) => c.id !== catId) });
  const addCategory = () => {
    const label = window.prompt("Nom de la nouvelle catégorie (ex. Immobilier, Commerce extérieur...) :");
    if (!label) return;
    touch({ categories: [...economy.categories, { id: uid(), label, indicators: [] }] });
  };
  const total = economy.categories.reduce((s, c) => s + c.indicators.length, 0);
  return (
    <div className="rounded-xl p-4 transition-colors" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2">
        <button onClick={() => setCollapsed(!collapsed)} className="p-0.5 flex-shrink-0" style={{ color: C.textFaint }}>
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <h3 className="text-lg leading-none flex-shrink-0" style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, color: C.textPrimary }}>{economy.code}</h3>
        <span className="text-xs truncate" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{economy.name}</span>
        {total > 0 && <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{total} indicateur{total > 1 ? "s" : ""}</span>}
        {onDelete && (
          <button onClick={onDelete} className="p-0.5 rounded flex-shrink-0 hover:opacity-70" style={{ color: C.textFaint }} title="Supprimer l'économie">
            <X size={14} />
          </button>
        )}
      </div>
      <div style={{ maxHeight: collapsed ? 0 : 20000, overflow: "hidden", transition: "max-height 0.25s ease" }}>
        <div className="mt-1">{economy.categories.map((cat) => (<CategoryBlock key={cat.id} category={cat} onUpdate={(u) => updateCategory(cat.id, u)} onDelete={() => deleteCategory(cat.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />))}</div>
        <button onClick={addCategory} className="flex items-center gap-1 text-[11px] mt-2 px-2 py-1 rounded-md w-full justify-center transition-colors hover:opacity-80" style={{ color: C.gold, border: `1px dashed ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Plus size={12} /> Ajouter une catégorie
        </button>
        {economy.updatedAt && <UpdatedBadge updatedAt={economy.updatedAt} />}
      </div>
    </div>
  );
}

function EconomicCalendarWidget() {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '<div class="tradingview-widget-container__widget"></div>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      colorTheme: "dark",
      isTransparent: true,
      width: "100%",
      height: "560",
      locale: "fr",
      importanceFilter: "-1,0,1",
      countryFilter: "us,eu,gb,jp,cn,ca,au,nz,ch,br,in,mx,kr,se,no,za",
    });
    containerRef.current.appendChild(script);
  }, []);
  return (
    <div ref={containerRef} className="tradingview-widget-container" style={{ minHeight: 560 }}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  );
}

function DataSection({ economies, onUpdateEconomy, onAddEconomy, onDeleteEconomy, refOptions, onNavigateRef }) {
  const [filter, setFilter] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(true);
  const q = filter.trim().toLowerCase();
  const filtered = economies.filter((e) => !q || e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  return (
    <div>
      <div className="rounded-xl mb-4 transition-colors overflow-hidden" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <button onClick={() => setCalendarOpen(!calendarOpen)} className="flex items-center gap-2 w-full px-4 py-3 text-left">
          {calendarOpen ? <ChevronDown size={14} color={C.textFaint} /> : <ChevronRight size={14} color={C.textFaint} />}
          <span className="text-sm font-medium" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }}>Calendrier économique en direct</span>
          <span className="text-[10px] ml-auto" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>via TradingView</span>
        </button>
        {calendarOpen && (
          <div className="px-2 pb-2">
            <EconomicCalendarWidget />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-1" style={{ border: `1px solid ${C.border}` }}>
          <Search size={13} color={C.textFaint} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer les économies..."
            className="bg-transparent outline-none text-xs flex-1"
            style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary }}
          />
          {filter && <button onClick={() => setFilter("")}><X size={12} color={C.textFaint} /></button>}
        </div>
        <button onClick={onAddEconomy} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg flex-shrink-0 transition-colors hover:opacity-80" style={{ color: C.gold, border: `1px solid ${C.gold}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
          <Plus size={13} /> Économie
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>Aucune économie ne correspond à ta recherche.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((e) => <EconomyCard key={e.id} economy={e} onUpdate={onUpdateEconomy} onDelete={() => onDeleteEconomy(e.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} />)}
        </div>
      )}
    </div>
  );
}

// ================= WATCHLIST =================
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
function GlobalThesisCard({ content, updatedAt, history, onUpdate, onSnapshot, refOptions, onNavigateRef }) {
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
      <HistoryList history={history} />
    </div>
  );
}

function InstrumentCard({ instrument, onUpdate, onDelete, refOptions, onNavigateRef, placeholder }) {
  const touch = (patch) => onUpdate({ ...instrument, ...patch, updatedAt: new Date().toISOString() });
  const snapshot = (text) => {
    if (!text || !text.trim()) return;
    const last = instrument.history?.[instrument.history.length - 1]?.text;
    if (text === last) return;
    const history = [...(instrument.history || []), { date: new Date().toISOString(), text }].slice(-15);
    onUpdate({ ...instrument, history });
  };
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between gap-2">
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
          <button onClick={onDelete} className="p-0.5 rounded hover:opacity-70" style={{ color: C.textFaint }}><X size={14} /></button>
        </div>
      </div>
      <div className="mt-2">
        <RichContentEditor content={instrument.content} onChange={(c) => touch({ content: c })} onSnapshot={snapshot} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder={placeholder} rows={3} />
      </div>
      {instrument.updatedAt && <UpdatedBadge updatedAt={instrument.updatedAt} />}
      <HistoryList history={instrument.history} />
    </div>
  );
}

function AssetClassBlock({ cls, data, onUpdateInstrument, onAdd, onDelete, refOptions, onNavigateRef }) {
  const [open, setOpen] = useState(cls.id === "forex");
  const instruments = data?.instruments || [];
  return (
    <div className="mb-5">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 w-full text-left mb-2" style={{ color: C.textPrimary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: "1.1rem" }}>{cls.label}</span>
        <span className="text-xs" style={{ color: C.textFaint }}>({instruments.length})</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {instruments.map((inst) => (
            <InstrumentCard key={inst.id} instrument={inst} onUpdate={(u) => onUpdateInstrument(inst.id, u)} onDelete={() => onDelete(inst.id)} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder={`Ta thèse et ton biais sur ${inst.symbol || "cet instrument"}...`} />
          ))}
          <button onClick={onAdd} className="flex items-center justify-center gap-1.5 text-sm rounded-xl" style={{ color: C.textSecondary, border: `1px dashed ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", minHeight: 100 }}>
            <Plus size={14} /> Ajouter {cls.label.toLowerCase() === "actions" ? "une action" : "un instrument"}
          </button>
        </div>
      )}
    </div>
  );
}

function ThesisSection({ globalThesis, onUpdateGlobal, onSnapshotGlobal, theses, onUpdateInstrument, onAddInstrument, onDeleteInstrument, refOptions, onNavigateRef }) {
  return (
    <div>
      <GlobalThesisCard content={globalThesis.content} updatedAt={globalThesis.updatedAt} history={globalThesis.history} onUpdate={onUpdateGlobal} onSnapshot={onSnapshotGlobal} refOptions={refOptions} onNavigateRef={onNavigateRef} />
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
        <p className="text-[11px] mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>RAISONS DU TRADE</p>
        <RichContentEditor content={trade.reasons} onChange={(c) => touch({ reasons: c })} refOptions={refOptions} onNavigateRef={onNavigateRef} placeholder="Pourquoi ce trade — fondamentaux, driver, catalyseur..." rows={2} />
      </div>

      <div className="mt-3">
        <p className="text-[11px] mb-1" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>ATTENTES</p>
        <textarea value={trade.expectations} onChange={(e) => touch({ expectations: e.target.value })} placeholder="Ce que tu attends — niveaux, scénario, invalidation..." className="bg-transparent outline-none w-full text-sm resize-none" style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: C.textPrimary, lineHeight: 1.5 }} rows={2} />
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
function OverviewSection({ banks, economies, theses, globalThesis, onNavigate }) {
  const now = Date.now();
  const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d.getTime() - now) / 86400000);
  };

  const tensionBanks = banks.filter((b) => b.bias === "hawkish" && b.marketExpectations?.strength === "forte");

  const upcomingMeetings = banks
    .flatMap((b) => [
      { bank: b, date: b.marketExpectations?.nextMeetingDate1 },
      { bank: b, date: b.marketExpectations?.nextMeetingDate2 },
    ])
    .map((m) => ({ ...m, days: daysUntil(m.date) }))
    .filter((m) => m.days !== null && m.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  const upcomingReleases = economies
    .flatMap((e) => e.categories.flatMap((c) => c.indicators.map((ind) => ({ economy: e, indicator: ind }))))
    .map((x) => ({ ...x, days: daysUntil(x.indicator.nextRelease) }))
    .filter((x) => x.days !== null && x.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 8);

  const staleItems = [];
  if (globalThesis.updatedAt) {
    const days = Math.floor((now - new Date(globalThesis.updatedAt).getTime()) / 86400000);
    if (days > FRESHNESS_DAYS) staleItems.push({ label: "Thèse globale", days });
  }
  ASSET_CLASS_DEFS.forEach((cls) => {
    (theses[cls.id]?.instruments || []).forEach((inst) => {
      if (inst.updatedAt) {
        const days = Math.floor((now - new Date(inst.updatedAt).getTime()) / 86400000);
        if (days > FRESHNESS_DAYS) staleItems.push({ label: `${cls.label} · ${inst.symbol || "sans nom"}`, days });
      }
    });
  });
  staleItems.sort((a, b) => b.days - a.days);

  const Block = ({ title, children, isEmpty, empty }) => (
    <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
      <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>{title}</p>
      {isEmpty ? <p className="text-xs" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif" }}>{empty}</p> : children}
    </div>
  );

  return (
    <div>
      <Block title="Tension banques centrales" isEmpty={tensionBanks.length === 0} empty="Aucune tension détectée pour l'instant.">
        <div className="flex flex-col gap-1.5">
          {tensionBanks.map((b) => (
            <button key={b.id} onClick={() => onNavigate("banks")} className="text-left text-sm px-2.5 py-1.5 rounded-md transition-colors hover:opacity-90" style={{ backgroundColor: C.stale, color: "#fff", fontFamily: "'IBM Plex Sans', sans-serif" }}>
              ⚠ {b.code} — hawkish, le marché price des attentes fortes
            </button>
          ))}
        </div>
      </Block>

      <Block title="Réunions de banques centrales à venir" isEmpty={upcomingMeetings.length === 0} empty="Aucune date de réunion renseignée.">
        <div className="flex flex-col gap-1.5">
          {upcomingMeetings.map((m, i) => (
            <button key={i} onClick={() => onNavigate("banks")} className="flex items-center justify-between text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }}>
              <span>{m.bank.code}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint }}>{m.days === 0 ? "aujourd'hui" : `dans ${m.days} j`}</span>
            </button>
          ))}
        </div>
      </Block>

      <Block title="Publications économiques à venir" isEmpty={upcomingReleases.length === 0} empty="Aucune date de publication renseignée.">
        <div className="flex flex-col gap-1.5">
          {upcomingReleases.map((r, i) => (
            <button key={i} onClick={() => onNavigate("data")} className="flex items-center justify-between text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.textSecondary }}>
              <span>{r.economy.code} · {r.indicator.name || "Indicateur"}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint }}>{r.days === 0 ? "aujourd'hui" : `dans ${r.days} j`}</span>
            </button>
          ))}
        </div>
      </Block>

      <Block title={`Thèses pas mises à jour depuis ${FRESHNESS_DAYS}+ j`} isEmpty={staleItems.length === 0} empty="Tout est à jour.">
        <div className="flex flex-col gap-1.5">
          {staleItems.map((s, i) => (
            <button key={i} onClick={() => onNavigate("thesis")} className="flex items-center justify-between text-left text-xs px-2.5 py-1.5 rounded-md transition-colors hover:opacity-80" style={{ border: `1px solid ${C.stale}`, fontFamily: "'IBM Plex Sans', sans-serif", color: C.stale }}>
              <span>{s.label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{s.days} j</span>
            </button>
          ))}
        </div>
      </Block>
    </div>
  );
}

function ExportModal({ selection, setSelection, banks, economies, drivers, theses, trades, autoBackups, onRestoreAutoBackup, onClose }) {
  const toggle = (group, id) => setSelection((prev) => ({ ...prev, [group]: { ...prev[group], [id]: !prev[group][id] } }));
  const toggleGlobal = () => setSelection((prev) => ({ ...prev, global: !prev.global }));
  const selectAll = (group, ids, value) => setSelection((prev) => ({ ...prev, [group]: Object.fromEntries(ids.map((id) => [id, value])) }));
  const allInstruments = ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).map((inst) => ({ ...inst, clsLabel: cls.label })));

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
        <ExportGroup title="Banques Centrales" items={banks.map((b) => ({ id: b.id, label: b.code }))} selected={selection.banks} onToggle={(id) => toggle("banks", id)} onAll={(v) => selectAll("banks", banks.map((b) => b.id), v)} />
        <ExportGroup title="Data Économique" items={economies.map((e) => ({ id: e.id, label: e.code }))} selected={selection.economies} onToggle={(id) => toggle("economies", id)} onAll={(v) => selectAll("economies", economies.map((e) => e.id), v)} />
        <ExportGroup title="Drivers Macro" items={drivers.map((d) => ({ id: d.id, label: d.name || "(sans nom)" }))} selected={selection.drivers} onToggle={(id) => toggle("drivers", id)} onAll={(v) => selectAll("drivers", drivers.map((d) => d.id), v)} />
        <ExportGroup title="Thèse Macro par instrument" items={allInstruments.map((i) => ({ id: i.id, label: `${i.clsLabel} · ${i.symbol || "(sans nom)"}` }))} selected={selection.instruments} onToggle={(id) => toggle("instruments", id)} onAll={(v) => selectAll("instruments", allInstruments.map((i) => i.id), v)} />
        <ExportGroup title="Trades" items={trades.map((t) => ({ id: t.id, label: t.ticker || "(sans nom)" }))} selected={selection.trades} onToggle={(id) => toggle("trades", id)} onAll={(v) => selectAll("trades", trades.map((t) => t.id), v)} />
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

function PrintView({ selection, banks, economies, drivers, globalThesis, theses, trades }) {
  const allInstruments = ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).map((inst) => ({ ...inst, clsLabel: cls.label })));
  const sBanks = banks.filter((b) => selection.banks[b.id]);
  const sEcon = economies.filter((e) => selection.economies[e.id]);
  const sDrivers = drivers.filter((d) => selection.drivers[d.id]);
  const sInstr = allInstruments.filter((i) => selection.instruments[i.id]);
  const sTrades = trades.filter((t) => selection.trades[t.id]);

  return (
    <div className="print-view" style={{ backgroundColor: "#fff", color: "#111", padding: "2rem", fontFamily: "Georgia, serif" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Desk Macro — Export</h1>
      {selection.global && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Vue d'ensemble globale</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{globalThesis.content.text}</p>
        </section>
      )}
      {sBanks.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Banques Centrales</h2>
          {sBanks.map((b) => (
            <div key={b.id} style={{ marginBottom: 8 }}>
              <strong>{b.code}</strong> — {b.bias || "non défini"} {b.currentRate ? `· taux actuel : ${b.currentRate}` : ""}
              {b.marketExpectations && (b.marketExpectations.meeting1 || b.marketExpectations.meeting2 || b.marketExpectations.year2026) && (
                <p style={{ fontSize: "0.85rem", color: "#555" }}>
                  Marché — prochaine réunion : {b.marketExpectations.meeting1 || "?"} · suivante : {b.marketExpectations.meeting2 || "?"} · fin 2026 : {b.marketExpectations.year2026 || "?"} {b.marketExpectations.strength ? `(force : ${b.marketExpectations.strength})` : ""}
                </p>
              )}
              {b.members.length > 0 && <ul>{b.members.map((m) => (<li key={m.id}>{m.name} ({m.role}) — {m.vote || "?"} {m.note ? `· ${m.note}` : ""}</li>))}</ul>}
            </div>
          ))}
        </section>
      )}
      {sEcon.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Data Économique</h2>
          {sEcon.map((e) => (
            <div key={e.id} style={{ marginBottom: 8 }}>
              <strong>{e.code} — {e.name}</strong>
              {e.categories.map((c) => c.indicators.length > 0 && (
                <div key={c.id}><em>{c.label}</em>
                  <ul>{c.indicators.map((ind) => (<li key={ind.id}>{ind.name}: {ind.value} (attendu {ind.expected}) — {ind.surprise || "?"} {(ind.content?.text || ind.note) ? `· ${ind.content?.text || ind.note}` : ""}</li>))}</ul>
                </div>
              ))}
            </div>
          ))}
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
            <div key={i.id} style={{ marginBottom: 8 }}>
              <strong>{i.clsLabel} · {i.symbol}</strong>
              <p style={{ whiteSpace: "pre-wrap" }}>{i.content.text}</p>
            </div>
          ))}
        </section>
      )}
      {sTrades.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", borderBottom: "1px solid #ccc", paddingBottom: 4 }}>Trades</h2>
          {sTrades.map((t) => (
            <div key={t.id} style={{ marginBottom: 8 }}>
              <strong>{t.ticker}</strong> — {t.direction || ""} · {t.conviction || ""} · {t.horizon || ""}
              <p><em>Raisons :</em> {t.reasons?.text}</p>
              <p><em>Attentes :</em> {t.expectations}</p>
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
  const [banks, setBanks] = useState(SEED_BANKS);
  const [economies, setEconomies] = useState(SEED_ECONOMIES);
  const [drivers, setDrivers] = useState([]);
  const [globalThesis, setGlobalThesis] = useState({ content: emptyContent(), updatedAt: null, history: [] });
  const [theses, setTheses] = useState(seedTheses());
  const [trades, setTrades] = useState([]);
  const [watchlists, setWatchlists] = useState([]);
  const [autoBackups, setAutoBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle");
  const [showExport, setShowExport] = useState(false);
  const [exportSelection, setExportSelection] = useState({ global: false, banks: {}, economies: {}, drivers: {}, instruments: {}, trades: {} });
  const [searchQuery, setSearchQuery] = useState("");
  const saveTimeouts = useRef({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [b, e, d, gt, th, tr, wl, ab] = await Promise.allSettled([
          storageGet("banks-data"),
          storageGet("econ-data"),
          storageGet("drivers-data"),
          storageGet("global-thesis-data-v2"),
          storageGet("theses-data-v2"),
          storageGet("trades-data-v2"),
          storageGet("watchlists-data-v1"),
          storageGet("autobackup-index"),
        ]);
        if (b.status === "fulfilled" && b.value?.value) setBanks(JSON.parse(b.value.value));
        if (e.status === "fulfilled" && e.value?.value) {
          let parsedEcon = JSON.parse(e.value.value);
          if (!parsedEcon.some((ec) => ec.code === "NZ")) {
            parsedEcon = [...parsedEcon, { id: uid(), code: "NZ", name: "Nouvelle-Zélande", updatedAt: null, categories: ECON_CATEGORIES.map((c) => ({ ...c, indicators: [] })) }];
            persist("econ-data", parsedEcon);
          }
          setEconomies(parsedEcon);
        }
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
  stateRef.current = { banks, economies, drivers, globalThesis, theses, trades, watchlists };
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
      if (data.banks) { setBanks(data.banks); persist("banks-data", data.banks); }
      if (data.economies) { setEconomies(data.economies); persist("econ-data", data.economies); }
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

  const updateBank = (updatedBank) => { const next = banks.map((b) => (b.id === updatedBank.id ? updatedBank : b)); setBanks(next); persist("banks-data", next); };
  const updateEconomy = (updatedEconomy) => { const next = economies.map((e) => (e.id === updatedEconomy.id ? updatedEconomy : e)); setEconomies(next); persist("econ-data", next); };
  const addEconomy = () => {
    const code = window.prompt("Code de l'économie (ex. BR, IN, MX...) :");
    if (!code) return;
    const name = window.prompt("Nom complet (ex. Brésil) :") || code;
    const next = [...economies, { id: uid(), code: code.toUpperCase(), name, updatedAt: null, categories: ECON_CATEGORIES.map((c) => ({ ...c, indicators: [] })) }];
    setEconomies(next); persist("econ-data", next);
  };
  const deleteEconomy = (id) => {
    if (!window.confirm("Supprimer cette économie et toutes ses données ?")) return;
    const next = economies.filter((e) => e.id !== id);
    setEconomies(next); persist("econ-data", next);
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
  const updateInstrument = (clsId, instId, updatedInst) => {
    const next = { ...theses, [clsId]: { instruments: theses[clsId].instruments.map((i) => (i.id === instId ? updatedInst : i)) } };
    setTheses(next); persist("theses-data-v2", next);
  };
  const addInstrument = (clsId) => {
    const symbol = window.prompt("Symbole (ex. USD, BTC, AAPL...) :");
    if (!symbol) return;
    const next = { ...theses, [clsId]: { instruments: [...theses[clsId].instruments, { id: uid(), symbol, content: emptyContent(), history: [], updatedAt: null }] } };
    setTheses(next); persist("theses-data-v2", next);
  };
  const deleteInstrument = (clsId, instId) => {
    const next = { ...theses, [clsId]: { instruments: theses[clsId].instruments.filter((i) => i.id !== instId) } };
    setTheses(next); persist("theses-data-v2", next);
  };

  const addTrade = () => { const next = [...trades, { id: uid(), ticker: "", assetClass: "", direction: null, conviction: null, horizon: null, reasons: emptyContent(), expectations: "", updatedAt: new Date().toISOString() }]; setTrades(next); persist("trades-data-v2", next); };
  const updateTrade = (updated) => { const next = trades.map((t) => (t.id === updated.id ? updated : t)); setTrades(next); persist("trades-data-v2", next); };
  const deleteTrade = (id) => { const next = trades.filter((t) => t.id !== id); setTrades(next); persist("trades-data-v2", next); };

  const exportBackup = () => {
    const payload = { banks, economies, drivers, globalThesis, theses, trades, watchlists, exportedAt: new Date().toISOString() };
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
        if (data.banks) { setBanks(data.banks); persist("banks-data", data.banks); }
        if (data.economies) { setEconomies(data.economies); persist("econ-data", data.economies); }
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
    ...banks.map((b) => ({ id: b.id, type: "bank", label: `BC · ${b.code}` })),
    ...drivers.filter((d) => d.name).map((d) => ({ id: d.id, type: "driver", label: `Driver · ${d.name}` })),
    ...economies.flatMap((e) => e.categories.flatMap((c) => c.indicators.filter((ind) => ind.name).map((ind) => ({ id: ind.id, type: "data", label: `Data · ${e.code} · ${ind.name}` })))),
    ...ASSET_CLASS_DEFS.flatMap((cls) => (theses[cls.id]?.instruments || []).filter((i) => i.symbol).map((i) => ({ id: i.id, type: "instrument", label: `Thèse · ${cls.label} · ${i.symbol}` }))),
    ...trades.filter((t) => t.ticker).map((t) => ({ id: t.id, type: "trade", label: `Trade · ${t.ticker}` })),
  ];
  const onNavigateRef = (type) => setActiveTab(type === "bank" ? "banks" : type === "driver" ? "drivers" : type === "instrument" ? "thesis" : type === "trade" ? "trades" : "data");

  const activeItem = NAV_ITEMS.find((n) => n.id === activeTab);

  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    banks.forEach((b) => { if (b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)) results.push({ tab: "banks", label: `BC · ${b.code}` }); });
    economies.forEach((e) => { if (e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)) results.push({ tab: "data", label: `Data · ${e.code}` }); });
    drivers.forEach((d) => { if (d.name && d.name.toLowerCase().includes(q)) results.push({ tab: "drivers", label: `Driver · ${d.name}` }); });
    ASSET_CLASS_DEFS.forEach((cls) => (theses[cls.id]?.instruments || []).forEach((i) => { if (i.symbol && i.symbol.toLowerCase().includes(q)) results.push({ tab: "thesis", label: `Thèse · ${cls.label} · ${i.symbol}` }); }));
    trades.forEach((t) => { if (t.ticker && t.ticker.toLowerCase().includes(q)) results.push({ tab: "trades", label: `Trade · ${t.ticker}` }); });
    watchlists.forEach((w) => w.items.forEach((i) => { if (i.symbol && i.symbol.toLowerCase().includes(q)) results.push({ tab: "watchlist", label: `Watchlist · ${w.name} · ${i.symbol}` }); }));
    return results.slice(0, 12);
  })();
  const subtitles = {
    overview: "Ce qui mérite ton attention, agrégé automatiquement depuis tout le desk.",
    banks: "Ton verdict par banque, et le vote de chaque membre selon tes recherches.",
    data: "Les données par économie, catégorie par catégorie, avec surprises et notes.",
    drivers: "Les forces qui font bouger le marché en ce moment — et laquelle domine.",
    thesis: "Ta lecture macro, par instrument et pour l'ensemble des marchés.",
    trades: "Chaque trade, sa thèse fondamentale, ses raisons et tes attentes.",
    watchlist: "Tes propres listes d'instruments à surveiller, remplies comme tu veux.",
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
              <OverviewSection banks={banks} economies={economies} theses={theses} globalThesis={globalThesis} onNavigate={setActiveTab} />
            ) : activeTab === "banks" ? (
              <BanksSection banks={banks} onUpdateBank={updateBank} />
            ) : activeTab === "data" ? (
              <DataSection economies={economies} onUpdateEconomy={updateEconomy} onAddEconomy={addEconomy} onDeleteEconomy={deleteEconomy} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "drivers" ? (
              <DriversSection drivers={drivers} onUpdate={updateDriver} onAdd={addDriver} onDelete={deleteDriver} onSetMain={setMainDriver} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "thesis" ? (
              <ThesisSection globalThesis={globalThesis} onUpdateGlobal={updateGlobalThesis} onSnapshotGlobal={snapshotGlobalThesis} theses={theses} onUpdateInstrument={updateInstrument} onAddInstrument={addInstrument} onDeleteInstrument={deleteInstrument} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : activeTab === "trades" ? (
              <TradesSection trades={trades} onUpdate={updateTrade} onAdd={addTrade} onDelete={deleteTrade} refOptions={refOptions} onNavigateRef={onNavigateRef} />
            ) : (
              <WatchlistSection watchlists={watchlists} onUpdate={updateWatchlist} onAdd={addWatchlist} onDelete={deleteWatchlist} />
            )}
          </div>
        </main>
      </div>

      <PrintView selection={exportSelection} banks={banks} economies={economies} drivers={drivers} globalThesis={globalThesis} theses={theses} trades={trades} />
      {showExport && <ExportModal selection={exportSelection} setSelection={setExportSelection} banks={banks} economies={economies} drivers={drivers} theses={theses} trades={trades} autoBackups={autoBackups} onRestoreAutoBackup={restoreAutoBackup} onClose={() => setShowExport(false)} />}
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
