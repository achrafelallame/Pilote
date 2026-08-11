/* Parseurs de relevés PDF — AMEX Cobalt, CIBC débit, CIBC Mastercard.
   Entrée : pages = [ { items: [ {s, x, y} ] } ]  (texte + coordonnées pdf.js)
   Sortie : { source, transactions: [ {date:"YYYY-MM-DD", desc, montant, typeAuto} ] } */
"use strict";

const MOIS = {JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12,
  JANUARY:1,FEBRUARY:2,MARCH:3,APRIL:4,JUNE:6,JULY:7,AUGUST:8,SEPTEMBER:9,OCTOBER:10,NOVEMBER:11,DECEMBER:12};
const num = s => parseFloat(s.replace(/[$,]/g, ""));
const iso = (y,m,d) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

/* Regroupe les items d'une page en lignes (par coordonnée y), triées haut → bas puis gauche → droite */
function toLines(page){
  const rows = [];
  for (const it of page.items){
    if (!it.s.trim()) continue;
    let row = rows.find(r => Math.abs(r.y - it.y) < 3);
    if (!row){ row = {y: it.y, items: []}; rows.push(row); }
    row.items.push(it);
  }
  rows.sort((a,b) => b.y - a.y);
  for (const r of rows){
    r.items.sort((a,b) => a.x - b.x);
    r.text = r.items.map(i => i.s).join(" ").replace(/\s+/g, " ").trim();
  }
  return rows;
}
const allText = pages => pages.map(p => p.items.map(i => i.s).join(" ")).join(" ");

/* Bornes du relevé : plus ancienne et plus récente date "Mmm d, yyyy" trouvées dans le texte */
function periode(text){
  const re = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/g;
  let m, dates = [];
  while ((m = re.exec(text))){
    const mo = MOIS[m[1].toUpperCase()];
    if (mo) dates.push({y:+m[3], m:mo, d:+m[2], k:+m[3]*10000+mo*100+ +m[2]});
  }
  if (!dates.length) return null;
  dates.sort((a,b) => a.k - b.k);
  return { debut: dates[0], fin: dates[dates.length-1] };
}
/* Année d'une transaction "Mmm d" selon la période (gère le chevauchement déc.→janv.) */
function anneeDe(mois, per){
  if (!per) return new Date().getFullYear();
  return mois >= per.debut.m ? per.debut.y : per.fin.y;
}

/* ============ AMEX ============ */
function parseAmex(pages){
  const per = periode(allText(pages));
  const out = [];
  const re = /^([A-Za-z]{3})\s+(\d{1,2})\s+[A-Za-z]{3}\s+\d{1,2}\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})$/;
  for (const page of pages){
    for (const line of toLines(page)){
      const m = line.text.match(re);
      if (!m) continue;
      const mo = MOIS[m[1].toUpperCase()];
      if (!mo) continue;
      const desc = m[3].replace(/\s*Reference\s+\S+$/i, "").trim();
      if (/Total of|Amount \(\$\)/i.test(desc)) continue;
      const montant = num(m[4]);
      const paiement = /PAYMENT RECEIVED/i.test(desc);
      out.push({ date: iso(anneeDe(mo, per), mo, +m[2]), desc,
        montant: Math.abs(montant),
        typeAuto: paiement ? "Transfert" : (montant < 0 ? "Revenu" : "Dépense") });
    }
  }
  return { source: "AMEX", transactions: out };
}

/* ============ CIBC Mastercard ============ */
function parseCibcMC(pages){
  const per = periode(allText(pages));
  const out = [];
  const re = /^([A-Za-z]{3})\s+(\d{1,2})\s+[A-Za-z]{3}\s+(\d{1,2})\s+(.+?)\s+(-?[\d,]+\.\d{2})$/;
  for (const page of pages){
    for (const line of toLines(page)){
      const m = line.text.match(re);
      if (!m) continue;
      const mo = MOIS[m[1].toUpperCase()];
      if (!mo) continue;
      const desc = m[4].trim();
      if (/^Total/i.test(desc)) continue;
      const paiement = /PAYMENT THANK YOU|PAIEMENT MERCI/i.test(desc);
      out.push({ date: iso(anneeDe(mo, per), mo, +m[2]), desc,
        montant: Math.abs(num(m[5])),
        typeAuto: paiement ? "Transfert" : "Dépense" });
    }
  }
  return { source: "CIBC Mastercard", transactions: out };
}

/* ============ CIBC débit (colonnes Retraits / Dépôts par coordonnée x) ============ */
function parseCibcDebit(pages){
  const per = periode(allText(pages));
  const out = [];
  const BRUIT = /Opening balance|Balance forward|Closing balance|^Date Description|Page \d|continued|^\d{5}E |Important:|Trademark|Interac|Contact|balance on|Withdrawals|Deposits|Account number|transit/i;
  for (const page of pages){
    const lines = toLines(page);
    /* Position x des colonnes depuis la ligne d'en-tête */
    let xW=null, xD=null, xB=null;
    const droite = it => it.x + (it.w || 0);
    for (const l of lines){
      for (const it of l.items){
        if (/Withdrawals \(\$\)/i.test(it.s)) xW = droite(it);
        if (/Deposits \(\$\)/i.test(it.s)) xD = droite(it);
        if (/Balance \(\$\)/i.test(it.s)) xB = droite(it);
      }
      if (xW != null && xD != null) break;
    }
    if (xW == null || xD == null) continue;
    let cur = null, curMois = null, curJour = null;
    for (const l of lines){
      if (BRUIT.test(l.text)) { if(!/continued/i.test(l.text)) cur = null; continue; }
      const dm = l.text.match(/^([A-Za-z]{3})\s+(\d{1,2})\b/);
      let items = l.items;
      if (dm && MOIS[dm[1].toUpperCase()]){
        curMois = MOIS[dm[1].toUpperCase()]; curJour = +dm[2];
        let reste = (dm[1] + " " + dm[2]).length;
        let k = 0;
        while (k < items.length && reste > 0){ reste -= items[k].s.trim().length + 1; k++; }
        items = items.slice(k);
      }
      const nums = [], texte = [];
      for (const it of items){
        if (/^-?[\d,]+\.\d{2}$/.test(it.s.trim())) nums.push(it); else texte.push(it.s);
      }
      /* classer chaque nombre selon la colonne la plus proche */
      let retrait = null, depot = null;
      for (const n of nums){
        const r = droite(n);
        const dW = Math.abs(r - xW), dD = Math.abs(r - xD), dB = xB!=null ? Math.abs(r - xB) : 1e9;
        if (dW <= dD && dW <= dB) retrait = num(n.s);
        else if (dD < dW && dD <= dB) depot = num(n.s);
      }
      const descLigne = texte.join(" ").replace(/\s+/g," ").trim();
      if (retrait != null || depot != null){
        if (curMois == null) continue;
        cur = { date: iso(anneeDe(curMois, per), curMois, curJour),
          desc: descLigne, montant: Math.abs(retrait != null ? retrait : depot),
          typeAuto: retrait != null ? "Dépense" : "Revenu" };
        out.push(cur);
      } else if (cur && descLigne && !/^\(/.test(descLigne)){
        cur.desc = (cur.desc + " " + descLigne).trim();  /* ligne de suite */
      }
    }
  }
  return { source: "CIBC Débit", transactions: out };
}

/* ============ Détection automatique ============ */
function parseStatement(pages){
  const t = allText(pages);
  if (/CIBC Account Statement/i.test(t)) return parseCibcDebit(pages);
  if (/CIBC/i.test(t) && /Mastercard/i.test(t)) return parseCibcMC(pages);
  if (/American Express/i.test(t)) return parseAmex(pages);
  throw new Error("Format de relevé non reconnu (AMEX, CIBC débit ou CIBC Mastercard attendus).");
}

if (typeof module !== "undefined") module.exports = { parseStatement, parseAmex, parseCibcMC, parseCibcDebit };
if (typeof window !== "undefined") window.Parseurs = { parseStatement };
