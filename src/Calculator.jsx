import React, { useState } from "react";
import { Copy, Save, X, Check } from "lucide-react";

const C = {
  ink: "#0F1215", surface: "#171B20", surfaceRaised: "#1F242B", border: "#2A2F36",
  hawk: "#C88A45", dove: "#4C8FA6", gold: "#C4A661", trade: "#6D9C82", stale: "#C9694A",
  textPrimary: "#ECE8E1", textSecondary: "#8D9199", textFaint: "#5C6167",
};

// [nom, prix approximatif, taille de contrat (matières premières / cryptos)]
const GROUPS = [
  { label: "Forex majeures", fx: true, cs: 1000, items: [["EURUSD", 1.10], ["GBPUSD", 1.30], ["USDJPY", 150], ["USDCHF", 0.88], ["USDCAD", 1.36], ["AUDUSD", 0.66], ["NZDUSD", 0.60]] },
  { label: "Forex mineures", fx: true, cs: 1000, items: [["EURGBP", 0.85], ["EURJPY", 165], ["EURCHF", 0.97], ["EURCAD", 1.50], ["EURAUD", 1.66], ["EURNZD", 1.83], ["GBPJPY", 195], ["GBPCHF", 1.14], ["GBPCAD", 1.77], ["GBPAUD", 1.97], ["GBPNZD", 2.16], ["AUDJPY", 99], ["AUDCAD", 0.90], ["AUDCHF", 0.58], ["AUDNZD", 1.10], ["NZDJPY", 90], ["NZDCAD", 0.82], ["NZDCHF", 0.53], ["CADJPY", 110], ["CADCHF", 0.65], ["CHFJPY", 170]] },
  { label: "Matières premières", fx: false, items: [["XAUUSD (or)", 2650, 1], ["XAGUSD (argent)", 31, 50], ["XPTUSD (platine)", 1000, 1], ["XPDUSD (palladium)", 1000, 1], ["USOIL (WTI)", 70, 10], ["UKOIL (Brent)", 74, 10], ["XNGUSD (gaz nat.)", 3, 100]] },
  { label: "Cryptos", fx: false, items: [["BTCUSD", 65000, 1], ["ETHUSD", 2600, 1], ["LTCUSD", 70, 1], ["XRPUSD", 0.55, 1], ["BCHUSD", 400, 1], ["SOLUSD", 150, 1], ["ADAUSD", 0.4, 1], ["DOGEUSD", 0.12, 1], ["BNBUSD", 600, 1], ["LINKUSD", 14, 1]] },
];
const RATES = { USD: 1, EUR: 1.10, GBP: 1.30, AUD: 0.66, NZD: 0.60, CAD: 0.735, CHF: 1.136, JPY: 0.0067 };

const INSTR = {};
GROUPS.forEach((g) => g.items.forEach((r) => {
  const n = r[0].split(" ")[0];
  INSTR[r[0]] = { b: g.fx ? n.slice(0, 3) : n, q: g.fx ? n.slice(3) : "USD", p: r[1], cs: g.fx ? g.cs : r[2] };
}));

const digits = (p) => (p >= 1000 ? 2 : p >= 10 ? 3 : 5);
const num = (v) => parseFloat(String(v).replace(",", ".")) || 0;
const fmt = (v) => (v >= 0 ? "+" : "") + v.toFixed(2);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function defaults(name) {
  const i = INSTR[name], x = digits(i.p);
  return {
    ins: name, dir: "1", lot: "0.10", en: String(i.p),
    sl: (i.p * 0.996).toFixed(x), tp: (i.p * 1.008).toFixed(x),
    cs: String(i.cs), rt: String(RATES[i.q] ?? 1), bal: "10000", rk: "2",
  };
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, borderRadius: 8,
  background: C.ink, color: C.textPrimary, border: `1px solid ${C.border}`, outline: "none",
  fontFamily: "'IBM Plex Mono', monospace",
};
const labelStyle = { display: "block", fontSize: 11, color: C.textFaint, marginBottom: 3, fontFamily: "'IBM Plex Sans', sans-serif" };

function Field({ label, children, wide }) {
  return (
    <div style={wide ? { gridColumn: "1 / 3" } : undefined}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
function Row({ label, value, color }) {
  return (
    <div className="flex justify-between py-1.5 text-sm" style={{ borderBottom: `1px solid ${C.border}`, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <span style={{ color: C.textSecondary }}>{label}</span>
      <span style={{ color: color || C.textPrimary, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export default function CalculatorSection({ saves = [], onChangeSaves }) {
  const [f, setF] = useState(() => defaults("EURUSD"));
  const [flash, setFlash] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const i = INSTR[f.ins];
  const needRate = i.q !== "USD" && i.b !== "USD";
  const dir = Number(f.dir);
  const rate = (px) => (i.q === "USD" ? 1 : i.b === "USD" ? 1 / px : num(f.rt));
  const en = num(f.en), sl = num(f.sl), tp = num(f.tp), cs = num(f.cs), lot = num(f.lot);
  const loss = (sl - en) * dir * lot * cs * rate(sl);
  const gain = (tp - en) * dir * lot * cs * rate(tp);
  const lossPerLotUSC = (sl - en) * dir * cs * rate(sl) * 100;
  const risk = (num(f.bal) * num(f.rk)) / 100;
  const lotSug = lossPerLotUSC < 0 ? (Math.floor((risk / -lossPerLotUSC) * 100) / 100).toFixed(2) + " lot" : "SL invalide";
  const rr = loss < 0 && gain > 0 ? `1 : ${(gain / -loss).toFixed(2)}` : "—";

  const lossTxt = `${fmt(loss * 100)} USC (${fmt(loss)} $)`;
  const gainTxt = `${fmt(gain * 100)} USC (${fmt(gain)} $)`;
  const summary = [
    `Instrument : ${f.ins}`, `Sens : ${dir === 1 ? "Achat (Buy)" : "Vente (Sell)"}`, `Lots : ${f.lot}`,
    `Entrée : ${f.en}`, `Stop Loss : ${f.sl}`, `Take Profit : ${f.tp}`,
    `Perte au SL : ${lossTxt}`, `Gain au TP : ${gainTxt}`, `Ratio R:R : ${rr}`,
    `Solde : ${f.bal} USC`, `Risque : ${f.rk} % (${risk.toFixed(2)} USC)`, `Lot conseillé : ${lotSug}`,
  ].join("\n");

  const toast = (t) => { setFlash(t); setTimeout(() => setFlash(""), 1500); };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      toast("copied");
    } catch (err) {
      const a = document.createElement("textarea");
      a.value = summary; a.style.position = "fixed"; a.style.opacity = "0";
      document.body.appendChild(a); a.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(a);
      toast(ok ? "copied" : "");
    }
  };
  const save = () => {
    onChangeSaves([{ id: uid(), date: new Date().toISOString(), v: f }, ...saves].slice(0, 50));
    toast("saved");
  };
  const remove = (id) => onChangeSaves(saves.filter((s) => s.id !== id));

  const btn = { fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 13, padding: "8px 12px", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 };

  return (
    <div className="max-w-xl">
      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Instrument" wide>
            <select value={f.ins} onChange={(e) => setF(defaults(e.target.value))} style={inputStyle}>
              {GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.items.map((r) => <option key={r[0]} value={r[0]}>{r[0]}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field label="Sens">
            <select value={f.dir} onChange={set("dir")} style={inputStyle}>
              <option value="1">Achat (Buy)</option>
              <option value="-1">Vente (Sell)</option>
            </select>
          </Field>
          <Field label="Lots"><input value={f.lot} onChange={set("lot")} inputMode="decimal" style={inputStyle} /></Field>
          <Field label="Prix d'entrée"><input value={f.en} onChange={set("en")} inputMode="decimal" style={inputStyle} /></Field>
          <Field label="Stop Loss"><input value={f.sl} onChange={set("sl")} inputMode="decimal" style={inputStyle} /></Field>
          <Field label="Take Profit"><input value={f.tp} onChange={set("tp")} inputMode="decimal" style={inputStyle} /></Field>
          <Field label="Contrat (unités / lot)"><input value={f.cs} onChange={set("cs")} inputMode="decimal" style={inputStyle} /></Field>
          {needRate && <Field label={`1 ${i.q} = ? USD`}><input value={f.rt} onChange={set("rt")} inputMode="decimal" style={inputStyle} /></Field>}
        </div>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <Row label="Perte au SL" value={lossTxt} color={C.dove} />
        <Row label="Gain au TP" value={gainTxt} color={C.trade} />
        <Row label="Ratio R:R" value={rr} />
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Solde (USC)"><input value={f.bal} onChange={set("bal")} inputMode="decimal" style={inputStyle} /></Field>
          <Field label="Risque par trade (%)"><input value={f.rk} onChange={set("rk")} inputMode="decimal" style={inputStyle} /></Field>
        </div>
        <div className="mt-2">
          <Row label="Montant risqué" value={`${risk.toFixed(2)} USC`} />
          <Row label="Lot conseillé" value={lotSug} color={C.gold} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <button onClick={copy} style={{ ...btn, backgroundColor: C.gold, color: C.ink, fontWeight: 500 }}>
          {flash === "copied" ? <Check size={14} /> : <Copy size={14} />} {flash === "copied" ? "Copié" : "Copier le résultat"}
        </button>
        <button onClick={save} style={{ ...btn, color: C.gold, border: `1px solid ${C.gold}` }}>
          {flash === "saved" ? <Check size={14} /> : <Save size={14} />} {flash === "saved" ? "Sauvegardé" : "Sauvegarder"}
        </button>
      </div>

      {saves.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
          <p className="text-[11px] uppercase tracking-wide mb-2" style={{ color: C.textFaint, fontFamily: "'IBM Plex Mono', monospace" }}>Calculs sauvegardés</p>
          <div className="flex flex-col gap-1.5">
            {saves.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-md" style={{ border: `1px solid ${C.border}`, color: C.textSecondary, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                <span className="truncate">
                  {s.v.ins} · {s.v.dir === "1" ? "Buy" : "Sell"} {s.v.lot} lot · {new Date(s.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                </span>
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => { setF(s.v); window.scrollTo(0, 0); }} className="px-2 py-0.5 rounded" style={{ color: C.gold, border: `1px solid ${C.gold}` }}>Charger</button>
                  <button onClick={() => remove(s.id)} style={{ color: C.textFaint }}><X size={13} /></button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px]" style={{ color: C.textFaint, fontFamily: "'IBM Plex Sans', sans-serif", lineHeight: 1.5 }}>
        Compte cent : 100 USC = 1 USD. Prix pré-remplis approximatifs : mets le prix en direct. Vérifie la taille du contrat dans les spécifications du symbole sur MT4/MT5. Hors spread, commissions et swap.
      </p>
    </div>
  );
}
