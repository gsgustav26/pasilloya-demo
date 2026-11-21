// ==================== BOT DE PASILLOYA (versión 1) ====================
// Asistente de compras que funciona SIN internet ni IA: entiende frases comunes con reglas.
// Si la página corre dentro de Claude con IA activa, lo que no entiende se lo pregunta a la IA.
//
// CÓMO MEJORARLO (se hace aquí, sin tocar la página):
//   1. RELLENO: palabras que el bot ignora al buscar productos («trae», «porfa», «mami»...).
//   2. UNIDADES y NUMEROS: cómo se piden cantidades («2 latas», «una funda»).
//   3. INTENCIONES: reglas «si el mensaje dice X, responde Y». Se revisan en orden.
//   4. Lo que el bot no entendió queda en BOT_NO_ENTENDIO y se ve en «Vista empresa» para agregar reglas nuevas.

const RELLENO=new Set(("hola buenas buenos buen dia dias tarde tardes noche noches que tal porfa porfis porfavor favor por xfa plis please "+
  "trae traeme traer traigan traes compra comprame comprar compras compran necesito necesitamos necesita quiero queremos quisiera "+
  "me nos te le un una unos unas uno de del la el los las lo al para tambien y e o mas algo ahi pasa pasate pasar super supermercado "+
  "mami mama papi papa amor mi mis tu gracias ok acuerdate olvides no falta faltan hace hacen ya vez cuando vengas vienes regreso "+
  "donde esta estan encuentro encuentra consigo hay tienen tiene tendran queda quedan cuanto cuesta cuestan vale valen precio "+
  "barato barata baratos baratas economico economica saludable saludables sano sana light conviene rinde mejor menos dieta busco buscar "+
  "ver dime decir sabes oye disculpa porfas pls cual cuales recomiendas recomienda es son sera se pases pasas vayas vas "+
  "lista lunes martes miercoles jueves viernes sabado domingo semana semanal hoy manana mes quincena casa pendientes").split(" ").map(norm));
const UNIDADES=new Set(("lata latas paquete paquetes funda fundas kilo kilos kg litro litros lt botella botellas caja cajas frasco frascos "+
  "libra libras lb gramos gr unidad unidades docena docenas cubeta cubetas tarro tarros sobre sobres bolsa bolsas pote potes").split(" "));
const NUMEROS={un:1,una:1,uno:1,dos:2,tres:3,cuatro:4,cinco:5,seis:6,media:1,medio:1,par:2};

// Saca los productos de un mensaje de WhatsApp o de una lista de Notas del celular (una cosa por línea,
// con viñetas, casillas ☐ ☑ - [ ] o números). Ej.: «Hola mami, trae 2 atunes, leche y pan porfa»
// o «☐ Leche x2 / ☐ Atún / ✓ Arroz» → leche ×2, atún, arroz.
function extraer(texto){
  // En Notas, lo que ya está tachado (✓ ☑ [x]) se da por comprado y no se busca.
  texto=texto.split("\n").filter(l=>!/^\s*(?:[-*•]\s*)?(?:[☑☒✅✔✓]|\[\s?x\s?\])/i.test(l)).join("\n");
  const limpio=norm(texto).replace(/^\s*(?:(?:[-*•·▪◦–—☐□■]|\[\s?\]|\d+[.)])\s*)+/gim,"");
  const trozos=limpio.split(/[\n,;:]+|\.(?:\s+|$)|\s+(?:y|e)\s+|\s+[-–]\s+/);
  const out=[];
  for(const t of trozos){
    let qty=1; const quedan=[];
    for(const w of t.replace(/[¿?¡!()"]/g," ").split(/\s+/).filter(Boolean)){
      if(/^\d+$/.test(w)){ qty=Math.min(+w,20); continue }
      if(/^[x×]\d+$/.test(w)){ qty=Math.min(+w.slice(1),20); continue }
      if(/^\d+[x×]?(kg|g|gr|ml|l|lt|lb)?$/.test(w)) continue;
      if(w in NUMEROS && quedan.length===0){ qty=NUMEROS[w]; continue }
      if(RELLENO.has(w)||UNIDADES.has(w)) continue;
      quedan.push(w);
    }
    const resto=quedan.join(" ").trim(); if(!resto) continue;
    // En frases largas con palabras que no conoce («busco algo para lavar platos») prueba palabra por palabra.
    // En nombres cortos no: «leche de almendras» debe salir como «no lo hay», no como leche entera.
    const p=hallar(resto)||(quedan.length<3?null:[...quedan].sort((a,b)=>b.length-a.length).filter(w=>w.length>3).map(w=>localFind(w)).find(Boolean))||null;
    const ya=p&&out.find(x=>x.p===p);
    if(ya) ya.qty+=qty; else out.push({txt:resto,p,qty});
  }
  return out;
}

// ---------------- Respuestas ----------------
const BOT_NO_ENTENDIO=[];
const lista3=l=>l.slice(0,4).map(a=>altHtml(a)).join("");
const mismos=p=>P.filter(x=>x.cat===p.cat&&x.stock>0);
const ubic=p=>`pasillo ${p.pasillo}, ${p.lado==="D"?"lado derecho":"lado izquierdo"}, estante ${p.estante}, ${NIVEL[p.nivel]}`;

// Cada intención: {si: (mensaje normalizado, producto encontrado) => true/false, responde: (...) => respuesta}
// Una respuesta es {txt, cards (html de productos), botones: [[texto, acción]]}
const INTENCIONES=[
  { si:(n,p,items)=>items.filter(x=>x.p).length>=2,
    responde:(n,p,items)=>{ const ok=items.filter(x=>x.p), no=items.filter(x=>!x.p); armarLista(items,{quedarse:true});
      return {txt:`Listo, entendí ${ok.length} ${ok.length===1?"producto":"productos"} y armé tu ruta por pasillos:\n`+
        ok.map(x=>`• ${x.p.nombre}${x.qty>1?` ×${x.qty}`:""} → pasillo ${x.p.pasillo}`).join("\n")+
        (no.length?`\n\nNo encontré en este local: ${no.map(x=>x.txt).join(", ")}.`:""), botones:[["Ver mi ruta","ruta"]]} } },
  { si:n=>/^(hola|buen[oa]s|que tal|hey|saludos)\b/.test(n)&&!/donde|cuanto|hay /.test(n),
    responde:()=>({txt:"¡Hola! Soy el asistente del súper. Pregúntame dónde está algo, compárame marcas o pégame tu lista tal como la escribiste y te armo la ruta."}) },
  { si:n=>/gracias|chevere|genial|excelente/.test(n),
    responde:()=>({txt:"¡Con gusto! Si necesitas algo más, aquí estoy. 🛒"}) },
  { si:n=>/ayuda|que (puedes|sabes)|como funciona|que haces/.test(n),
    responde:()=>({txt:"Puedo:\n• Decirte el pasillo, estante y altura de un producto.\n• Decirte si hay y cuánto cuesta.\n• Darte la opción más barata, más saludable o la que más rinde.\n• Leer tu lista (aunque venga en un mensaje) y ordenarte la ruta.\n• Mostrarte qué hay en cada pasillo."}) },
  { si:n=>/pasillo\s*\d/.test(n),
    responde:n=>{ const k=+n.match(/pasillo\s*(\d)/)[1]; const l=P.filter(x=>x.pasillo===k);
      return l.length?{txt:`En el pasillo ${k} (${PASILLOS[k]}) hay:`,cards:lista3(l),botones:[[`Ver todo el pasillo ${k}`,"pasillo:"+k]]}:{txt:"Este local tiene pasillos del 1 al 8."} } },
  { si:(n,p)=>p&&/barat|economic|ahorr|menos plata/.test(n),
    responde:(n,p)=>{ const l=[...mismos(p)].sort((a,b)=>a.precio-b.precio); return {txt:`La ${p.cat} más barata es ${l[0].nombre} de ${l[0].marca}, a ${money(l[0].precio)}, en el ${ubic(l[0])}.`,cards:lista3(l)} } },
  { si:(n,p)=>p&&/sano|saludable|light|menos (azucar|grasa|sal)|dieta|sin azucar/.test(n),
    responde:(n,p)=>{ const l=[...mismos(p)].sort((a,b)=>health(a)-health(b)||a.precio-b.precio); return {txt:`La opción más saludable es ${l[0].nombre} de ${l[0].marca} (${healthTxt(l[0])}), a ${money(l[0].precio)}.`,cards:lista3(l)} } },
  { si:(n,p)=>p&&/rinde|conviene|por kilo|por gramo|mejor precio/.test(n),
    responde:(n,p)=>{ const l=[...mismos(p)].sort((a,b)=>a.precio/a.tam-b.precio/b.tam); return {txt:`La que más rinde por tu plata es ${l[0].nombre} de ${l[0].marca}: ${unit(l[0])}.`,cards:lista3(l)} } },
  { si:(n,p)=>p&&/cuanto|precio|cuesta|vale/.test(n),
    responde:(n,p)=>({txt:`${p.nombre} de ${p.marca} cuesta ${money(p.precio)} (${unit(p)}). Está en el ${ubic(p)}.`,cards:lista3(mismos(p).filter(x=>x.id!==p.id)),botones:[["Agregar a mi ruta","add:"+p.id]]}) },
  { si:(n,p)=>p&&/hay |tienen|tiene |queda|stock|disponible|tendran/.test(" "+n+" "),
    responde:(n,p)=>{ if(p.stock>0) return {txt:`Sí, hay ${p.nombre} de ${p.marca}${p.stock<10?" (quedan pocas)":""}. Está en el ${ubic(p)}.`,botones:[["Ver dónde está","ver:"+p.id],["Agregar a mi ruta","add:"+p.id]]};
      const s=mismos(p)[0]; return {txt:`Hoy ${p.nombre} de ${p.marca} está agotado.${s?` Te puede servir ${s.nombre} de ${s.marca}, en el ${ubic(s)}.`:""}`,cards:s?altHtml(s):""} } },
  { si:(n,p)=>!!p,
    responde:(n,p)=>({txt:`${p.nombre} de ${p.marca} está en el ${ubic(p)}. Cuesta ${money(p.precio)}.`,botones:[["Ver en la percha","ver:"+p.id],["Agregar a mi ruta","add:"+p.id],["¿Hay una más barata?","q:"+p.cat+" mas barata"]]}) },
];

async function responder(texto){
  const n=norm(texto).trim(); if(!n) return {txt:"Escríbeme qué buscas."};
  const items=extraer(texto), p=items.find(x=>x.p)?.p||null;
  for(const r of INTENCIONES) if(r.si(n,p,items)) return r.responde(n,p,items);
  if(typeof AI!=="undefined"&&AI){
    try{ const r=await askAI(texto); const l=idsToP([r.id,...(r.ids||[])]); return {txt:r.respuesta||"Listo.",cards:lista3(l)} }catch(e){}
  }
  BOT_NO_ENTENDIO.unshift(texto);
  return {txt:"Todavía no entiendo eso 🙈. Prueba con el nombre del producto (ej.: «atún») o pégame tu lista. Ya lo anoté para aprenderlo.",botones:[["¿Qué puedes hacer?","q:ayuda"]]};
}

// ---------------- Pantalla del chat ----------------
const SUGERENCIAS=["¿Dónde está el atún?","Pegar mi lista","¿Cuánto cuesta el aceite?","La salsa de tomate más saludable","¿Qué hay en el pasillo 7?"];
const EJEMPLO="Hola mami, cuando pases por el súper trae 2 atunes, leche deslactosada, arroz, salsa de tomate y pan integral porfa 🙏";
const EJEMPLO_NOTAS="Compras sábado\n☐ Leche deslactosada x2\n☐ Atún\n☐ Arroz\n☐ Huevos\n☐ Aceite\n✓ Detergente\n☐ Leche de almendras";
let botAbierto=false, botIniciado=false;
const bq=s=>document.querySelector(s);
function burbuja(cls,html){ const d=document.createElement("div"); d.className="m "+cls; d.innerHTML=html; bq("#msgs").appendChild(d); bq("#msgs").scrollTop=1e6; return d }
function decir(r){
  burbuja("b",esc(r.txt));
  if(r.cards) burbuja("cards",`<div class="alts">${r.cards}</div>`);
  if(r.botones?.length) burbuja("cards",`<div class="chips">${r.botones.map(([t,a])=>`<button class="chip act" data-bact="${esc(a)}">${esc(t)}</button>`).join("")}</div>`);
}
async function enviar(texto){
  texto=texto.trim(); if(!texto) return;
  burbuja("u",esc(texto));
  const w=burbuja("b",'<span class="thinking">●</span> Escribiendo…');
  const r=await responder(texto); w.remove(); decir(r);
}
function abrirBot(modo){
  bq("#sheet").hidden=false; document.body.style.overflow="hidden"; botAbierto=true;
  if(!botIniciado){ botIniciado=true; decir({txt:"¡Hola! Soy tu asistente de compras. ¿Qué buscas hoy?\nTambién puedes pegarme tu lista tal como te la mandaron por mensaje."}) }
  bq("#qr").innerHTML=SUGERENCIAS.map(s=>`<button class="chip" data-bq="${esc(s)}">${esc(s)}</button>`).join("");
  const ta=bq("#bin");
  if(modo==="lista"){ decir({txt:"Pega aquí tu lista tal como la tienes: copiada de Notas del celular (una cosa por línea) o de un mensaje de WhatsApp.",botones:[["Probar con una lista de Notas","ejn"],["Probar con un mensaje","ej"]]}); }
  // En el celular NO se abre el teclado solo: tapaba la parte de arriba del chat y no se podía cerrar.
  if(!esCelular) setTimeout(()=>ta.focus(),60);
  ajustarAlto();
}
function cerrarBot(){ const s=bq("#sheet"); if(!s||s.hidden) return; bq("#bin").blur(); s.hidden=true; document.body.style.overflow=""; botAbierto=false }
const esCelular=matchMedia("(pointer:coarse)").matches||/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
// Con el teclado abierto, el chat se encoge al espacio que queda visible, así la barra de cerrar nunca se esconde.
function ajustarAlto(){ const s=bq("#sheet"), v=window.visualViewport; if(!s||!v) return; s.style.top=v.offsetTop+"px"; s.style.height=v.height+"px" }
window.visualViewport?.addEventListener("resize",ajustarAlto);
window.visualViewport?.addEventListener("scroll",ajustarAlto);
window.cerrarBot=cerrarBot; window.abrirBot=abrirBot;

bq("#botF").addEventListener("submit",e=>{ e.preventDefault(); const ta=bq("#bin"); const v=ta.value; ta.value=""; ta.style.height=""; enviar(v) });
bq("#bin").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey&&!/Mobi|Android/i.test(navigator.userAgent)){ e.preventDefault(); bq("#botF").requestSubmit() } });
bq("#bin").addEventListener("input",e=>{ const t=e.target; t.style.height=""; t.style.height=Math.min(t.scrollHeight,140)+"px" });
bq("#sheet").addEventListener("click",e=>{
  if(e.target.id==="sheet"||e.target.closest("#botX,.grip")) return cerrarBot();
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.bq){ if(b.dataset.bq==="Pegar mi lista") abrirBot("lista"); else enviar(b.dataset.bq) }
  else if(b.dataset.bact){ const [a,v]=b.dataset.bact.split(":");
    if(a==="ruta"){ cerrarBot(); ir("lista") }
    else if(a==="ver"){ cerrarBot(); fotoUsuario=null; ir("buscar"); mostrar(byId[v]) }
    else if(a==="add"){ if(!lista.includes(v)){ lista.push(v); guardar() } b.textContent="✓ En tu ruta"; b.disabled=true }
    else if(a==="pasillo"){ cerrarBot(); ir("buscar"); verPasillo(+v) }
    else if(a==="q") enviar(v)
    else if(a==="ej") enviar(EJEMPLO)
    else if(a==="ejn") enviar(EJEMPLO_NOTAS) }
  else if(b.dataset.id){ cerrarBot() }
});
document.addEventListener("keydown",e=>{ if(e.key==="Escape") cerrarBot() });
// Deslizar hacia abajo desde la parte de arriba del chat también lo cierra (como en las apps).
{ let y0=null; const h=bq(".chat-top");
  h.addEventListener("touchstart",e=>{ y0=e.touches[0].clientY },{passive:true});
  h.addEventListener("touchend",e=>{ if(y0!==null&&e.changedTouches[0].clientY-y0>60) cerrarBot(); y0=null },{passive:true}); }
