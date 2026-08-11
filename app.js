"use strict";
/* ================= OUTILS ================= */
const $ = id => document.getElementById(id);
const fmt$ = new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",maximumFractionDigits:0});
const fmt$2 = new Intl.NumberFormat("fr-CA",{style:"currency",currency:"CAD",minimumFractionDigits:2});
const fmtPct = v => (v*100).toFixed(1).replace(".",",")+" %";
const MOIS_FR = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const moisLabel = m => MOIS_FR[+m.slice(5,7)-1]+" "+m.slice(0,4);
const moisCourt = m => MOIS_FR[+m.slice(5,7)-1].slice(0,4)+". "+m.slice(2,4);
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const std = a => { if(a.length<2) return 0; const mu=avg(a); return Math.sqrt(avg(a.map(x=>(x-mu)**2))); };
const toast = msg => { const t=$("toast"); t.textContent=msg; t.classList.add("on"); setTimeout(()=>t.classList.remove("on"), 2600); };
const download = (nom, contenu, type) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([contenu], {type}));
  a.download = nom; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
};

/* ================= BASE LOCALE (IndexedDB) ================= */
const DB = { d:null,
  open(){ return new Promise((res,rej)=>{
    const rq = indexedDB.open("pilote", 1);
    rq.onupgradeneeded = e => {
      const d = e.target.result;
      d.createObjectStore("tx", {keyPath:"id"});
      d.createObjectStore("regles", {keyPath:"id", autoIncrement:true});
      d.createObjectStore("soldes", {keyPath:"mois"});
      d.createObjectStore("meta", {keyPath:"k"});
    };
    rq.onsuccess = e => { DB.d = e.target.result; res(); };
    rq.onerror = () => rej(rq.error);
  });},
  all(st){ return new Promise((res,rej)=>{ const r=DB.d.transaction(st).objectStore(st).getAll(); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });},
  put(st, obj){ return new Promise((res,rej)=>{ const r=DB.d.transaction(st,"readwrite").objectStore(st).put(obj); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });},
  del(st, key){ return new Promise((res,rej)=>{ const r=DB.d.transaction(st,"readwrite").objectStore(st).delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });},
  clear(st){ return new Promise((res,rej)=>{ const r=DB.d.transaction(st,"readwrite").objectStore(st).clear(); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });},
};

/* ================= ÉTAT ================= */
const S = { tx:[], regles:[], soldes:[], mois:null, ecran:"today", charts:{} };
const ESSENTIEL = ["Épicerie","Logement","Transport","Télécom","Santé","Frais bancaires","Frais de carte","Assurances"];
const DISCRET = ["Restaurants","Magasinage","Abonnements","Divertissement","Voyages"];
const EMOJI = {"Épicerie":"🛒","Restaurants":"🍽️","Transport":"🚗","Télécom":"📱","Abonnements":"🔁","Santé":"🩺",
  "Magasinage":"🛍️","Logement":"🏠","Frais bancaires":"🏦","Frais de carte":"💳","Salaire":"💼","Virements reçus":"⬇️",
  "Virements Interac":"↔️","Virements internationaux":"🌍","Retraits":"💵","Paiement carte":"✔️","Transfert interne":"🔄","Non catégorisé":"❔"};
const REGLES_DEFAUT = [
  ["METRO","Épicerie"],["COSTCO","Épicerie"],["LOBLAWS","Épicerie"],["MASSINE","Épicerie"],["Y.I.G","Épicerie"],
  ["IGA","Épicerie"],["FARM BOY","Épicerie"],["FOOD BASICS","Épicerie"],
  ["LA BRIOCHE","Restaurants"],["ROCK'N DELI","Restaurants"],["KETTLEMANS","Restaurants"],["TIM HORTONS","Restaurants"],
  ["STARBUCKS","Restaurants"],["MCDONALD","Restaurants"],["RESTAURANT","Restaurants"],["CAFE","Restaurants"],
  ["LYFT","Transport"],["UBER","Transport"],["PRESTO","Transport"],["OC TRANSPO","Transport"],["STO ","Transport"],
  ["PETRO","Transport"],["ESSO","Transport"],["SHELL","Transport"],
  ["ROGERS","Télécom"],["BELL","Télécom"],["FIDO","Télécom"],["VIDEOTRON","Télécom"],["FIZZ","Télécom"],
  ["NETFLIX","Abonnements"],["SPOTIFY","Abonnements"],["DISNEY","Abonnements"],["PRIME MEMBER","Abonnements"],
  ["SHOPPERS","Santé"],["SDM","Santé"],["PHARMAPRIX","Santé"],["DENTIST","Santé"],["DR.","Santé"],["CLINIQ","Santé"],
  ["BIRDANDBE","Santé"],["PHYSIO","Santé"],
  ["WINNERS","Magasinage"],["AMAZON","Magasinage"],["AMZN","Magasinage"],["TEMU","Magasinage"],["STAPLES","Magasinage"],
  ["WALMART","Magasinage"],["DOLLARAMA","Magasinage"],
  ["LOYER","Logement"],["HYDRO","Logement"],["ENBRIDGE","Logement"],
  ["TAPTAP","Virements internationaux"],["E-TRANSFER","Virements Interac"],["ATM","Retraits"],
  ["SERVICE CHARGE","Frais bancaires"],["OVERDRAFT","Frais bancaires"],
  ["MEMBERSHIP FEE","Frais de carte"],
  ["YOUTH SERVICES","Salaire","Revenu"],
  ["AMERICAN EXPRESS","Paiement carte","Transfert"],["PAYMENT RECEIVED","Paiement carte","Transfert"],
  ["PAYMENT THANK YOU","Paiement carte","Transfert"],["INTERNET TRANSFER","Transfert interne","Transfert"],
];

/* ================= CATÉGORISATION ================= */
function categoriser(desc, typeAuto){
  const u = desc.toUpperCase();
  for (const r of S.regles){
    if (u.includes(r.mot.toUpperCase()))
      return { cat: r.cat, type: r.typeForce || typeAuto };
  }
  return { cat: "Non catégorisé", type: typeAuto };
}
function recategoriserTout(){
  for (const t of S.tx){
    if (t.manuel) continue;                       /* choix manuel de l'utilisateur : intouchable */
    const c = categoriser(t.desc, t.typeAuto);
    t.cat = c.cat; t.type = c.type;
  }
  return Promise.all(S.tx.map(t => DB.put("tx", t)));
}

/* ================= AGRÉGATS ================= */
const months = () => [...new Set(S.tx.map(t=>t.mois))].sort();
const txM = m => S.tx.filter(t=>t.mois===m);
const dep = m => txM(m).filter(t=>t.type==="Dépense").reduce((a,t)=>a+t.montant,0);
const rev = m => txM(m).filter(t=>t.type==="Revenu").reduce((a,t)=>a+t.montant,0);
const flux = m => rev(m)-dep(m);
const depCat = (m,c) => txM(m).filter(t=>t.type==="Dépense"&&t.cat===c).reduce((a,t)=>a+t.montant,0);
const cats = () => [...new Set(S.tx.filter(t=>t.type==="Dépense").map(t=>t.cat))];
const soldeOf = m => S.soldes.find(s=>s.mois===m) || null;
const prevMonth = m => { const i=months().indexOf(m); return i>0 ? months()[i-1] : null; };
const compare = (cur, ref) => (ref==null || ref===0) ? null : { d:cur-ref, p:(cur-ref)/Math.abs(ref) };
function deltaHTML(c, inverse){
  if (!c) return '<span class="muted small">—</span>';
  const up = c.d>0, good = inverse ? !up : up;
  const cls = Math.abs(c.p)<.02 ? "flat" : (good ? "good":"bad");
  return `<span class="delta ${cls}">${Math.abs(c.p)<.02?"→":(up?"▲":"▼")} ${fmt$.format(Math.abs(c.d))} (${fmtPct(Math.abs(c.p))})</span>`;
}
const ALIAS = [[/LYFT/,"Lyft"],[/UBER(?! EATS)/,"Uber"],[/UBER EATS/,"Uber Eats"],[/METRO\b/,"Metro"],
  [/TIM HORTONS/,"Tim Hortons"],[/SHOPPERS|SDM\b/,"Shoppers Drug Mart"],[/DR\.? MELVIN LEE|DENTIST/,"Dentiste (Dr Lee)"],
  [/MASSINE|Y\.I\.G/,"Massine's Independent"],[/E-TRANSFER/,"Virements Interac"],[/TAPTAP/,"Taptap Send"],
  [/ATM/,"Retraits guichet"],[/SERVICE CHARGE|OVERDRAFT/,"Frais CIBC"],[/MEMBERSHIP FEE/,"Frais AMEX"],
  [/AMZN|AMAZON/,"Amazon"],[/WINNERS/,"Winners"],[/ROGERS/,"Rogers"],[/PRESTO/,"Presto"],[/TEMU/,"Temu"],
  [/LA BRIOCHE/,"La Brioche"],[/KETTLEMANS/,"Kettlemans Bagel"],[/ROCK'N DELI/,"Rock'N Deli"],[/DOLLARAMA/,"Dollarama"],
  [/BIRDANDBE/,"Bird&Be"],[/YOUTH SERVICES|^PAY\b/,"Youth Services Bureau"]];
function marchand(d){
  const u = d.toUpperCase();
  for (const [re,n] of ALIAS) if (re.test(u)) return n;
  let s = u.replace(/\b(OTTAWA|GATINEAU|TORONTO|MONTREAL|VANCOUVER|VICTORIA|KANATA|NEPEAN)\b/g,"")
           .replace(/\b(ON|QC|BC)\b/g,"").replace(/#?\d[\d\-.\/]*/g,"").replace(/\*+/g," ").replace(/\s{2,}/g," ").trim();
  return s ? s.charAt(0)+s.slice(1).toLowerCase() : d;
}
function marchands(){
  const map = {};
  for (const t of S.tx.filter(t=>t.type==="Dépense")){
    const k = marchand(t.desc);
    (map[k] ||= {total:0, n:0, byMonth:{}});
    map[k].total += t.montant; map[k].n++;
    map[k].byMonth[t.mois] = (map[k].byMonth[t.mois]||0)+t.montant;
  }
  return Object.entries(map).map(([name,v])=>({name,...v,moy:v.total/v.n})).sort((a,b)=>b.total-a.total);
}

/* ================= SCORE / INSIGHTS / PROJECTIONS ================= */
function score(m){
  const r = rev(m), taux = r>0 ? flux(m)/r : 0;
  const so = soldeOf(m), deps = months().map(dep);
  const p1 = Math.min(30, Math.max(0, taux/0.20*30));
  const p2 = so && so.actifs>0 ? Math.min(25, Math.max(0,(1-so.passifs/so.actifs)*25)) : 0;
  const p3 = deps.length>=2 ? 15*(1-Math.min(1, std(deps)/(avg(deps)||1))) : 15;
  const pm = prevMonth(m), sp = pm?soldeOf(pm):null;
  const p4 = so && sp ? (so.vn>=sp.vn?20:10) : 20;
  const p5 = so ? Math.min(10,(so.liquide/((avg(deps)||1)*3))*10) : 0;
  return Math.round(p1+p2+p3+p4+p5);
}
function verdict(m){
  const f = flux(m), r = rev(m), so = soldeOf(m);
  const rSeul = txM(m).some(t=>t.type==="Revenu");
  let s;
  if (!rSeul && f<0) s = `En ${moisLabel(m)}, vos cartes totalisent <em>${fmt$.format(-f)}</em> de dépenses.`;
  else if (f>=0) s = `En ${moisLabel(m)}, vous avez dégagé <em>${fmt$.format(f)}</em>${r>0?` — ${fmtPct(f/r)} de vos revenus mis de côté`:""}.`;
  else s = `En ${moisLabel(m)}, vous avez dépensé <em>${fmt$.format(-f)}</em> de plus que vos revenus.`;
  if (so) s += ` Valeur nette : <em>${fmt$.format(so.vn)}</em>.`;
  return s;
}
const streak = serie => { let n=0; for(let i=serie.length-1;i>0;i--){ if(serie[i]>serie[i-1]) n++; else break; } return n; };
function insights(m){
  const out = [], ms = months();
  out.push(`Rythme annuel de consommation projeté : <b>${fmt$.format(avg(ms.map(dep))*12)}</b>.`);
  if (ms.length>=2){
    const r = rev(m), taux = r>0?flux(m)/r:0;
    const hist = avg(ms.filter(x=>x!==m).map(x=>{const rr=rev(x); return rr>0?flux(x)/rr:0;}));
    if (r>0) out.push(`Taux d'épargne ${taux>=hist?"au-dessus":"sous"} votre moyenne historique (${fmtPct(taux)} vs ${fmtPct(hist)}).`);
    for (const c of cats()){
      const st = streak(ms.map(x=>depCat(x,c)));
      if (st>=3) out.push(`Les dépenses <b>${c}</b> augmentent depuis <b>${st} mois</b>.`);
    }
    for (const mc of marchands().slice(0,8)){
      const h = Object.entries(mc.byMonth).filter(([k])=>k!==m).map(([,v])=>v);
      const c = mc.byMonth[m] && h.length ? compare(mc.byMonth[m], avg(h)) : null;
      if (c && Math.abs(c.p)>=.15)
        out.push(`Chez <b>${mc.name}</b> : ${c.d>0?"hausse":"baisse"} de <b>${fmtPct(Math.abs(c.p))}</b> vs votre moyenne.`);
    }
  } else out.push(`Les tendances apparaîtront dès votre <b>2e relevé</b> importé.`);
  return out.slice(0,6);
}
function linProj(ys, pas){
  const n = ys.length; if(!n) return null; if(n===1) return ys[0];
  const xs = ys.map((_,i)=>i), mx=avg(xs), my=avg(ys);
  const b = xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/(xs.reduce((a,x)=>a+(x-mx)**2,0)||1);
  return my + b*((n-1+pas)-mx);
}


/* ===== Anti-double comptage : appariement des transferts =====
   Un transfert reconnu (ex. PAYMENT RECEIVED côté carte) cherche son miroir sur un autre
   compte : même montant (±0,01 $), ±5 jours. Le miroir est reclassé Transfert lui aussi. */
function apparierTransferts(){
  const utilises = new Set();
  let n = 0;
  for (const tr of S.tx.filter(t=>t.type==="Transfert")){
    for (const t of S.tx){
      if (t.type==="Transfert" || t.manuel || utilises.has(t.id)) continue;
      if (t.source === tr.source) continue;
      if (Math.abs(t.montant - tr.montant) > 0.01) continue;
      if (Math.abs(new Date(t.date) - new Date(tr.date)) / 86400000 > 5) continue;
      t.type = "Transfert"; t.cat = "Paiement carte"; t.apparie = true;
      utilises.add(t.id); DB.put("tx", t); n++;
      break;
    }
  }
  return n;
}
const transferts = m => txM(m).filter(t=>t.type==="Transfert");

/* ===== Faits saillants : variations significatives par catégorie ===== */
function faitsSaillants(m){
  const ms = months(), out = [];
  const hist = ms.filter(x=>x<m).slice(-6);
  if (!hist.length) return out;
  for (const c of cats()){
    const cur = depCat(m,c), ref = avg(hist.map(x=>depCat(x,c)));
    if (ref===0 && cur===0) continue;
    const d = cur-ref, p = ref>0 ? d/ref : 1;
    if (Math.abs(d) >= 25 && Math.abs(p) >= .25)
      out.push({c, d, p, txt: `<b>${c}</b> : ${d>0?"hausse":"baisse"} de ${fmt$.format(Math.abs(d))} (${fmtPct(Math.abs(p))}) vs vos 6 derniers mois`});
  }
  out.sort((a,b)=>Math.abs(b.d)-Math.abs(a.d));
  return out.slice(0,5);
}

/* ================= NAVIGATION & FEUILLE ================= */
function go(ecran){
  S.ecran = ecran;
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("on"));
  $("s-"+({today:"today",month:"month",year:"year",merch:"merch",more:"more"})[ecran]).classList.add("on");
  document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("on", b.dataset.s===ecran));
  render();
}
function sheet(html){ $("sheet-body").innerHTML = html; $("sheet-bg").classList.add("on"); requestAnimationFrame(()=>$("sheet").classList.add("on")); }
function closeSheet(){ $("sheet").classList.remove("on"); $("sheet-bg").classList.remove("on"); }

/* ================= RENDU ================= */
function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function mkChart(id, cfg){ const el=$(id); if(!el) return; if(S.charts[id]) S.charts[id].destroy(); S.charts[id]=new Chart(el,cfg); }
function baseOpts(){
  const tick=css("--muted"), grid=css("--border");
  return { responsive:true, maintainAspectRatio:false,
    plugins:{legend:{labels:{color:tick, boxWidth:9, boxHeight:9, usePointStyle:true, font:{size:11}}}},
    scales:{x:{ticks:{color:tick,font:{size:10}}, grid:{color:"transparent"}},
            y:{ticks:{color:tick,font:{size:10},callback:v=>fmt$.format(v)}, grid:{color:grid}}}};
}
const vide = (msg,ico="📄") => `<div class="empty"><div class="big">${ico}</div>${msg}</div>`;

function render(){
  const ms = months();
  if (!S.mois || !ms.includes(S.mois)) S.mois = ms.at(-1) || null;
  ({today:rToday, month:rMonth, year:rYear, merch:rMerch, more:rMore})[S.ecran]();
}

function rToday(){
  const b = $("today-body"), ms = months();
  if (!ms.length){ b.innerHTML = vide(`Bienvenue dans votre cockpit financier.<br><br><b>Commencez par importer votre premier relevé PDF</b> dans l'onglet Plus.`,"👋"); return; }
  const m = S.mois, sc = score(m), so = soldeOf(m);
  const deps6 = ms.filter(x=>x<m).slice(-6).map(dep);
  b.innerHTML = `
    <div class="verdict">${verdict(m)}</div>
    <div class="score-wrap">
      <div class="ring" style="--p:${sc}"><div>${sc}</div></div>
      <div class="small muted">Score financier /100 — épargne, endettement, stabilité, valeur nette, fonds d'urgence.</div>
    </div>
    <h2>${moisLabel(m)}</h2>
    <div class="grid2">
      <div class="card"><div class="kpi-label">Flux net</div><div class="kpi-value ${flux(m)>=0?"pos":"neg"}">${fmt$.format(flux(m))}</div></div>
      <div class="card"><div class="kpi-label">Dépenses</div><div class="kpi-value">${fmt$.format(dep(m))}</div>
        <div class="kpi-sub">${deltaHTML(deps6.length?compare(dep(m),avg(deps6)):null,true)} vs rythme</div></div>
      <div class="card"><div class="kpi-label">Revenus</div><div class="kpi-value">${fmt$.format(rev(m))}</div></div>
      <div class="card"><div class="kpi-label">Valeur nette</div><div class="kpi-value">${so?fmt$.format(so.vn):"—"}</div>
        <div class="kpi-sub">${so?"":"À saisir dans Plus → Patrimoine"}</div></div>
    </div>
    <h2>Vos habitudes, décodées</h2>
    <div class="card"><ul class="feed">${insights(m).map(x=>`<li>${x}</li>`).join("")}</ul></div>`;
}

function rMonth(){
  const ms = months(), b = $("month-body");
  $("m-chips").innerHTML = ms.map(x=>`<button class="chip ${x===S.mois?"on":""}" data-m="${x}">${moisCourt(x)}</button>`).join("");
  document.querySelectorAll("#m-chips .chip").forEach(c=>c.onclick=()=>{S.mois=c.dataset.m; render();});
  if (!ms.length){ b.innerHTML = vide("Importez un relevé pour voir vos mois."); return; }
  const m = S.mois, r = rev(m), d = dep(m), f = flux(m);
  const pm = prevMonth(m), i6 = ms.filter(x=>x<m).slice(-6);
  const an = (+m.slice(0,4)-1)+m.slice(4);
  const anCour = ms.filter(x=>x.startsWith(m.slice(0,4)));
  const trs = transferts(m), trTot = trs.reduce((a,t)=>a+t.montant,0);
  const fs = faitsSaillants(m);

  /* --- synthèse --- */
  b.innerHTML = `
    <div class="card" style="text-align:center; padding:22px 16px">
      <div class="kpi-label">Épargne du mois (flux net)</div>
      <div style="font-size:2.2rem; font-weight:800" class="${f>=0?"pos":"neg"}">${f>=0?"+":"−"}${fmt$.format(Math.abs(f))}</div>
      <div class="kpi-sub">${r>0?`Taux d'épargne : <b>${fmtPct(f/r)}</b>`:"Aucun revenu détecté ce mois-ci"}</div>
    </div>
    <div class="grid2">
      <div class="card"><div class="kpi-label">Revenus</div><div class="kpi-value">${fmt$.format(r)}</div>
        <div class="kpi-sub">${deltaHTML(pm?compare(r,rev(pm)):null)} vs mois préc.</div></div>
      <div class="card"><div class="kpi-label">Dépenses</div><div class="kpi-value">${fmt$.format(d)}</div>
        <div class="kpi-sub">${deltaHTML(pm?compare(d,dep(pm)):null,true)} vs mois préc.</div></div>
    </div>

    <h2>Comparaisons — dépenses</h2>
    <div class="card">
      <div class="cmp"><span>vs mois précédent</span>${deltaHTML(pm?compare(d,dep(pm)):null,true)}</div>
      <div class="cmp"><span>vs moyenne 6 derniers mois</span>${deltaHTML(i6.length?compare(d,avg(i6.map(dep))):null,true)}</div>
      <div class="cmp"><span>vs ${moisLabel(an)}</span>${deltaHTML(ms.includes(an)?compare(d,dep(an)):null,true)}</div>
      <div class="cmp"><span>vs moyenne ${m.slice(0,4)}</span>${deltaHTML(anCour.length>1?compare(d,avg(anCour.map(dep))):null,true)}</div>
    </div>

    ${fs.length?`<h2>À surveiller</h2><div class="card"><ul class="feed">${fs.map(x=>`<li>${x.d>0?"🔺":"🔻"} ${x.txt}</li>`).join("")}</ul></div>`:""}

    <h2>Dépenses par catégorie</h2>
    <div class="card" id="cat-tree"></div>

    <div class="card row" id="tr-row" style="cursor:pointer">
      <div class="d"><b>Transferts & paiements de cartes</b><div class="small muted">${trs.length} mouvements exclus des dépenses (anti-double comptage)</div></div>
      <div class="sp"></div><div class="m muted">${fmt$.format(trTot)} ›</div>
    </div>

    <h2>Transactions</h2>
    <input class="search" id="tx-search" placeholder="Rechercher une transaction…">
    <div id="tx-list"></div>`;

  /* --- catégories repliables (catégorie → commerçants) --- */
  const parCat = {};
  for (const t of txM(m).filter(t=>t.type==="Dépense")){
    (parCat[t.cat] ||= {total:0, march:{}});
    parCat[t.cat].total += t.montant;
    const k = marchand(t.desc);
    parCat[t.cat].march[k] = (parCat[t.cat].march[k]||0) + t.montant;
  }
  const catsTriees = Object.entries(parCat).sort((a,b)=>b[1].total-a[1].total);
  const maxCat = catsTriees.length ? catsTriees[0][1].total : 1;
  $("cat-tree").innerHTML = catsTriees.map(([c,v],i)=>`
    <div class="cat-row" data-i="${i}" style="padding:10px 0; border-bottom:1px solid var(--border); cursor:pointer">
      <div class="row">
        <div class="ic" style="width:34px;height:34px;min-width:34px;border-radius:10px;background:var(--card2);display:grid;place-items:center">${EMOJI[c]||"❔"}</div>
        <div class="d" style="flex:1"><b style="font-size:.92rem">${c}</b>
          <div style="height:5px;border-radius:3px;background:var(--card2);margin-top:5px"><div style="height:5px;border-radius:3px;background:var(--pos);width:${Math.round(v.total/maxCat*100)}%"></div></div>
        </div>
        <div style="text-align:right"><b>${fmt$.format(v.total)}</b><div class="small muted">${fmtPct(d?v.total/d:0)} <span class="chev">›</span></div></div>
      </div>
      <div class="cat-detail" id="cat-d-${i}" style="display:none; padding:8px 0 2px 44px">
        ${Object.entries(v.march).sort((a,b)=>b[1]-a[1]).map(([n,t])=>`
          <div class="row" style="padding:5px 0"><span class="small">${n}</span><span class="sp"></span><span class="small"><b>${fmt$2.format(t)}</b></span></div>`).join("")}
      </div>
    </div>`).join("") || `<div class="empty small">Aucune dépense ce mois-ci.</div>`;
  document.querySelectorAll(".cat-row").forEach(el=>el.onclick=()=>{
    const det = $("cat-d-"+el.dataset.i);
    const ouvert = det.style.display !== "none";
    det.style.display = ouvert ? "none" : "block";
    el.querySelector(".chev").textContent = ouvert ? "›" : "⌄";
  });

  /* --- feuille transferts --- */
  $("tr-row").onclick = () => sheet(`
    <h2 style="margin-top:0">Transferts & paiements — ${moisLabel(m)}</h2>
    <p class="small muted">Ces mouvements sont exclus des dépenses et des revenus : c'est de l'argent qui circule entre vos comptes, pas de la consommation. Touchez-en un pour le reclasser si besoin.</p>
    ${trs.map(t=>`<div class="tx" data-id="${t.id}"><div class="ic">${t.apparie?"🔗":"✔️"}</div>
      <div class="d"><b>${marchand(t.desc)}</b><span>${t.date} · ${t.source}${t.apparie?" · apparié automatiquement":""}</span></div>
      <div class="m muted">${fmt$2.format(t.montant)}</div></div>`).join("") || '<div class="empty small">Aucun transfert ce mois-ci.</div>'}
    <button class="btn sec" onclick="closeSheet()">Fermer</button>`) ||
    setTimeout(()=>document.querySelectorAll("#sheet-body .tx").forEach(el=>el.onclick=()=>{closeSheet(); ficheTx(el.dataset.id);}),50);

  /* --- liste des transactions (dépenses & revenus) --- */
  const lesTx = txM(m).filter(t=>t.type!=="Transfert").slice().sort((a,b)=>b.date.localeCompare(a.date));
  const jours = {};
  for (const t of lesTx) (jours[t.date] ||= []).push(t);
  const liste = filtre => {
    $("tx-list").innerHTML = Object.entries(jours).map(([dd, arr])=>{
      const vis = arr.filter(t=>!filtre || t.desc.toLowerCase().includes(filtre) || t.cat.toLowerCase().includes(filtre));
      if (!vis.length) return "";
      return `<div class="day-h">${+dd.slice(8)} ${moisLabel(m)}</div>` + vis.map(t=>`
        <div class="tx" data-id="${t.id}">
          <div class="ic">${EMOJI[t.cat]||"❔"}</div>
          <div class="d"><b>${marchand(t.desc)}</b><span>${t.cat}${t.type==="Revenu"?" · Revenu":""}</span></div>
          <div class="m ${t.type==="Revenu"?"pos":""}">${t.type==="Revenu"?"+":""}${fmt$2.format(t.montant)}</div>
        </div>`).join("");
    }).join("") || vide("Aucun résultat.");
    document.querySelectorAll("#tx-list .tx").forEach(el=>el.onclick=()=>ficheTx(el.dataset.id));
  };
  liste("");
  $("tx-search").oninput = e => liste(e.target.value.toLowerCase());
}

function ficheTx(id){
  const t = S.tx.find(x=>x.id===id); if(!t) return;
  const toutes = [...new Set([...Object.keys(EMOJI), ...cats()])].filter(c=>c!=="Non catégorisé").sort();
  sheet(`
    <h2 style="margin-top:0">${marchand(t.desc)}</h2>
    <p class="small muted">${t.desc}<br>${t.date} · ${t.source} · ${fmt$2.format(t.montant)}</p>
    <label>Catégorie</label>
    <select id="f-cat">${toutes.map(c=>`<option ${c===t.cat?"selected":""}>${c}</option>`).join("")}<option ${t.cat==="Non catégorisé"?"selected":""}>Non catégorisé</option></select>
    <label>Type</label>
    <select id="f-type">${["Dépense","Revenu","Transfert"].map(x=>`<option ${x===t.type?"selected":""}>${x}</option>`).join("")}</select>
    <button class="btn" id="f-save">Enregistrer</button>
    <button class="btn sec" id="f-cancel">Annuler</button>`);
  $("f-cancel").onclick = closeSheet;
  $("f-save").onclick = async () => {
    const cat = $("f-cat").value, type = $("f-type").value;
    const change = cat !== t.cat;
    t.cat = cat; t.type = type; t.manuel = true;
    await DB.put("tx", t);
    closeSheet(); render();
    if (change){
      const mot = marchand(t.desc).toUpperCase().split(" ")[0];
      setTimeout(()=>sheet(`
        <h2 style="margin-top:0">Créer une règle ?</h2>
        <p class="small muted">Classer automatiquement toutes les transactions contenant ce mot — passées et futures.</p>
        <label>Mot-clé</label><input id="r-mot" value="${mot}">
        <label>Catégorie</label><input id="r-cat" value="${cat}" readonly>
        <button class="btn" id="r-oui">Oui, toujours classer ainsi</button>
        <button class="btn sec" id="r-non">Non, juste celle-ci</button>`), 250);
      setTimeout(()=>{
        $("r-non").onclick = closeSheet;
        $("r-oui").onclick = async () => {
          await DB.put("regles", {mot:$("r-mot").value.trim(), cat, typeForce:null});
          S.regles = await DB.all("regles");
          await recategoriserTout();
          closeSheet(); render(); toast("Règle créée et appliquée à tout l'historique.");
        };
      }, 300);
    }
  };
}

function rYear(){
  const ms = months(), b = $("year-body");
  if (!ms.length){ b.innerHTML = vide("Importez un relevé pour voir votre année."); return; }
  const an = S.mois.slice(0,4);
  const msAn = ms.filter(x=>x.startsWith(an));
  const fluxes = ms.map(flux), deps = ms.map(dep);
  const cumDep = msAn.map(dep).reduce((a,v)=>a+v,0);
  const cumRev = msAn.map(rev).reduce((a,v)=>a+v,0);
  const best = ms[fluxes.indexOf(Math.max(...fluxes))], worst = ms[fluxes.indexOf(Math.min(...fluxes))];
  const grosse = S.tx.filter(t=>t.type==="Dépense").sort((a,b)=>b.montant-a.montant)[0];
  const restants = 12 - +S.mois.slice(5,7);
  const moitie1 = msAn.slice(0, Math.ceil(msAn.length/2)).map(dep);
  const moitie2 = msAn.slice(Math.ceil(msAn.length/2)).map(dep);
  const tendance = msAn.length>=4 ? (avg(moitie2)>avg(moitie1)*1.05 ? "🔺 en hausse" : (avg(moitie2)<avg(moitie1)*0.95 ? "🔻 en baisse" : "→ stable")) : null;
  b.innerHTML = `
    <h2>Cumul ${an}</h2>
    <div class="grid2">
      <div class="card"><div class="kpi-label">Revenus cumulés</div><div class="kpi-value">${fmt$.format(cumRev)}</div></div>
      <div class="card"><div class="kpi-label">Dépenses cumulées</div><div class="kpi-value">${fmt$.format(cumDep)}</div></div>
      <div class="card"><div class="kpi-label">Épargne cumulée</div><div class="kpi-value ${cumRev-cumDep>=0?"pos":"neg"}">${fmt$.format(cumRev-cumDep)}</div></div>
      <div class="card"><div class="kpi-label">Tendance de consommation</div><div class="kpi-value" style="font-size:1.1rem">${tendance||"—"}</div>
        <div class="kpi-sub">${tendance?"2e moitié vs 1re moitié de l'année":"Visible après 4 mois"}</div></div>
    </div>
    <h2>Épargne et cumul de l'année</h2>
    <div class="card"><div class="chart-box"><canvas id="ch-flux"></canvas></div></div>
    <div class="card"><div class="chart-box"><canvas id="ch-cumul"></canvas></div></div>
    <h2>Revenus vs dépenses par mois</h2>
    <div class="card"><div class="chart-box"><canvas id="ch-an"></canvas></div></div>
    <div class="grid2">
      <div class="badge"><span>Meilleur mois</span><b>${moisLabel(best)} · ${fmt$.format(Math.max(...fluxes))}</b></div>
      <div class="badge"><span>Pire mois</span><b>${moisLabel(worst)} · ${fmt$.format(Math.min(...fluxes))}</b></div>
      <div class="badge"><span>Plus forte dépense</span><b>${grosse?marchand(grosse.desc)+" · "+fmt$2.format(grosse.montant):"—"}</b></div>
      <div class="badge"><span>Mois atypiques</span><b>${(deps.length>=3?ms.filter((x,i)=>deps[i]>avg(deps)+1.5*std(deps)):[]).map(moisCourt).join(", ")||"aucun"}</b></div>
    </div>
    <h2>Valeur nette & dette</h2>
    <div class="card">${S.soldes.length?`<div class="chart-box"><canvas id="ch-vn"></canvas></div>`:`<div class="empty small">Saisissez vos soldes mensuels (Plus → Patrimoine) pour suivre valeur nette et dette.</div>`}</div>
    <h2>Projections fin ${an}</h2>
    <div class="grid2">
      <div class="card"><div class="kpi-label">Dépenses fin ${an}</div><div class="kpi-value">${fmt$.format(cumDep+avg(deps)*restants)}</div></div>
      <div class="card"><div class="kpi-label">Épargne fin ${an}</div><div class="kpi-value">${fmt$.format((cumRev-cumDep)+avg(fluxes)*restants)}</div></div>
      <div class="card"><div class="kpi-label">Valeur nette +12 mois</div><div class="kpi-value">${S.soldes.length?fmt$.format(linProj(S.soldes.map(s=>s.vn),12)):"—"}</div></div>
      <div class="card"><div class="kpi-label">Dette +12 mois</div><div class="kpi-value">${S.soldes.length?fmt$.format(Math.max(0,linProj(S.soldes.map(s=>s.passifs),12))):"—"}</div></div>
    </div>
    <p class="small muted">${ms.length<3?"Estimations préliminaires — elles s'affineront avec l'historique.":"Basé sur vos tendances historiques."}</p>`;
  const pos = css("--pos"), neg = css("--neg"), blue = css("--blue"), gold = css("--gold");
  mkChart("ch-flux", {type:"bar",
    data:{labels:ms.map(moisCourt), datasets:[{label:"Épargne (flux net) par mois", data:fluxes,
      backgroundColor:fluxes.map(v=>v>=0?pos:neg), borderRadius:5, maxBarThickness:26}]},
    options:baseOpts()});
  let cd=0, cr=0;
  mkChart("ch-cumul", {type:"line",
    data:{labels:msAn.map(moisCourt), datasets:[
      {label:"Revenus cumulés", data:msAn.map(x=>cr+=rev(x)), borderColor:blue, backgroundColor:blue+"22", fill:true, tension:.3, pointRadius:3},
      {label:"Dépenses cumulées", data:msAn.map(x=>cd+=dep(x)), borderColor:neg, backgroundColor:neg+"22", fill:true, tension:.3, pointRadius:3}]},
    options:baseOpts()});
  mkChart("ch-an", {type:"bar",
    data:{labels:ms.map(moisCourt), datasets:[
      {label:"Revenus", data:ms.map(rev), backgroundColor:blue, borderRadius:5, maxBarThickness:22},
      {label:"Dépenses", data:ms.map(dep), backgroundColor:neg, borderRadius:5, maxBarThickness:22}]},
    options:baseOpts()});
  if (S.soldes.length) mkChart("ch-vn", {type:"line",
    data:{labels:S.soldes.map(x=>moisCourt(x.mois)), datasets:[
      {label:"Valeur nette", data:S.soldes.map(x=>x.vn), borderColor:pos, backgroundColor:pos+"33", fill:true, tension:.35, pointRadius:3},
      {label:"Dette", data:S.soldes.map(x=>x.passifs), borderColor:gold, tension:.35, pointRadius:3}]},
    options:baseOpts()});
}

function rMerch(){
  const b = $("merch-body"), ms = months();
  if (!ms.length){ b.innerHTML = vide("Importez un relevé pour analyser vos commerçants."); return; }
  const list = marchands().slice(0,20);
  b.innerHTML = `<div class="card">` + list.map((x,i)=>{
    const h = Object.entries(x.byMonth).filter(([k])=>k!==S.mois).map(([,v])=>v);
    const c = x.byMonth[S.mois] && h.length ? compare(x.byMonth[S.mois], avg(h)) : null;
    return `<div class="tx" data-n="${x.name}">
      <div class="ic small muted">${i+1}</div>
      <div class="d"><b>${x.name}</b><span>${x.n} visites · panier moyen ${fmt$2.format(x.moy)}</span></div>
      <div style="text-align:right"><div class="m">${fmt$.format(x.total)}</div><div class="small">${deltaHTML(c,true)}</div></div>
    </div>`;
  }).join("") + `</div>`;
  document.querySelectorAll("#merch-body .tx").forEach(el=>el.onclick=()=>{
    const x = list.find(y=>y.name===el.dataset.n);
    sheet(`<h2 style="margin-top:0">${x.name}</h2>
      <p class="small muted">${x.n} visites · total ${fmt$2.format(x.total)} · panier moyen ${fmt$2.format(x.moy)}</p>
      <ul class="feed">${months().map(mm=>`<li class="row"><span>${moisLabel(mm)}</span><span class="sp"></span><b>${fmt$2.format(x.byMonth[mm]||0)}</b></li>`).join("")}</ul>
      <button class="btn sec" onclick="closeSheet()">Fermer</button>`);
  });
}

function rMore(){
  $("rules-list").innerHTML = S.regles.slice().sort((a,b)=>a.mot.localeCompare(b.mot)).map(r=>
    `<li class="row"><span><b>${r.mot}</b> → ${r.cat}${r.typeForce?" · "+r.typeForce:""}</span><span class="sp"></span>
     <button class="btn sec mini" data-id="${r.id}">✕</button></li>`).join("");
  document.querySelectorAll("#rules-list button").forEach(btn=>btn.onclick=async()=>{
    await DB.del("regles", +btn.dataset.id);
    S.regles = await DB.all("regles"); await recategoriserTout(); rMore(); toast("Règle supprimée.");
  });
  $("backup-info").textContent = `${S.tx.length} transactions · ${months().length} mois · ${S.regles.length} règles · ${S.soldes.length} soldes`;
}

/* ================= IMPORT PDF ================= */
async function extraireapages(file){
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({data: buf}).promise;
  const pages = [];
  for (let i=1; i<=doc.numPages; i++){
    const tc = await (await doc.getPage(i)).getTextContent();
    pages.push({items: tc.items.map(it=>({s:it.str, x:it.transform[4], y:it.transform[5], w:it.width}))});
  }
  return pages;
}
async function importerPDF(files){
  const statut = $("import-status");
  let nouveaux = [], doublons = 0, resume = [];
  const ids = new Set(S.tx.map(t=>t.id));
  for (const f of files){
    statut.textContent = "Lecture de " + f.name + "…";
    try {
      const r = Parseurs.parseStatement(await extraireapages(f));
      let n = 0;
      for (const t of r.transactions){
        const id = `${t.date}|${t.desc}|${t.montant.toFixed(2)}|${r.source}`;
        if (ids.has(id)){ doublons++; continue; }
        ids.add(id);
        const c = categoriser(t.desc, t.typeAuto);
        nouveaux.push({id, date:t.date, desc:t.desc, montant:t.montant, typeAuto:t.typeAuto,
          type:c.type, cat:c.cat, source:r.source, mois:t.date.slice(0,7), manuel:false});
        n++;
      }
      resume.push(`${f.name} → ${r.source} : ${n} nouvelles`);
    } catch(e){ resume.push(`${f.name} : ⚠️ ${e.message}`); }
  }
  statut.textContent = "";
  if (!nouveaux.length){
    sheet(`<h2 style="margin-top:0">Import terminé</h2>
      <ul class="feed">${resume.map(x=>`<li>${x}</li>`).join("")}</ul>
      <p class="small muted">${doublons?doublons+" transactions déjà présentes ont été ignorées (anti-doublons).":"Aucune nouvelle transaction."}</p>
      <button class="btn sec" onclick="closeSheet()">Fermer</button>`);
    return;
  }
  const depN = nouveaux.filter(t=>t.type==="Dépense").reduce((a,t)=>a+t.montant,0);
  sheet(`<h2 style="margin-top:0">Aperçu de l'import</h2>
    <ul class="feed">${resume.map(x=>`<li>${x}</li>`).join("")}</ul>
    <p class="small" style="margin-top:8px"><b>${nouveaux.length}</b> nouvelles transactions · ${fmt$2.format(depN)} de dépenses
    ${doublons?`· <span class="muted">${doublons} doublons ignorés</span>`:""}</p>
    <div style="max-height:32vh; overflow-y:auto; margin-top:8px">${nouveaux.slice(0,60).map(t=>`
      <div class="tx"><div class="ic">${EMOJI[t.cat]||"❔"}</div>
      <div class="d"><b>${marchand(t.desc)}</b><span>${t.date} · ${t.cat}</span></div>
      <div class="m">${fmt$2.format(t.montant)}</div></div>`).join("")}</div>
    <button class="btn" id="imp-ok">Confirmer l'import</button>
    <button class="btn sec" id="imp-no">Annuler</button>`);
  $("imp-no").onclick = closeSheet;
  $("imp-ok").onclick = async () => {
    for (const t of nouveaux) await DB.put("tx", t);
    S.tx = await DB.all("tx");
    const nAp = apparierTransferts();
    closeSheet(); go("today");
    if (nAp) toast(nAp + " paiement(s) de carte apparié(s) et exclu(s) des dépenses.");
    toast(`${nouveaux.length} transactions importées.`);
    setTimeout(()=>sheet(`<h2 style="margin-top:0">Sauvegarder maintenant ?</h2>
      <p class="small muted">Réflexe recommandé après chaque import : enregistrez le fichier dans Fichiers / iCloud Drive. C'est votre coffre-fort.</p>
      <button class="btn" id="b-oui">Sauvegarder (.json)</button>
      <button class="btn sec" onclick="closeSheet()">Plus tard</button>`), 600);
    setTimeout(()=>{ const b=$("b-oui"); if(b) b.onclick=()=>{ sauvegarde(); closeSheet(); }; }, 650);
  };
}

/* ================= PATRIMOINE ================= */
function feuilleSoldes(){
  const mois = S.mois || new Date().toISOString().slice(0,7);
  const s = soldeOf(mois) || {mois, celi:0, reer:0, liquide:0, amex:0, carte2:0, pret:0, autres:0};
  const champ = (id,lab,val)=>`<label>${lab}</label><input id="${id}" type="number" inputmode="decimal" step="0.01" value="${val||0}">`;
  sheet(`<h2 style="margin-top:0">Soldes — ${moisLabel(mois)}</h2>
    ${champ("so-celi","CELI",s.celi)}${champ("so-reer","REER",s.reer)}${champ("so-liq","Épargne liquide (compte)",s.liquide)}
    ${champ("so-amex","Solde AMEX",s.amex)}${champ("so-c2","Solde autre carte",s.carte2)}
    ${champ("so-pret","Prêt auto",s.pret)}${champ("so-aut","Autres dettes",s.autres)}
    <button class="btn" id="so-save">Enregistrer</button>
    <button class="btn sec" onclick="closeSheet()">Annuler</button>`);
  $("so-save").onclick = async () => {
    const v = id => parseFloat($(id).value)||0;
    const o = {mois, celi:v("so-celi"), reer:v("so-reer"), liquide:v("so-liq"),
      amex:v("so-amex"), carte2:v("so-c2"), pret:v("so-pret"), autres:v("so-aut")};
    o.actifs = o.celi+o.reer+o.liquide;
    o.passifs = o.amex+o.carte2+o.pret+o.autres;
    o.vn = o.actifs-o.passifs;
    await DB.put("soldes", o);
    S.soldes = (await DB.all("soldes")).sort((a,b)=>a.mois.localeCompare(b.mois));
    closeSheet(); render(); toast("Soldes enregistrés — valeur nette : "+fmt$.format(o.vn));
  };
}

/* ================= SAUVEGARDE / EXPORTS ================= */
function sauvegarde(){
  const data = {app:"Pilote", version:1, exporte:new Date().toISOString(), tx:S.tx, regles:S.regles, soldes:S.soldes};
  download(`Pilote_sauvegarde_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data), "application/json");
  toast("Sauvegarde générée — enregistrez-la dans Fichiers / iCloud.");
}
async function restaurer(file){
  try {
    const data = JSON.parse(await file.text());
    if (data.app!=="Pilote" || !Array.isArray(data.tx)) throw new Error("format inattendu");
    await DB.clear("tx"); await DB.clear("regles"); await DB.clear("soldes");
    for (const t of data.tx) await DB.put("tx", t);
    for (const r of data.regles||[]) await DB.put("regles", r);
    for (const s of data.soldes||[]) await DB.put("soldes", s);
    await chargerEtat();
    apparierTransferts();
    go("today");
    toast(`Restauré : ${S.tx.length} transactions, ${S.regles.length} règles.`);
  } catch(e){ toast("Restauration impossible : " + e.message); }
}
function exportCSV(){
  const lignes = [["Date","Description","Montant","Type","Catégorie","Source","Mois"]];
  for (const t of S.tx.slice().sort((a,b)=>a.date.localeCompare(b.date)))
    lignes.push([t.date, t.desc.replace(/"/g,"'"), t.montant.toFixed(2), t.type, t.cat, t.source, t.mois]);
  download("Pilote_Transactions.csv", "\ufeff"+lignes.map(l=>l.map(c=>`"${c}"`).join(";")).join("\n"), "text/csv");
}
function exportXLSX(){
  const wb = XLSX.utils.book_new();
  const txRows = S.tx.slice().sort((a,b)=>a.date.localeCompare(b.date))
    .map(t=>({Date:t.date, Description:t.desc, Montant:t.montant, Type:t.type, "Catégorie":t.cat, Source:t.source, Mois:t.mois}));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "Transactions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.soldes.map(s=>({Mois:s.mois, CELI:s.celi, REER:s.reer,
    "Épargne liquide":s.liquide, "Solde AMEX":s.amex, "Autre carte":s.carte2, "Prêt auto":s.pret, "Autres dettes":s.autres,
    Actifs:s.actifs, Passifs:s.passifs, "Valeur nette":s.vn}))), "Soldes");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(S.regles.map(r=>({"MotClé":r.mot, "Catégorie":r.cat, "TypeForcé":r.typeForce||""}))), "Règles");
  XLSX.writeFile(wb, "Pilote_Export.xlsx");
}

/* ================= DÉMARRAGE ================= */
async function chargerEtat(){
  S.tx = await DB.all("tx");
  S.regles = await DB.all("regles");
  S.soldes = (await DB.all("soldes")).sort((a,b)=>a.mois.localeCompare(b.mois));
  if (!S.regles.length){
    for (const [mot,cat,typeForce] of REGLES_DEFAUT) await DB.put("regles", {mot, cat, typeForce:typeForce||null});
    S.regles = await DB.all("regles");
  }
}
window.closeSheet = closeSheet;
(async function init(){
  if (typeof pdfjsLib !== "undefined") pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  await DB.open();
  await chargerEtat();
  if (S.tx.length) apparierTransferts();   /* migration : appariement des données existantes */
  document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>go(b.dataset.s));
  $("sheet-bg").onclick = closeSheet;
  $("btn-import").onclick = () => $("pdf-input").click();
  $("pdf-input").onchange = e => { if(e.target.files.length) importerPDF([...e.target.files]); e.target.value=""; };
  $("btn-soldes").onclick = feuilleSoldes;
  $("btn-backup").onclick = sauvegarde;
  $("btn-restore").onclick = () => $("restore-input").click();
  $("restore-input").onchange = e => { if(e.target.files[0]) restaurer(e.target.files[0]); e.target.value=""; };
  $("btn-csv").onclick = exportCSV;
  $("btn-xlsx").onclick = exportXLSX;
  $("btn-theme").onclick = () => {
    const t = document.documentElement.dataset.theme==="dark"?"light":"dark";
    document.documentElement.dataset.theme = t;
    DB.put("meta",{k:"theme",v:t}); render();
  };
  $("btn-add-rule").onclick = () => {
    sheet(`<h2 style="margin-top:0">Nouvelle règle</h2>
      <label>Mot-clé (contenu dans la description)</label><input id="nr-mot" placeholder="ex. STARBUCKS">
      <label>Catégorie</label><input id="nr-cat" placeholder="ex. Restaurants">
      <button class="btn" id="nr-ok">Créer et appliquer</button>
      <button class="btn sec" onclick="closeSheet()">Annuler</button>`);
    $("nr-ok").onclick = async () => {
      const mot = $("nr-mot").value.trim(), cat = $("nr-cat").value.trim();
      if (!mot || !cat) return;
      await DB.put("regles", {mot, cat, typeForce:null});
      S.regles = await DB.all("regles"); await recategoriserTout();
      closeSheet(); render(); toast("Règle créée et appliquée.");
    };
  };
  $("btn-wipe").onclick = () => sheet(`<h2 style="margin-top:0">Tout effacer ?</h2>
    <p class="small muted">Toutes les données locales seront supprimées. Assurez-vous d'avoir une sauvegarde .json.</p>
    <button class="btn" style="background:var(--neg)" id="w-oui">Oui, tout effacer</button>
    <button class="btn sec" onclick="closeSheet()">Annuler</button>`);
  document.addEventListener("click", async e => {
    if (e.target.id === "w-oui"){
      await DB.clear("tx"); await DB.clear("soldes");
      await chargerEtat(); closeSheet(); go("today"); toast("Données effacées.");
    }
  });
  const th = (await DB.all("meta")).find(x=>x.k==="theme");
  if (th) document.documentElement.dataset.theme = th.v;
  go("today");
})();
