const crypto=require('crypto');
const URL_=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
const TOK=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_USER=process.env.ADMIN_USER||'admin',ADMIN_PASS=process.env.ADMIN_PASS||'0900';
const R=async(...c)=>{const r=await fetch(URL_,{method:'POST',headers:{Authorization:'Bearer '+TOK},body:JSON.stringify(c)});const j=await r.json();if(j.error)throw new Error(j.error);return j.result;};
const rnd=n=>crypto.randomInt(n);
const hash=(p,s)=>new Promise((ok,no)=>crypto.scrypt(p,s,32,(e,k)=>e?no(e):ok(k.toString('hex'))));
const sha=s=>crypto.createHash('sha256').update(String(s)).digest();
const cookie=(req,n)=>{const m=(req.headers.cookie||'').match(new RegExp('(?:^|; )'+n+'=([^;]+)'));return m?m[1]:null;};
const setC=(res,n,v,age)=>res.setHeader('Set-Cookie',[...(res.getHeader('Set-Cookie')||[]),`${n}=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`]);
const bal=async u=>Number(await R('GET','cr:'+u))||0;
const debit=async(u,n)=>{const v=await R('DECRBY','cr:'+u,n);if(v<0){await R('INCRBY','cr:'+u,n);return false;}return true;};
const su=async req=>{const t=cookie(req,'s');if(!t)return null;const k=await R('GET','sess:'+t);return k&&await R('EXISTS','user:'+k)?k:null;};
const isAdm=async req=>{const t=cookie(req,'a');return !!t&&(await R('GET','adm:'+t))==='1';};
const reds=[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
const SL=['♥','♥','♥','♣','♣','♣','◆','◆','BAR','7'],PAY={'♥':5,'♣':8,'◆':15,'BAR':30,'7':100};
const val=h=>{let v=0,a=0;for(const c of h){if(c.r==='A'){a++;v+=11;}else v+=['J','Q','K'].includes(c.r)?10:Number(c.r);}while(v>21&&a){v-=10;a--;}return v;};
const view=(s,done)=>({ph:s.ph,dh:done?s.dh:[s.dh[0],null],bet:s.bet,done});
const save=(u,s)=>R('SET','bj:'+u,JSON.stringify(s),'EX',3600);
async function settle(u,s,mult,msg,send){await R('DEL','bj:'+u);if(mult)await R('INCRBY','cr:'+u,Math.floor(s.bet*mult));return send({...view(s,true),msg,win:mult>1,bal:await bal(u)});}
async function finish(u,s,send){while(val(s.dh)<17)s.dh.push(s.deck.pop());const p=val(s.ph),d=val(s.dh);
 return d>21||p>d?settle(u,s,2,'بردتەوە',send):p===d?settle(u,s,1,'یەکسان. بڕەکەت گەڕایەوە.',send):settle(u,s,0,'دیلەر بردیەوە.',send);}
async function login(res,k,send,x){const t=crypto.randomBytes(24).toString('hex');await R('SET','sess:'+t,k,'EX',2592000);setC(res,'s',t,2592000);return send({ok:1,...x});}

async function route(req,res,b,send){
 const r=b.r;
 if(r==='register'){
  const n=String(b.name||'').trim().slice(0,60),u=String(b.username||'').trim(),p=String(b.password||''),ph=String(b.phone||'').trim().slice(0,20);
  if(n.length<2||!/^[A-Za-z0-9_]{3,16}$/.test(u)||ph.replace(/\D/g,'').length<7||p.length<6)return send({e:'زانیارییەکان بە دروستی پڕ بکەرەوە.'},400);
  const k=u.toLowerCase();if(k===ADMIN_USER.toLowerCase())return send({e:'ئەم ناوە هەیە.'},409);
  if(await R('SET','un:'+k,'1','NX')===null)return send({e:'ئەم ناوە هەیە. ناوێکی تر هەڵبژێرە.'},409);
  const salt=crypto.randomBytes(16).toString('hex');
  await R('SET','user:'+k,JSON.stringify({username:u,name:n,phone:ph,salt,hash:await hash(p,salt),created:Date.now()}));
  await R('SET','cr:'+k,0);await R('SADD','users',k);return login(res,k,send,{welcome:1});
 }
 if(r==='login'){
  const k=String(b.username||'').trim().toLowerCase(),j=await R('GET','user:'+k),bad=()=>send({e:'ناو یان وشەی نهێنی هەڵەیە.'},401);
