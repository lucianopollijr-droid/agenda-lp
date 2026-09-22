(function(){
'use strict';

/* O documento inteiro vive codificado no bloco #tpl. Publicar = pegar esse
   molde, encaixar o estado novo e devolver o documento completo. Assim a
   pagina nunca serializa o DOM vivo e nao cresce a cada gravacao. */
function utf8FromB64(b){
  var bin=atob(b), arr=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(arr);
}
var TPL_B64 = (document.getElementById('tpl')||{textContent:''}).textContent.trim();
var TPL = TPL_B64 ? utf8FromB64(TPL_B64) : '';

var CATS = {
  audiencia:['Audiência','#4C6377'], pessoal:['Pessoal','#6E7568'], execucao:['Execução','#8A6A3C'],
  imob:['Imobiliário','#2F6259'], suc:['Sucessório','#6C4A61'], emp:['Empresarial','#9C6B49'],
  fin:['Financeiro','#7C7250'], geral:['Geral','#7C7250']
};
var K_MIRROR='agenda-lp-espelho-v2';

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function slug(t){ return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60); }
function iso(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function parse(s){ var p=String(s).split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
function fmtDay(s){ var n=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],d=parse(s); return n[d.getDay()]+' · '+String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); }
function fmtBr(s){ var d=parse(s); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); }
function toMin(t){ var p=String(t).split(':'); return +p[0]*60+ +p[1]; }
function cat(k){ return CATS[k]||CATS.geral; }
function readJson(id,f){ try{ return JSON.parse(document.getElementById(id).textContent); }catch(e){ return f; } }

var D = readJson('dados-do-dia',{});
D.dia = D.dia || iso(new Date());
D.tag = D.tag || 'NORMAL';
D.eventos = D.eventos || []; D.carro = D.carro || {}; D.prazos = D.prazos || [];
D.minhas = D.minhas || []; D.acomp = D.acomp || []; D.esperando = D.esperando || [];

var E = readJson('estado',{});
E.marks = E.marks || {};
E.prazos = E.prazos || {};
E.extra  = E.extra  || [];
E.esp    = E.esp    || {};   /* {slug:{m:'nota',feito:bool,d:''}} */
E.espExtra = E.espExtra || [];
E.notes  = E.notes  || [];
E.ts     = E.ts     || 0;

/* Se o aparelho tem um espelho mais novo que o documento (ficou offline e
   as alteracoes nao subiram), ele vence e sobe na proxima gravacao. */
try {
  var mir = JSON.parse(localStorage.getItem(K_MIRROR)||'null');
  if(mir && mir.ts > E.ts && mir.dia === D.dia) E = mir;
} catch(e){}

var S = { tab:'hoje', pushing:null, pushPrazo:null, anding:null, espando:null, open:null, dResto:false, dFora:false, status:'boot' };
var BASE = D.dia, BD = parse(BASE);

/* ---------- gravacao ---------- */
var api = null, timer = null;

function docWith(state){
  if(!TPL) return null;
  var json = JSON.stringify(state).replace(/</g,'\\u003c');
  return TPL
    .replace('__ESTADO'+'_JSON__', function(){ return json; })
    .replace('__TPL'+'_B64__', function(){ return TPL_B64; });
}

function setStatus(s){ S.status = s; paintStatus(); }

function paintStatus(){
  var el = document.getElementById('savechip');
  if(!el) return;
  var map = {
    boot:['Conectando…','#8B8879'],
    ok:['Salvo','#6E7568'],
    saving:['Salvando…','#A9853F'],
    local:['Só neste aparelho','#9A3A31'],
    err:['Não gravou','#9A3A31'],
    conflict:['Recarregando…','#A9853F']
  };
  var v = map[S.status] || map.ok;
  el.textContent = v[0];
  el.style.color = v[1];
  el.style.borderColor = v[1];
}

function persist(){
  E.ts = Date.now();
  E.dia = D.dia;
  try { localStorage.setItem(K_MIRROR, JSON.stringify(E)); } catch(e){}
  if(!api){ setStatus('local'); return; }
  clearTimeout(timer);
  setStatus('saving');
  timer = setTimeout(function(){
    var html = docWith(E);
    if(!html){ setStatus('err'); return; }
    api.publish(html).then(function(){ setStatus('ok'); }).catch(function(err){
      setStatus(err && err.code === 'conflict' ? 'conflict' : 'err');
    });
  }, 800);
}

if(window.claude && typeof window.claude.use === 'function'){
  window.claude.use('artifact').then(function(a){
    api = a || null;
    setStatus(api ? 'ok' : 'local');
    if(api && E.ts && E.ts > (readJson('estado',{}).ts||0)) persist();
  }).catch(function(){ setStatus('local'); });
} else { setStatus('local'); }

/* ---------- estado das tarefas ---------- */
function markOf(t){ return E.marks[slug(t)]||null; }
function stateOf(t){ var m=markOf(t); return m?m.s:'aberto'; }
function setMark(t,st,mot,quando){
  var k=slug(t);
  if(st==='aberto') delete E.marks[k];
  else E.marks[k]={s:st,m:mot||'',ate:quando||'',d:iso(new Date())};
  S.pushing=null; S.anding=null; persist(); render();
}
function myList(){ return D.minhas.concat(E.extra); }

/* ---------- esperando alguem ---------- */
function espList(){
  return D.esperando.concat(E.espExtra.map(function(x){ x.__meu=true; return x; }));
}
function espOf(t){ return E.esp[slug(t)]||{}; }
function setEsp(t,obj){
  var k=slug(t);
  if(!obj) delete E.esp[k]; else E.esp[k]=obj;
  S.espando=null; persist(); render();
}
function espRow(x){
  var sl=slug(x.titulo), st=espOf(x.titulo), feito=!!st.feito;
  var prazoIgual=null;
  D.prazos.forEach(function(p){ if(slug(p.titulo)===sl) prazoIgual=p; });
  return '<div class="trow"><div class="tinner">'+
    '<span class="box'+(feito?' feito':' and')+'" data-espok="'+sl+'">'+(feito?'✓':'◐')+'</span><div style="flex:1">'+
    '<div class="ttitle'+(feito?' done':'')+'">'+esc(x.titulo)+(x.__meu?' <span class="mine">sua</span>':'')+'</div>'+
    (x.detalhe?'<div class="tsub">'+esc(x.detalhe)+'</div>':'')+
    (st.m?'<div class="tmot">Sua anotação · '+esc(st.m)+'</div>':'')+
    (x.quem?'<div class="tmot">Esperando · '+esc(x.quem)+'</div>':'')+
    (prazoIgual?'<div class="tmot">Também está em Prazos, vencendo '+esc(fmtBr(prazoIgual.vence))+'</div>':'')+
    '<div class="tmeta">'+
      '<button class="ghost" data-espnote="'+sl+'">'+(st.m?'mudar anotação':'anotar')+'</button>'+
      (x.__meu?'<button class="ghost" data-espdel="'+esc(x.titulo)+'">apagar</button>':'')+
    '</div>'+
    (S.espando===sl?'<div class="inline"><input class="field" id="espfield" placeholder="Em que pé está? De quem você está esperando?" value="'+esc(st.m||'')+'">'+
      '<button class="gold" data-espsave="'+sl+'">Ok</button></div>':'')+
    '</div></div></div>';
}

/* ---------- prazos ---------- */
function pzOf(t){ return E.prazos[slug(t)]||null; }
function setPrazo(t,obj){
  var k=slug(t);
  if(!obj) delete E.prazos[k]; else E.prazos[k]=obj;
  S.pushPrazo=null; persist(); render();
}

function deadlines(incluirResolvidos){
  var out=[];
  D.prazos.forEach(function(d){
    var st=pzOf(d.titulo)||{};
    var resolvido = st.s==='resolvido';
    if(resolvido && !incluirResolvidos) return;
    var vence = st.vence || d.vence;
    var n=Math.round((parse(vence)-BD)/86400000), over=n<0, urg=n<=1;
    out.push({
      titulo:d.titulo, sub:d.detalhe, meta:d.processo, sort:n, resolvido:resolvido, fatal:!!d.fatal,
      vence:vence, movido: !!st.vence, motivo: st.m||'', original:d.vence,
      days: over?Math.abs(n):(n===0?'hoje':n),
      unit: over?(Math.abs(n)===1?'dia atrás':'dias atrás'):(n===0?'vence':(n===1?'dia':'dias')),
      badge: over?'ATRASADO':(n===0?'VENCE HOJE':(n===1?'PRAZO · AMANHÃ':'EM '+n+' DIAS')),
      color: (urg||over)?'#9A3A31':'#A9853F',
      tcolor: (urg||over)?'#9A3A31':'#16140E'
    });
  });
  out.sort(function(a,b){return a.sort-b.sort;});
  return out.map(function(d,i){ d.num=String(i+1).padStart(2,'0'); return d; });
}

/* ---------- cabecalho ---------- */
function header(){
  var dn=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  var mo=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  var s=dn[BD.getDay()];
  document.getElementById('topdate').textContent = s.charAt(0).toUpperCase()+s.slice(1)+' · '+BD.getDate()+' de '+mo[BD.getMonth()]+' de '+BD.getFullYear();
  var defs=[['hoje','Hoje'],['semana','Semana'],['prazos','Prazos'],['acomp','Assist.'],['notas','Notas']];
  document.getElementById('tabs').innerHTML = defs.map(function(t){
    return '<button class="tab'+(S.tab===t[0]?' on':'')+'" data-tab="'+t[0]+'">'+t[1]+'</button>';
  }).join('');
  paintStatus();
}

function evOf(i){ return D.eventos.filter(function(e){return e.data===i;}).sort(function(a,b){return String(a.hora).localeCompare(String(b.hora));}); }

/* ---------- aba hoje ---------- */
function taskRow(t, amanha, ctx){
  var st=stateOf(t.titulo), m=markOf(t.titulo), c=cat(t.categoria), sl=slug(t.titulo);
  var extra=!!t.__extra;
  var box = st==='feito'?'<span class="box feito" data-toggle="'+sl+'">✓</span>'
    : st==='empurrado'?'<span class="box push" data-toggle="'+sl+'">→</span>'
    : st==='andamento'?'<span class="box and" data-toggle="'+sl+'">◐</span>'
    : '<span class="box" data-toggle="'+sl+'"></span>';
  var selo='';
  if(st==='andamento') selo='<span class="badge" style="border-color:#2F6259;color:#2F6259">EM ANDAMENTO</span>';
  else if(t.prio===1) selo='<span class="badge" style="border-color:#9A3A31;color:#9A3A31">PRIORIDADE</span>';
  if(ctx==='critica') selo+='<span class="badge" style="border-color:#9A3A31;color:#9A3A31">'+esc(t.selo||'TRAVA UM PRAZO')+'</span>';
  return '<div class="trow"><div class="tinner">'+box+'<div style="flex:1">'+
    '<div class="ttitle'+(st==='feito'?' done':'')+'">'+esc(t.titulo)+(extra?' <span class="mine">sua</span>':'')+'</div>'+
    (t.detalhe?'<div class="tsub">'+esc(t.detalhe)+'</div>':'')+
    (st==='empurrado'?'<div class="tmot">Empurrada'+(m&&m.ate?' para '+esc(fmtBr(m.ate)):'')+' · '+esc((m&&m.m)||'sem motivo anotado')+'</div>':'')+
    (st==='andamento'?'<div class="tmot">Em andamento'+((m&&m.m)?' · '+esc(m.m):' · não depende de você agora')+'</div>':'')+
    '<div class="tmeta"><div class="catline" style="margin-top:0"><span class="dot" style="background:'+c[1]+'"></span>'+
    '<span class="catlabel" style="color:'+c[1]+'">'+c[0]+'</span></div>'+selo+
    '<button class="ghost" data-push="'+sl+'">'+(st==='empurrado'?'reabrir':'empurrar')+'</button>'+
    '<button class="ghost" data-and="'+sl+'">'+(st==='andamento'?'tirar de andamento':'em andamento')+'</button>'+
    (extra?'<button class="ghost" data-del="'+esc(t.titulo)+'">apagar</button>':'')+
    '</div>'+
    (S.pushing===sl?'<div class="inline"><input class="field" id="pushfield" placeholder="Por que ficou para depois?">'+
      '<input class="field date" type="date" id="pushdate" value="'+esc(iso(amanha))+'">'+
      '<button class="gold" data-pushsave="'+sl+'">Ok</button></div>':'')+
    (S.anding===sl?'<div class="inline"><input class="field" id="andfield" placeholder="Em que pé está? (opcional)">'+
      '<button class="gold" data-andsave="'+sl+'">Ok</button></div>':'')+
    '</div></div></div>';
}

function taskRowC(t, amanha, ctx){
  var st=stateOf(t.titulo), m=markOf(t.titulo), c=cat(t.categoria), sl=slug(t.titulo);
  var extra=!!t.__extra, open=(S.open===sl);
  var mark = st==='feito'?'<span class="cbox feito" data-toggle="'+sl+'">✓</span>'
    : st==='empurrado'?'<span class="cbox push" data-toggle="'+sl+'">→</span>'
    : st==='andamento'?'<span class="cbox and" data-toggle="'+sl+'">◐</span>'
    : '<span class="cbox" data-toggle="'+sl+'"></span>';
  var tags='';
  if(ctx==='critica') tags+='<span class="cbadge red">'+esc(t.selo||'TRAVA UM PRAZO')+'</span>';
  if(st==='andamento') tags+='<span class="cbadge green">andamento</span>';
  else if(t.prio===1) tags+='<span class="cbadge red">alta</span>';
  var head='<div class="crow'+(open?' open':'')+'">'+mark+
    '<div class="cmain" data-expand="'+sl+'">'+
      '<div class="ctitle'+(st==='feito'?' done':'')+'"><span class="cdot" style="background:'+c[1]+'"></span>'+
      esc(t.titulo)+(extra?' <span class="mine">sua</span>':'')+'</div>'+
      (tags?'<div class="cbadges">'+tags+'</div>':'')+
    '</div><span class="cchev'+(open?' open':'')+'" data-expand="'+sl+'">›</span></div>';
  if(!open) return '<div class="ci">'+head+'</div>';
  var det='<div class="cdetail">'+
    (t.detalhe?'<div class="tsub">'+esc(t.detalhe)+'</div>':'')+
    (st==='empurrado'?'<div class="tmot">Empurrada'+(m&&m.ate?' para '+esc(fmtBr(m.ate)):'')+' · '+esc((m&&m.m)||'sem motivo anotado')+'</div>':'')+
    (st==='andamento'?'<div class="tmot">Em andamento'+((m&&m.m)?' · '+esc(m.m):' · não depende de você agora')+'</div>':'')+
    '<div class="tmeta"><div class="catline" style="margin-top:0"><span class="dot" style="background:'+c[1]+'"></span>'+
    '<span class="catlabel" style="color:'+c[1]+'">'+c[0]+'</span></div>'+
    '<button class="ghost" data-push="'+sl+'">'+(st==='empurrado'?'reabrir':'empurrar')+'</button>'+
    '<button class="ghost" data-and="'+sl+'">'+(st==='andamento'?'tirar de andamento':'em andamento')+'</button>'+
    (extra?'<button class="ghost" data-del="'+esc(t.titulo)+'">apagar</button>':'')+
    '</div>'+
    (S.pushing===sl?'<div class="inline"><input class="field" id="pushfield" placeholder="Por que ficou para depois?">'+
      '<input class="field date" type="date" id="pushdate" value="'+esc(iso(amanha))+'">'+
      '<button class="gold" data-pushsave="'+sl+'">Ok</button></div>':'')+
    (S.anding===sl?'<div class="inline"><input class="field" id="andfield" placeholder="Em que pé está? (opcional)">'+
      '<button class="gold" data-andsave="'+sl+'">Ok</button></div>':'')+
    '</div>';
  return '<div class="ci open">'+head+det+'</div>';
}

function linhaFora(lista, tipo){
  return lista.map(function(t){
    var sl=slug(t.titulo), m=markOf(t.titulo);
    var quando = t.__espera?fmtBr(t.__espera):'';
    var extra = tipo==='adiada' ? (m&&m.m?' · '+esc(m.m):'') : '';
    return '<div class="foraline"><span class="foradia">'+esc(quando)+'</span>'+
      '<span class="foratit">'+esc(t.titulo)+extra+'</span>'+
      (tipo==='adiada'?'<button class="ghost" data-push="'+sl+'">trazer p/ hoje</button>':'')+'</div>';
  }).join('');
}

function viewHoje(){
  var now=new Date(), today=iso(now), mn=now.getHours()*60+now.getMinutes();
  var evs=evOf(BASE), dl=deadlines(false), myAll=myList();
  myAll.forEach(function(t,i){ t.__extra = i >= D.minhas.length; });
  var adiadas=[], agendadas=[], fupsDepois=[], andamento=[], fups=[], my=[];
  myAll.forEach(function(t){
    var m=markOf(t.titulo);
    /* critica fica sempre em "Precisa de voce", mesmo em andamento ou empurrada */
    if(t.critico){ my.push(t); return; }
    if(m && m.s==='andamento'){ andamento.push(t); return; }
    var volta=(m && m.s==='empurrado' && m.ate)?m.ate:'';
    var quando=t.quando||'';
    var espera = volta>quando ? volta : quando;
    if(espera && espera>BASE){
      t.__espera=espera; t.__agendada=!volta;
      if(t.tipo==='followup') fupsDepois.push(t);
      else if(volta) adiadas.push(t);
      else agendadas.push(t);
      return;
    }
    if(t.tipo==='followup') fups.push(t); else my.push(t);
  });
  /* tarefa critica sobe para "Precisa de voce" e NAO se repete em "Minhas tarefas" */
  var criticas=my.filter(function(t){ return t.critico; });
  my=my.filter(function(t){ return !t.critico; });
  var critAnd=criticas.filter(function(t){ return stateOf(t.titulo)==='andamento'; });
  criticas=criticas.filter(function(t){ return stateOf(t.titulo)!=='andamento'; });
  function porPrio(a,b){ return (a.prio||2)-(b.prio||2); }
  my=my.slice().sort(porPrio); fups=fups.slice().sort(porPrio);
  function porEspera(a,b){ return String(a.__espera).localeCompare(String(b.__espera)); }
  adiadas.sort(porEspera); agendadas.sort(porEspera); fupsDepois.sort(porEspera);
  function linhaDepois(lista){
    return '<div class="empty" style="padding-top:2px">'+lista.map(function(t){
      return esc(t.titulo)+' · '+esc(fmtBr(t.__espera));
    }).join('  ·  ')+'</div>';
  }

  var feitas=0, empurradas=[], abertas=0;
  var contaveis=criticas.concat(critAnd).concat(my);
  contaveis.forEach(function(t){ var st=stateOf(t.titulo); if(st==='feito')feitas++; else if(st==='empurrado')empurradas.push(t); else if(st!=='andamento')abertas++; });
  var fupAbertos=fups.filter(function(t){return stateOf(t.titulo)!=='feito';}).length;
  var acompAbertos=D.acomp.filter(function(t){return stateOf(t.titulo)!=='feito';}).length;

  var next=evs.filter(function(e){return BASE!==today||toMin(e.hora)>=mn;})[0], nlabel='Próximo', ncount='';
  if(!next){
    var later=D.eventos.filter(function(e){return e.data>BASE;}).sort(function(a,b){return (a.data+a.hora).localeCompare(b.data+b.hora);});
    next=later[0]; if(next) nlabel='Próximo · '+fmtDay(next.data);
  }
  if(next && next.data===today){
    var diff=toMin(next.hora)-mn;
    ncount = diff<=0?'agora':(diff<60?'em '+diff+' min':'em '+Math.floor(diff/60)+'h'+(diff%60?' '+(diff%60)+'min':''));
  } else if(next){ ncount=fmtDay(next.data); }

  var carro=D.carro[BASE]||{texto:'',bruna:false};
  var pct=Math.round((feitas/Math.max(criticas.length+my.length,1))*100);
  var amanha=new Date(BD.getFullYear(),BD.getMonth(),BD.getDate()+1);
  var counts=[[abertas,'tarefas abertas','#F3F0E8'],[fupAbertos,'follow ups','#F3F0E8'],
    [acompAbertos,'a acompanhar','#F3F0E8'],
    [dl.filter(function(d){return d.sort<=1||(d.fatal&&d.sort<=30);}).length,'prazo','#D98C82']];

  var h='<div class="view"><div class="hero"><div class="hero-cols"><div class="hero-left">'+
    '<div class="daytag">'+esc(dl.some(function(d){return d.sort<0;})?'ATENÇÃO':D.tag)+'</div><div class="counts">'+
    counts.map(function(c){return '<div><div class="cnum" style="color:'+c[2]+'">'+c[0]+'</div><div class="clabel">'+c[1]+'</div></div>';}).join('')+
    '</div></div><div class="hero-right"><div class="nlabel">'+esc(nlabel)+'</div><div class="ntime">'+esc(next?next.hora:'—')+'</div>'+
    '<div class="ncount">'+esc(ncount)+'</div><div class="ntitle">'+esc(next?next.titulo:'Nada mais marcado')+'</div></div></div>'+
    '<div class="herofoot"><div class="chip">Carro · '+(carro.bruna?'Bruna hoje':'com você hoje')+'</div>'+
    '<div class="prog">Tarefas '+feitas+'/'+my.length+'</div></div>'+
    '<div class="track"><div class="fill" style="width:'+pct+'%"></div></div></div>';

  h+='<div class="block"><div class="shead"><span class="tick"></span><h2>Agenda de hoje</h2></div>';
  if(!evs.length) h+='<div class="empty">Nenhum compromisso marcado.</div>';
  evs.forEach(function(e){
    var c=cat(e.categoria), past=(BASE===today&&toMin(e.hora)<mn);
    h+='<div class="row"><div class="rtime" style="color:'+(past?'#B0AC9C':'#16140E')+'">'+esc(e.hora)+'</div><div>'+
      '<div class="rtitle">'+esc(e.titulo)+'</div>'+(e.detalhe?'<div class="rsub">'+esc(e.detalhe)+'</div>':'')+
      '<div class="catline"><span class="dot" style="background:'+c[1]+'"></span><span class="catlabel" style="color:'+c[1]+'">'+c[0]+'</span></div></div></div>';
  });
  h+='</div>';

  var urg=dl.filter(function(d){return d.sort<=1||(d.fatal&&d.sort<=30);});
  criticas=criticas.filter(function(t){ return stateOf(t.titulo)!=='feito'; });
  critAnd=critAnd.filter(function(t){ return stateOf(t.titulo)!=='feito'; });
  if(urg.length||criticas.length||critAnd.length){
    h+='<div class="block"><div class="shead"><span class="tick red"></span><h2>Precisa de você</h2></div>';
    criticas.forEach(function(t){ h+=taskRowC(t,amanha,'critica'); });
    urg.forEach(function(d){ h+=prazoRow(d,true); });
    if(critAnd.length){
      h+='<div class="subhead">Aqui, mas já em andamento</div>'+
        '<div class="empty" style="padding-bottom:4px">Você já apertou em andamento nestas. Não contam como tarefa aberta e não descem para o fim da página — ficam aqui porque você precisa lembrar delas.</div>';
      critAnd.forEach(function(t){ h+=taskRowC(t,amanha,'critica'); });
    }
    h+='</div>';
  }

  var esp=espList(), espAbertos=esp.filter(function(x){return !espOf(x.titulo).feito;});
  h+='<div class="block"><div class="shead"><span class="tick"></span><h2>Esperando alguém</h2></div>'+
    '<div class="empty" style="padding-bottom:4px">Casos em que a sua parte já saiu e agora você está em cima de outra pessoa. Não são tarefas nem prazos — é o histórico para você não esquecer de cobrar.</div>';
  if(!espAbertos.length) h+='<div class="empty">Nada esperando resposta.</div>';
  espAbertos.forEach(function(x){ h+=espRow(x); });
  var espFeitos=esp.filter(function(x){return espOf(x.titulo).feito;});
  if(espFeitos.length){
    h+='<div class="empty" style="padding-top:10px;padding-bottom:2px">Voltaram</div>';
    espFeitos.forEach(function(x){ h+=espRow(x); });
  }
  h+='<div class="addrow"><input class="addfield" id="newesp" placeholder="Novo caso esperando alguém e Enter"><button class="dark" id="addesp">Add</button></div></div>';

  /* FOCO DO DIA + resto recolhido (concluídas nunca ocupam vaga do foco) */
  var myAbertas=my.filter(function(t){return stateOf(t.titulo)!=='feito';});
  var focoList=myAbertas.filter(function(t){return t.foco;});
  myAbertas.forEach(function(t){ if(!t.foco && focoList.length<6) focoList.push(t); });
  var restoList=my.filter(function(t){return focoList.indexOf(t)<0;});

  h+='<div class="block"><div class="shead"><span class="tick"></span><h2>Foco do dia</h2></div>'+
    '<div class="empty" style="padding-bottom:4px">O que faz sentido atacar hoje. Toque numa linha para ver o detalhe e os botões.</div>';
  if(!focoList.length) h+='<div class="empty">Sem tarefas para hoje.</div>';
  focoList.forEach(function(t){ h+=taskRowC(t,amanha); });
  h+='<div class="addrow"><input class="addfield" id="newtask" placeholder="Nova tarefa e Enter"><button class="dark" id="addtask">Add</button></div>';
  if(restoList.length){
    h+='<button class="drawerhead" data-drawer="resto">'+(S.dResto?'▾  Esconder as outras '+restoList.length:'▸  Ver as outras '+restoList.length+' tarefas')+'</button>';
    if(S.dResto) restoList.forEach(function(t){ h+=taskRowC(t,amanha); });
  }
  h+='</div>';

  if(andamento.length){
    h+='<div class="block"><div class="shead"><span class="tick"></span><h2>Em andamento</h2></div>'+
      '<div class="empty" style="padding-bottom:4px">Já começaram e não dependem de você agora. Não contam como tarefa aberta.</div>';
    andamento.forEach(function(t){ h+=taskRowC(t,amanha); });
    h+='</div>';
  }

  if(fups.length){
    h+='<div class="block"><div class="shead"><span class="tick"></span><h2>Follow ups de hoje</h2></div>'+
      '<div class="empty" style="padding-bottom:4px">Só os que vencem hoje ou passaram da data.</div>';
    fups.forEach(function(t){ h+=taskRowC(t,amanha); });
    h+='</div>';
  }

  /* GAVETA: fora do radar de hoje */
  var totalFora=adiadas.length+agendadas.length+fupsDepois.length;
  if(totalFora){
    h+='<div class="block"><button class="drawerhead big" data-drawer="fora">'+
      (S.dFora?'▾  Fora do radar de hoje ('+totalFora+')':'▸  Fora do radar de hoje ('+totalFora+')')+'</button>';
    if(S.dFora){
      h+='<div class="empty" style="padding-bottom:4px">Empurradas, presas a uma data e follow ups guardados. Voltam sozinhas no dia.</div>';
      if(adiadas.length){ h+='<div class="subhead">Voltam depois</div>'+linhaFora(adiadas,'adiada'); }
      if(agendadas.length){ h+='<div class="subhead">Presas a uma data</div>'+linhaFora(agendadas,'agendada'); }
      if(fupsDepois.length){ h+='<div class="subhead">Follow ups guardados</div>'+linhaFora(fupsDepois,'fup'); }
    }
    h+='</div>';
  }

  h+='<div class="card"><div class="shead" style="margin-bottom:12px"><span class="tick ink"></span><h2>Fechamento do dia</h2></div><div class="closing">'+
    '<div><div class="cbig" style="color:#A9853F">'+feitas+'</div><div class="csml">feitas</div></div>'+
    '<div><div class="cbig" style="color:#9A3A31">'+(empurradas.length+adiadas.length+fupsDepois.filter(function(t){return !t.__agendada;}).length)+'</div><div class="csml">empurradas</div></div>'+
    '<div><div class="cbig" style="color:#2F6259">'+andamento.length+'</div><div class="csml">em andamento</div></div>'+
    '<div><div class="cbig" style="color:#16140E">'+abertas+'</div><div class="csml">abertas</div></div></div>';
  var todasEmpurradas=empurradas.concat(adiadas, fupsDepois.filter(function(t){return !t.__agendada;}));
  if(todasEmpurradas.length||andamento.length){
    h+='<div class="pushed"><h3>Eu leio isto amanhã de manhã</h3>'+
      todasEmpurradas.map(function(t){
        var m=markOf(t.titulo);
        return '<div class="pline">'+esc(t.titulo)+' <span style="color:#A9853F">· '+esc((m&&m.m)||'sem motivo anotado')+
          (m&&m.ate?' · para '+esc(fmtBr(m.ate)):'')+'</span></div>';
      }).join('')+
      andamento.map(function(t){
        var m=markOf(t.titulo);
        return '<div class="pline">'+esc(t.titulo)+' <span style="color:#2F6259">· em andamento'+((m&&m.m)?' · '+esc(m.m):'')+'</span></div>';
      }).join('')+'</div>';
  }
  h+='</div></div>';
  return h;
}

function prazoRow(d,compacto){
  var sl=slug(d.titulo);
  var h='<div class="nrow"><div class="nnum">'+d.num+'</div><div style="flex:1"><div class="ntl">'+
    '<span class="nt" style="color:'+d.tcolor+'">'+esc(d.titulo)+'</span>'+
    '<span class="badge" style="border-color:'+d.color+';color:'+d.color+'">'+esc(d.badge)+'</span>'+
    (d.movido?'<span class="badge" style="border-color:#8B8879;color:#8B8879">VOCÊ MOVEU</span>':'')+'</div>'+
    '<div class="ntx">'+esc(d.sub)+'</div>'+
    (d.motivo?'<div class="tmot">'+esc(d.motivo)+'</div>':'')+
    '<div class="tmeta">'+
      '<button class="ghost" data-pzok="'+sl+'">resolvido</button>'+
      '<button class="ghost" data-pzmove="'+sl+'">mudar data</button>'+
    '</div>'+
    (S.pushPrazo===sl?'<div class="inline"><input class="field" id="pzmot" placeholder="O que aconteceu?">'+
      '<input class="field date" type="date" id="pzdate" value="'+esc(d.vence)+'">'+
      '<button class="gold" data-pzsave="'+sl+'">Ok</button></div>':'')+
    '</div></div>';
  return h;
}

/* ---------- aba semana ---------- */
function viewSemana(){
  var mon=parse(BASE); mon.setDate(mon.getDate()-((mon.getDay()+6)%7));
  var h='<div class="view" style="margin-top:22px">';
  for(var i=0;i<7;i++){
    var d=new Date(mon); d.setDate(mon.getDate()+i);
    var i2=iso(d), evs=evOf(i2), c=D.carro[i2]||{texto:'',bruna:false};
    h+='<div class="wday"><div class="whead"><div class="wlabel" style="color:'+(i2===BASE?'#A9853F':'#16140E')+'">'+
      fmtDay(i2)+(i2===BASE?' · hoje':'')+'</div><div class="wcarro" style="color:'+(c.bruna?'#9A3A31':'#8B8879')+'">'+esc(c.texto)+'</div></div>';
    evs.forEach(function(e){
      var ct=cat(e.categoria);
      h+='<div class="wev"><div class="wtime">'+esc(e.hora)+'</div><div><div class="wt">'+esc(e.titulo)+'</div>'+
        '<div class="catline" style="margin-top:5px"><span class="dot" style="width:6px;height:6px;background:'+ct[1]+'"></span>'+
        '<span class="catlabel" style="font-size:9.5px;color:'+ct[1]+'">'+ct[0]+'</span></div></div></div>';
    });
    if(!evs.length) h+='<div class="free">Livre</div>';
    h+='</div>';
  }
  return h+'</div>';
}

/* ---------- aba prazos ---------- */
function viewPrazos(){
  var abertos=deadlines(false);
  var todos=deadlines(true);
  var resolvidos=todos.filter(function(d){return d.resolvido;});
  var h='<div class="view" style="margin-top:22px">';
  if(!abertos.length) h+='<div class="hint">Nenhum prazo em aberto.</div>';
  abertos.forEach(function(d){
    var sl=slug(d.titulo);
    h+='<div class="pcard"><div style="flex:1"><div class="pt" style="color:'+d.tcolor+'">'+esc(d.titulo)+'</div>'+
      '<div class="psub">'+esc(d.sub)+'</div>'+
      (d.motivo?'<div class="tmot">'+esc(d.motivo)+'</div>':'')+
      '<div class="pmeta">'+esc(d.meta)+'</div>'+
      '<div class="pmeta">Vence '+esc(fmtBr(d.vence))+(d.movido?' · você mudou (a Astrea trazia '+esc(fmtBr(d.original))+')':'')+'</div>'+
      '<div class="tmeta">'+
        '<button class="ghost" data-pzok="'+sl+'">resolvido</button>'+
        '<button class="ghost" data-pzmove="'+sl+'">mudar data</button>'+
      '</div>'+
      (S.pushPrazo===sl?'<div class="inline"><input class="field" id="pzmot" placeholder="O que aconteceu?">'+
        '<input class="field date" type="date" id="pzdate" value="'+esc(d.vence)+'">'+
        '<button class="gold" data-pzsave="'+sl+'">Ok</button></div>':'')+
      '</div>'+
      '<div class="pdays"><div class="pnum" style="color:'+d.color+'">'+d.days+'</div><div class="punit">'+d.unit+'</div></div></div>';
  });
  if(resolvidos.length){
    h+='<div class="block"><div class="shead"><span class="tick ink"></span><h2>Resolvidos</h2></div>';
    resolvidos.forEach(function(d){
      h+='<div class="nitem"><div style="flex:1"><div class="ttitle done" style="font-size:13px">'+esc(d.titulo)+'</div>'+
        (d.motivo?'<div class="tsub">'+esc(d.motivo)+'</div>':'')+'</div>'+
        '<button class="ghost" data-pzundo="'+slug(d.titulo)+'">reabrir</button></div>';
    });
    h+='<div class="hint" style="margin-top:12px">Amanhã de manhã eu leio isto e tiro da lista.</div></div>';
  }
  return h+'</div>';
}

/* ---------- aba assistente ---------- */
function viewAcomp(){
  var h='<div class="view" style="margin-top:22px"><div class="hint" style="margin-bottom:6px">Delegado à assistente. Marque o que já voltou com resposta.</div>';
  D.acomp.forEach(function(t){
    var done=stateOf(t.titulo)==='feito', sl=slug(t.titulo);
    h+='<div class="nitem" style="align-items:flex-start"><span class="box sm'+(done?' feito':'')+'" data-toggle="'+sl+'">'+(done?'✓':'')+'</span>'+
      '<div style="flex:1"><div class="ttitle'+(done?' done':'')+'" style="font-size:12.5px">'+esc(t.titulo)+'</div>'+
      '<div class="tsub" style="font-size:11px">'+esc(t.detalhe)+'</div></div></div>';
  });
  return h+'</div>';
}

/* ---------- aba notas ---------- */
function viewNotas(){
  var today=iso(new Date()), groups=[];
  E.notes.forEach(function(n){
    var i2=iso(new Date(n.at)), g=null;
    groups.forEach(function(x){ if(x.iso===i2) g=x; });
    if(!g){ g={iso:i2,items:[]}; groups.push(g); }
    g.items.push(n);
  });
  var h='<div class="view" style="margin-top:22px"><div class="hint" style="margin-bottom:12px">Bloco de notas. Fica gravado na agenda, aparece em qualquer aparelho, e eu leio de manhã.</div>'+
    '<div class="notecard"><textarea class="notearea" id="notearea" rows="4" placeholder="Anote aqui. Cmd+Enter salva."></textarea>'+
    '<div class="notefoot"><div class="notecount">'+(E.notes.length===1?'1 nota guardada':E.notes.length+' notas guardadas')+
    '</div><button class="dark" id="savenote" style="padding:9px 18px">Salvar nota</button></div></div>';
  if(!groups.length) h+='<div class="hint" style="color:#B0AC9C;margin-top:22px">Nenhuma nota ainda.</div>';
  groups.forEach(function(g){
    h+='<div class="ngroup"><div class="ngday">'+fmtDay(g.iso)+(g.iso===today?' · hoje':'')+'</div>';
    g.items.forEach(function(n){
      var d=new Date(n.at), t=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
      h+='<div class="nitem"><div class="nitime">'+t+'</div><div class="nitext">'+esc(n.text)+'</div>'+
        '<button class="nidel" data-delnote="'+esc(n.id)+'">×</button></div>';
    });
    h+='</div>';
  });
  return h+'</div>';
}

function render(){
  header();
  var v=document.getElementById('view');
  v.innerHTML = S.tab==='hoje'?viewHoje():S.tab==='semana'?viewSemana():S.tab==='prazos'?viewPrazos():S.tab==='acomp'?viewAcomp():viewNotas();
  var pf=document.getElementById('pushfield')||document.getElementById('pzmot'); if(pf) pf.focus();
}

function titleFromSlug(sl){
  var all=myList().concat(D.acomp), found=null;
  all.forEach(function(t){ if(slug(t.titulo)===sl) found=t.titulo; });
  return found;
}
function prazoFromSlug(sl){
  var found=null;
  D.prazos.forEach(function(p){ if(slug(p.titulo)===sl) found=p; });
  return found;
}

document.addEventListener('click', function(ev){
  var el=ev.target.closest('[data-tab],[data-expand],[data-drawer],[data-toggle],[data-push],[data-pushsave],[data-and],[data-andsave],[data-del],[data-pzok],[data-pzmove],[data-pzsave],[data-pzundo],[data-espok],[data-espnote],[data-espsave],[data-espdel],[data-delnote],#addtask,#addesp,#savenote');
  if(!el) return;
  var t;
  if(el.dataset.tab){ S.tab=el.dataset.tab; render(); return; }
  if(el.dataset.expand){ S.open = (S.open===el.dataset.expand)?null:el.dataset.expand; S.pushing=null; S.anding=null; render(); return; }
  if(el.dataset.drawer){ if(el.dataset.drawer==='resto') S.dResto=!S.dResto; else S.dFora=!S.dFora; render(); return; }
  if(el.dataset.toggle){
    t=titleFromSlug(el.dataset.toggle); if(!t) return;
    setMark(t, stateOf(t)==='feito'?'aberto':'feito'); return;
  }
  if(el.dataset.push){
    t=titleFromSlug(el.dataset.push); if(!t) return;
    if(stateOf(t)==='empurrado') setMark(t,'aberto');
    else { S.pushing=el.dataset.push; S.pushPrazo=null; render(); }
    return;
  }
  if(el.dataset.pushsave){
    t=titleFromSlug(el.dataset.pushsave); if(!t) return;
    var f=document.getElementById('pushfield'), dt=document.getElementById('pushdate');
    setMark(t,'empurrado', f?f.value.trim():'', dt?dt.value:''); return;
  }
  if(el.dataset.and){
    t=titleFromSlug(el.dataset.and); if(!t) return;
    if(stateOf(t)==='andamento') setMark(t,'aberto');
    else { S.anding=el.dataset.and; S.pushing=null; S.pushPrazo=null; render(); }
    return;
  }
  if(el.dataset.andsave){
    t=titleFromSlug(el.dataset.andsave); if(!t) return;
    var af=document.getElementById('andfield');
    setMark(t,'andamento', af?af.value.trim():'', ''); return;
  }
  if(el.dataset.del){
    var alvo=el.dataset.del;
    E.extra=E.extra.filter(function(x){return x.titulo!==alvo;});
    delete E.marks[slug(alvo)];
    persist(); render(); return;
  }
  if(el.dataset.espok){
    var ek=el.dataset.espok, et=null;
    espList().forEach(function(x){ if(slug(x.titulo)===ek) et=x.titulo; });
    if(!et) return;
    var ec=espOf(et); ec.feito=!ec.feito; ec.d=iso(new Date()); setEsp(et,ec); return;
  }
  if(el.dataset.espnote){ S.espando=el.dataset.espnote; S.pushing=null; S.anding=null; render(); return; }
  if(el.dataset.espsave){
    var sk=el.dataset.espsave, stt=null;
    espList().forEach(function(x){ if(slug(x.titulo)===sk) stt=x.titulo; });
    if(!stt) return;
    var f2=document.getElementById('espfield'), sc=espOf(stt);
    sc.m=f2?f2.value.trim():''; sc.d=iso(new Date()); setEsp(stt,sc); return;
  }
  if(el.dataset.espdel){
    var al=el.dataset.espdel;
    E.espExtra=E.espExtra.filter(function(x){return x.titulo!==al;});
    delete E.esp[slug(al)]; persist(); render(); return;
  }
  if(el.id==='addesp'){
    var ni=document.getElementById('newesp'), v=ni?ni.value.trim():'';
    if(v){ E.espExtra.push({titulo:v}); persist(); render(); }
    return;
  }
  if(el.dataset.pzok){
    var p=prazoFromSlug(el.dataset.pzok); if(!p) return;
    var cur=pzOf(p.titulo)||{};
    cur.s='resolvido'; cur.d=iso(new Date());
    setPrazo(p.titulo,cur); return;
  }
  if(el.dataset.pzmove){ S.pushPrazo=el.dataset.pzmove; S.pushing=null; render(); return; }
  if(el.dataset.pzsave){
    var p2=prazoFromSlug(el.dataset.pzsave); if(!p2) return;
    var mot=document.getElementById('pzmot'), dd=document.getElementById('pzdate');
    var cur2=pzOf(p2.titulo)||{};
    if(dd && dd.value) cur2.vence=dd.value;
    if(mot) cur2.m=mot.value.trim();
    cur2.d=iso(new Date());
    setPrazo(p2.titulo,cur2); return;
  }
  if(el.dataset.pzundo){
    var p3=prazoFromSlug(el.dataset.pzundo); if(!p3) return;
    var cur3=pzOf(p3.titulo)||{};
    delete cur3.s;
    setPrazo(p3.titulo, Object.keys(cur3).length?cur3:null); return;
  }
  if(el.dataset.delnote){
    E.notes=E.notes.filter(function(n){return n.id!==el.dataset.delnote;});
    persist(); render(); return;
  }
  if(el.id==='addtask'){ addTask(); return; }
  if(el.id==='savenote'){ addNote(); return; }
});

document.addEventListener('keydown', function(ev){
  if(ev.target.id==='newtask' && ev.key==='Enter'){ addTask(); }
  else if((ev.target.id==='pushfield'||ev.target.id==='pushdate') && ev.key==='Enter'){
    var b=document.querySelector('[data-pushsave]'); if(b) b.click();
  }
  else if(ev.target.id==='andfield' && ev.key==='Enter'){
    var ba=document.querySelector('[data-andsave]'); if(ba) ba.click();
  }
  else if((ev.target.id==='pzmot'||ev.target.id==='pzdate') && ev.key==='Enter'){
    var b2=document.querySelector('[data-pzsave]'); if(b2) b2.click();
  }
  else if(ev.target.id==='espfield' && ev.key==='Enter'){
    var b4=document.querySelector('[data-espsave]'); if(b4) b4.click();
  }
  else if(ev.target.id==='newesp' && ev.key==='Enter'){
    var ba2=document.getElementById('addesp'); if(ba2) ba2.click();
  }
  else if(ev.target.id==='notearea' && ev.key==='Enter' && (ev.metaKey||ev.ctrlKey)){ addNote(); }
});

function addTask(){
  var f=document.getElementById('newtask'); if(!f) return;
  var v=f.value.trim(); if(!v) return;
  E.extra.push({titulo:v,detalhe:'',categoria:'geral',prio:2});
  persist(); render();
}

function addNote(){
  var f=document.getElementById('notearea'); if(!f) return;
  var v=f.value.trim(); if(!v) return;
  E.notes.unshift({id:'n'+Date.now()+'-'+E.notes.length,text:v,at:Date.now()});
  persist(); render();
}

render();
setInterval(function(){ if(S.tab==='hoje') render(); }, 60000);
})();
