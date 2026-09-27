"use strict";
/* ═════════ segurança: escape universal de texto ═════════ */
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);

/* ═════════ estado (localStorage, segredos nunca em código) ═════════ */
const store={
  get:(k,d)=>{try{const v=localStorage.getItem('tc_'+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
  set:(k,v)=>localStorage.setItem('tc_'+k,JSON.stringify(v)),
  del:k=>localStorage.removeItem('tc_'+k)
};
const cfg=Object.assign({provider:'auto',key:'',model:''},store.get('cfg',{}));

/* ═════════ gerenciador de permissões (só sob demanda) ═════════ */
const PERMS={
  notifications:{label:'Notificações',ask:()=>Notification.requestPermission()},
  geolocation:{label:'Localização',ask:()=>new Promise(r=>navigator.geolocation.getCurrentPosition(()=>r('granted'),()=>r('denied'),{timeout:8000}))},
  clipboard:{label:'Área de transferência',ask:async()=>{try{await navigator.clipboard.writeText('ok');return 'granted'}catch(e){return 'denied'}}}
};
function permState(p){
  if(p==='notifications')return (window.Notification?Notification.permission:'unsupported');
  if(p==='geolocation')return (navigator.geolocation?(navigator.permissions?queryPerm(p):'prompt'):'unsupported');
  if(p==='clipboard')return (navigator.clipboard?(navigator.permissions?queryPerm(p):'prompt'):'unsupported');
  return 'unsupported';
}
async function queryPerm(p){try{const s=await navigator.permissions.query({name:p==='geolocation'?'geolocation':'clipboard-read'});return s.state}catch(e){return 'prompt'}}
async function ensurePerm(p){
  if(!PERMS[p])return false;
  let st=permState(p);
  if(st==='granted')return true;
  if(st!=='prompt')return false;
  st=await PERMS[p].ask();
  renderPerms();
  return st==='granted';
}

/* ═════════ catálogo de plugins (manifest JS + plugins.json) ═════════ */
const PLUGINS=[
 {id:'weather',name:'clima',desc:'Previsão do tempo da sua cidade via open-meteo (sem chave).',cat:'dados',perms:['geolocation'],run:async a=>{
   if(!await ensurePerm('geolocation'))return '❌ preciso da permissão de localização (config → permissões).';
   const pos=await new Promise((ok,no)=>navigator.geolocation.getCurrentPosition(ok,no,{timeout:8000}));
   const{latitude:la,longitude:lo}=pos.coords;
   const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+la+'&longitude='+lo+'&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto');
   const d=await r.json();
   return '🌦 agora: '+d.current.temperature_2m+'°C · máx '+d.daily.temperature_2m_max[0]+'° / mín '+d.daily.temperature_2m_min[0]+'° (open-meteo)';
 }},
 {id:'crypto',name:'cripto',desc:'Preço de criptomoedas via CoinGecko (sem chave).',cat:'dados',perms:[],run:async a=>{
   const ids=(a||'bitcoin,ethereum').split(',').map(s=>s.trim()).slice(0,5).join(',');
   const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids='+encodeURIComponent(ids)+'&vs_currencies=brl,usd');
   const d=await r.json();
   return Object.entries(d).map(([k,v])=>k+': R$'+v.brl+' (~US$'+v.usd+')').join('\n')||'moeda não encontrada';
 }},
 {id:'wiki',name:'wiki',desc:'Busca na Wikipédia (API livre, sem chave).',cat:'busca',perms:[],run:async a=>{
   if(!a)return 'uso: /wiki <termo>';
   const r=await fetch('https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(a)+'&format=json&origin=*&srlimit=3');
   const d=await r.json();
   return d.query.search.map(s=>'• '+s.title+'\n'+s.snippet.replace(/<[^>]+>/g,'')).join('\n---\n')||'nada encontrado';
 }},
 {id:'hn',name:'tech-news',desc:'Top notícias do Hacker News (sem chave).',cat:'dados',perms:[],run:async a=>{
   const r=await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
   const ids=(await r.json()).slice(0,5);
   const out=[];
   for(const id of ids){const s=await(await fetch('https://hacker-news.firebaseio.com/v0/item/'+id+'.json')).json();out.push('• '+s.title)}
   return out.join('\n');
 }},
 {id:'calc',name:'calc',desc:'Calculadora local (parser próprio, sem eval).',cat:'ferramenta',perms:[],run:async a=>{
   const t=(a||'').replace(/,/g,'.').replace(/[^0-9+\-*/(). ]/g,'');
   if(!t)return 'uso: /calc 2*(3+4)';
   const v=calc(t);
   return v===null?'expressão inválida':t.trim()+' = '+v;
 }},
 {id:'timer',name:'timer',desc:'Timer com notificação (ex.: /timer 10 café pronto).',cat:'ferramenta',perms:['notifications'],run:async a=>{
   const m=a&&a.match(/^(\d+)\s*(.*)/);
   if(!m)return 'uso: /timer 5 <aviso opcional>';
   const min=+m[1];
   if(!await ensurePerm('notifications'))return '⏳ timer de '+min+'min rodando (sem notificação: permissão negada).';
   setTimeout(()=>{new Notification('TermChat',{body:'⏰ '+(m[2]||'tempo esgotado: '+min+'min')});print('sys','⏰ timer: '+(m[2]||min+'min esgotado'))},min*60000);
   return '⏱ timer de '+min+' min iniciado'+(m[2]?' — '+m[2]:'');
 }},
 {id:'notes',name:'notas',desc:'Notas locais: /nota add <texto>, /nota ls, /nota rm <n>.',cat:'pessoal',perms:[],run:async a=>{
   const list=store.get('notes',[]);
   const cmd=(a||'ls').split(' ')[0],rest=(a||'').slice(cmd.length).trim();
   if(cmd==='add'){list.push(rest);store.set('notes',list);return 'nota #'+list.length+' salva'}
   if(cmd==='rm'){const i=+rest-1;if(list[i]===undefined)return 'nota inexistente';list.splice(i,1);store.set('notes',list);return 'removida'}
   return list.map((n,i)=>(i+1)+'. '+n).join('\n')||'(sem notas)';
 }},
 {id:'translate',name:'tradutor',desc:'Tradução livre via MyMemory (sem chave).',cat:'busca',perms:[],run:async a=>{
   if(!a)return 'uso: /tradutor en|fr|es <texto>';
   const m=a.match(/^(\w\w)\s+([\s\S]+)/);if(!m)return 'formato: /tradutor en texto';
   const r=await fetch('https://api.mymemory.translated.net/get?q='+encodeURIComponent(m[2])+'&langpair=pt|'+m[1]);
   const d=await r.json();
   return d.responseData&&d.responseData.translatedText||'falhou';
 }},
 {id:'qr',name:'qr',desc:'Gera QR Code de um texto/link (api.qrserver, livre).',cat:'ferramenta',perms:[],run:async a=>{
   if(!a)return 'uso: /qr <texto ou link>';
   return 'QR gerado:\n'+esc('https://api.qrserver.com/v1/create-qr-code/?size=240x240&data='+encodeURIComponent(a));
 }},
 {id:'sysinfo',name:'sysinfo',desc:'Infos do seu dispositivo/navegador (local).',cat:'ferramenta',perms:[],run:async a=>{
   return 'plataforma: '+esc(navigator.platform)+' · idioma: '+navigator.language+' · tela: '+screen.width+'x'+screen.height+' · online: '+(navigator.onLine?'sim':'não')+' · '+navigator.hardwareConcurrency+' núcleos';
 }},
 {id:'ip',name:'meu-ip',desc:'Seu IP público aproximado (ipwho.is, livre).',cat:'dados',perms:[],run:async a=>{
   const d=await(await fetch('https://ipwho.is/')).json();
   return d.ip+' · '+esc(d.city||'?')+', '+esc(d.country||'?')+' · ISP: '+esc(d.connection&&d.connection.isp||'?');
 }}
];
const pluginById=id=>PLUGINS.find(p=>p.id===id);
const installed=()=>store.get('plugins',['weather','calc','notes','sysinfo']);

/* calculadora segura — shunting-yard simplificado, sem eval */
function calc(expr){
  const toks=expr.match(/\d+\.?\d*|[+\-*/()]/g);if(!toks)return null;
  const out=[],ops=[];const prec={'+':1,'-':1,'*':2,'/':2};
  let prev=null;
  for(const t of toks){
    if(/[\d.]/.test(t[0])){out.push(parseFloat(t))}
    else if(t==='('){ops.push(t)}
    else if(t===')'){while(ops.length&&ops[ops.length-1]!=='(')out.push(ops.pop());if(!ops.length)return null;ops.pop()}
    else{if((t==='-'||t==='+')&&(prev===null||prev==='('||prec[prev]))out.push(0);while(ops.length&&prec[ops[ops.length-1]]>=prec[t])out.push(ops.pop());ops.push(t)}
    prev=t;
  }
  while(ops.length){const o=ops.pop();if(o==='(')return null;out.push(o)}
  const st=[];
  for(const t of out){
    if(typeof t==='number')st.push(t);
    else{const b=st.pop(),a2=st.pop();if(a2===undefined||b===undefined)return null;
      if(t==='+')st.push(a2+b);if(t==='-')st.push(a2-b);if(t==='*')st.push(a2*b);if(t==='/')st.push(b===0?NaN:a2/b)}
  }
  const v=st[0];return (st.length===1&&isFinite(v))?Math.round(v*1e10)/1e10:null;
}

/* ═════════ IA — cadeia gratuita com fallback ═════════ */
const AI={
  pollinations:{label:'Pollinations',url:'https://text.pollinations.ai/openai',noKey:true,
    call:async msgs=>{const r=await fetch('https://text.pollinations.ai/openai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'openai',messages:msgs})});
      if(!r.ok)throw new Error('http '+r.status);const d=await r.json();
      const t=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;if(!t)throw new Error('sem resposta');return t}},
  zen:{label:'OpenCode Zen',
    call:async msgs=>{const r=await fetch('https://opencode.ai/zen/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},body:JSON.stringify({model:cfg.model||'gemini-3.5-flash',messages:msgs})});
      if(!r.ok)throw new Error('http '+r.status);const d=await r.json();
      const t=d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;if(!t)throw new Error('sem resposta');return t}},
  groq:{label:'Groq',
    call:async msgs=>{const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},body:JSON.stringify({model:cfg.model||'llama-3.3-70b-versatile',messages:msgs})});
      if(!r.ok)throw new Error('http '+r.status);return (await r.json()).choices[0].message.content}},
  openrouter:{label:'OpenRouter',
    call:async msgs=>{const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.key},body:JSON.stringify({model:cfg.model||'meta-llama/llama-3.3-70b-instruct:free',messages:msgs})});
      if(!r.ok)throw new Error('http '+r.status);return (await r.json()).choices[0].message.content}},
  ollama:{label:'Ollama (local)',noKey:true,
    call:async msgs=>{const r=await fetch('http://127.0.0.1:11434/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model||'llama3.2',messages:msgs})});
      if(!r.ok)throw new Error('http '+r.status);return (await r.json()).choices[0].message.content}}
};
const SYS='Você é o TermChat, um assistente direto em português do Brasil. Respostas curtas, sem enrolação. Use /help para comandos do usuário.';
function chain(){
  const order=[];
  if(cfg.provider!=='auto'&&AI[cfg.provider]&&(AI[cfg.provider].noKey||cfg.key))order.push(cfg.provider);
  if(cfg.key){if(!order.includes('groq'))order.push('groq');if(!order.includes('openrouter'))order.push('openrouter');if(!order.includes('zen'))order.push('zen')}
  order.push('pollinations','ollama');
  return order;
}
async function askAI(text){
  const msgs=[{role:'system',content:SYS},...history.slice(-8),{role:'user',content:text}];
  const fails=[];
  for(const p of chain()){
    try{const t=await AI[p].call(msgs);if(p!==chain()[0])fails.length&&0;return {text:t,provider:p}}
    catch(e){fails.push(p+': '+e.message)}
  }
  throw new Error('cadeia falhou: '+esc(fails.join(' | ')));
}

/* ═════════ chat + terminal ═════════ */
const view=$('chatView');const history=store.get('hist',[]);
function print(who,text){
  const d=document.createElement('div');d.className='msg '+who;
  d.innerHTML='<span class="who">'+esc(who==='user'?'você':who==='sys'?'sistema':who)+':</span>'+esc(text);
  view.appendChild(d);view.scrollTop=view.scrollHeight;
}
function typingOn(){const d=document.createElement('div');d.className='msg ai typing';d.id='tp';d.innerHTML='<span class="who">term:</span>';view.appendChild(d);view.scrollTop=view.scrollHeight;$('send').disabled=true}
function typingOff(){const t=$('tp');if(t)t.remove();$('send').disabled=false}
async function handle(raw){
  const text=raw.trim();if(!text)return;
  print('user',text);history.push({role:'user',content:text});store.set('hist',history.slice(-40));
  if(text.startsWith('/')){
    const sp=text.indexOf(' ');const cmd=text.slice(1,sp<0?undefined:sp).toLowerCase();const arg=sp<0?'':text.slice(sp+1);
    if(cmd==='help'){
      print('sys','comandos:\n/help · /plugins · /install <id> · /uninstall <id> · /weather · /calc <expr> · /crypto <moedas> · /wiki <termo> · /tradutor <idioma> <texto> · /notes (nota) · /timer <min> <aviso> · /qr <texto> · /hn · /meu-ip · /sysinfo · /clear · /perm');
    }else if(cmd==='plugins'){print('sys','instalados: '+installed().join(', ')||'nenhum')}
    else if(cmd==='install'||cmd==='uninstall'){
      const p=pluginById(arg.trim());
      if(!p)return print('err','plugin desconhecido: '+arg);
      const list=installed();
      if(cmd==='install'){if(!list.includes(p.id)){for(const pm of p.perms){await ensurePerm(pm)}list.push(p.id);store.set('plugins',list)}print('sys','✓ instalado: '+p.name)}
      else{store.set('plugins',list.filter(x=>x!==p.id));print('sys','✕ removido: '+p.name)}
      renderExplore();
    }
    else if(cmd==='clear'){view.innerHTML='';history.length=0;store.del('hist');print('sys','limpo.')}
    else if(cmd==='perm'){renderPerms();switchView('config');print('sys','veja config → permissões')}
    else{
      const p=pluginById(cmd);
      if(p&&installed().includes(p.id)){
        typingOn();
        try{const out=await p.run(arg);print('ai',String(out))}
        catch(e){print('err','falha: '+e.message)}
        typingOff();
      }else if(p){print('err','plugin não instalado. use /install '+p.id)}
      else print('err','comando desconhecido. /help');
    }
    return;
  }
  typingOn();
  try{const r=await askAI(text);print('ai',r.text);history.push({role:'assistant',content:r.text});store.set('hist',history.slice(-40))}
  catch(e){print('err',e.message+' — respondendo offline…');const off=offline(text);if(off)print('ai',off)}
  typingOff();
}
function offline(t){
  const m=t.match(/[\d+\-*/(). ]{3,}/);if(m&&/[\d]/.test(t)){const v=calc(m[0]);if(v!==null)return m[0].trim()+' = '+v}
  if(/\b(que horas|hora)\b/i.test(t))return '⏰ '+new Date().toLocaleTimeString('pt-BR');
  if(/\b(que dia|hoje)\b/i.test(t))return '📅 '+new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  return null;
}
$('in').addEventListener('submit',e=>{e.preventDefault();const v=$('txt').value;$('txt').value='';handle(v)});

/* ═════════ explorar ═════════ */
const CAT_ICON={weather:'\u26c5',crypto:'\u20bf',wiki:'\ud83d\udcd6',hn:'\ud83d\udcf0',calc:'\ud83e\uddee',timer:'\u23f1',notes:'\ud83d\udcdd',translate:'\ud83c\udf10',qr:'\u25a3',sysinfo:'\ud83d\udda5',ip:'\ud83d\udce1'};
let exploreCat='todos';
function catList(){return ['todos',...new Set(PLUGINS.map(p=>p.cat))]}
function renderChips(){
  $('catChips').innerHTML=catList().map(c=>'<button class="chip'+(c===exploreCat?' on':'')+'" onclick="setCat(\''+c+'\')">'+esc(c)+'</button>').join('');
}
function setCat(c){exploreCat=c;renderExplore()}
function renderExplore(){
  renderChips();
  const q=($('pluginSearch').value||'').toLowerCase();
  const list=PLUGINS.filter(p=>(exploreCat==='todos'||p.cat===exploreCat)&&(!q||(p.name+p.desc+p.cat).toLowerCase().includes(q)));
  const inst=installed();
  $('exploreCount').textContent=list.length+' plugin(s) · '+inst.length+' instalado(s)';
  $('pluginGrid').innerHTML=list.map(p=>{
    const on=inst.includes(p.id);
    return '<div class="card'+(on?' installed':'')+'"><span class="icon">'+(CAT_ICON[p.id]||'\u2726')+'</span><b>'+esc(p.name)+'</b><small>'+esc(p.desc)+'</small>'
      +(p.perms.length?'<span class="badge">perm: '+p.perms.join(', ')+'</span>':'')
      +'<span class="badge">'+esc(p.cat)+'</span>'
      +'<div class="card-actions"><span class="installed-tag">\u2713 instalado</span><button class="'+(on?'off':'')+'" onclick="togglePlugin(\''+p.id+'\')">'+(on?'remover':'instalar')+'</button></div></div>';
  }).join('') || '<div class="empty-hint">nenhum plugin encontrado pra "'+esc(q)+'"</div>';
}
function togglePlugin(id){const list=installed();const p=pluginById(id);
  if(list.includes(id)){store.set('plugins',list.filter(x=>x!==id))}
  else{list.push(id);store.set('plugins',list);p.perms.forEach(pm=>ensurePerm(pm))}
  renderExplore();renderPerms();
}

/* ═════════ config ═════════ */
function saveCfg(){
  cfg.provider=$('cfgProvider').value;cfg.key=$('cfgKey').value.trim();cfg.model=$('cfgModel').value.trim();
  store.set('cfg',cfg);
  $('cfgMsg').textContent='salvo ✓ (chave guardada só neste navegador)';
  setStatus();
}
async function testAI(){
  $('cfgMsg').textContent='testando…';
  try{const r=await askAI('Responda apenas: ok');$('cfgMsg').textContent='conectado ✓ via '+r.provider;if(window.TermAuth)TermAuth.markKeyVerified(cfg.provider,true)}
  catch(e){$('cfgMsg').textContent='falhou: '+e.message.slice(0,80);if(window.TermAuth)TermAuth.markKeyVerified(cfg.provider,false)}
}
function renderPerms(){
  $('permList').innerHTML=Object.entries(PERMS).map(([k,p])=>{
    let st;try{st=permState(k)}catch(e){st='prompt'}
    const cls=st==='granted'?'ok':st==='denied'?'no':'ask';
    return '<div class="perm"><span>'+esc(p.label)+'</span><span class="'+cls+'">'+st+'</span></div>';
  }).join('');
}
function exportCfg(){
  const data={device:window.TermAuth?TermAuth.getDeviceId():null,provider:cfg.provider,model:cfg.model,plugins:installed(),notes:store.get('notes',[]),hist:history};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='termchat-config.json';a.click();
}
function importCfg(inp){
  const f=inp.files[0];if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{try{const d=JSON.parse(rd.result);
    if(d.provider){cfg.provider=d.provider;cfg.model=d.model||'';store.set('cfg',cfg);$('cfgProvider').value=cfg.provider;$('cfgModel').value=cfg.model}
    if(Array.isArray(d.plugins))store.set('plugins',d.plugins);
    if(Array.isArray(d.notes))store.set('notes',d.notes);
    if(Array.isArray(d.hist)){store.set('hist',d.hist.slice(-40));d.hist.forEach(h=>print(h.role==='user'?'user':'ai',h.content))}
    renderExplore();$('cfgMsg').textContent='importado ✓';
  }catch(e){$('cfgMsg').textContent='arquivo inválido'}};
  rd.readAsText(f);inp.value='';
}
function wipe(){if(!confirm('Apagar TODOS os dados locais do TermChat?'))return;Object.keys(localStorage).filter(k=>k.startsWith('tc_')).forEach(k=>localStorage.removeItem(k));location.reload()}
function setStatus(){$('status').innerHTML='<span class="dot"></span>'+(cfg.provider==='auto'?'auto · cadeia grátis':esc(cfg.provider))+' · '+installed().length+' plugins'}

/* ═════════ views ═════════ */
function switchView(v){
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  $('chatView').classList.toggle('hidden',v!=='chat');
  $('exploreView').classList.toggle('hidden',v!=='explorar');
  $('configView').classList.toggle('hidden',v!=='config');
}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.v));

/* ── links externos: confirmação antes de redirecionar ── */
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');
  if(a&&a.href.startsWith('http')){e.preventDefault();if(confirm('Abrir fora do TermChat?\n'+a.href))window.open(a.href,'_blank','noopener')}
},true);

/* ═════════ boot ═════════ */
if('serviceWorker' in navigator){addEventListener('load',()=>navigator.serviceWorker.register('service-worker.js').catch(()=>{}))}
$('cfgProvider').value=cfg.provider;$('cfgKey').value='';$('cfgModel').value=cfg.model;
renderExplore();renderPerms();setStatus();
print('sys','TermChat v1.0 — boot ok. IA em modo auto: Pollinations (grátis, sem chave).\nDigite /help para comandos ou veja a aba explorar.');
