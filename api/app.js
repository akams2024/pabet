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
  if(!j)return bad();const u=JSON.parse(j),h=await hash(String(b.password||''),u.salt);
  if(!crypto.timingSafeEqual(Buffer.from(h),Buffer.from(u.hash)))return bad();return login(res,k,send);
 }
 if(r==='admin_login'){
  const f=await R('INCR','fail:adm');if(f===1)await R('EXPIRE','fail:adm',600);
  if(f>8)return send({e:'زۆر هەوڵت دا. دوای 10 خولەک دووبارە هەوڵ بدەرەوە.'},429);
  if(!crypto.timingSafeEqual(sha(b.u||''),sha(ADMIN_USER))||!crypto.timingSafeEqual(sha(b.p||''),sha(ADMIN_PASS)))return send({e:'ناو یان وشەی نهێنی هەڵەیە.'},401);
  await R('DEL','fail:adm');const t=crypto.randomBytes(24).toString('hex');await R('SET','adm:'+t,'1','EX',43200);setC(res,'a',t,43200);return send({ok:1});
 }
 if(r.startsWith('admin_')){
  if(!await isAdm(req))return send({e:'ڕێگەپێدراو نیت'},401);
  if(r==='admin_logout'){await R('DEL','adm:'+cookie(req,'a'));return send({ok:1});}
  if(r==='admin_list'){
   const ks=await R('SMEMBERS','users');if(!ks.length)return send({users:[]});
   const us=await R('MGET',...ks.map(k=>'user:'+k)),cs=await R('MGET',...ks.map(k=>'cr:'+k)),bs=await R('MGET',...ks.map(k=>'ban:'+k));
   return send({users:ks.map((k,i)=>{const u=us[i]?JSON.parse(us[i]):{};return{key:k,username:u.username,name:u.name,phone:u.phone,created:u.created,credit:Number(cs[i])||0,ban:Number(bs[i])||0};})});
  }
  const k=String(b.key||'');if(!await R('EXISTS','user:'+k))return send({e:'یاریزان نەدۆزرایەوە'},404);
  if(r==='admin_delete'){await R('DEL','user:'+k,'cr:'+k,'un:'+k,'bj:'+k);await R('SREM','users',k);return send({ok:1});}
  if(r==='admin_ban'){const m=Number(b.minutes);if(!Number.isInteger(m)||m<0||m>525600)return send({e:'ماوەی نادروست'},400);
   if(m===0){await R('DEL','ban:'+k);return send({ban:0});}
   const t=Date.now()+m*60000;await R('SET','ban:'+k,String(t),'EX',m*60);return send({ban:t});}
  if(r==='admin_adjust'){
   const a=Number(b.amount);if(!Number.isInteger(a)||a<0||a>1e12)return send({e:'بڕی نادروست'},400);
   if(b.op==='add')await R('INCRBY','cr:'+k,a);
   else if(b.op==='sub'){if(await R('DECRBY','cr:'+k,a)<0)await R('SET','cr:'+k,0);}
   else if(b.op==='set')await R('SET','cr:'+k,a);else return send({e:'نادروست'},400);
   return send({credit:await bal(k)});
  }
  return send({e:'نادروست'},400);
 }
 const u=await su(req);if(!u)return send({e:'پێویستە بچیتە ژوورەوە'},401);
 if(r==='logout'){await R('DEL','sess:'+cookie(req,'s'));return send({ok:1});}
 const bt=Number(await R('GET','ban:'+u));if(bt&&bt>Date.now())return send({e:'ئەکاونتەکەت بۆ ماوەیەک قەدەغە کراوە.',ban:bt},403);
 if(r==='me'){const j=JSON.parse(await R('GET','user:'+u));return send({username:j.username,name:j.name,credit:await bal(u)});}
 if(r==='roulette'){
  let tot=0;const bets=b.bets||{};
  for(const[k,v]of Object.entries(bets)){if(!/^(n([0-9]|[12][0-9]|3[0-6])|d[123]|h[12]|ev|od|rd|bk)$/.test(k)||!Number.isInteger(v)||v<=0||v>1e9)return send({e:'بەستی نادروست'},400);tot+=v;}
  if(!tot)return send({e:'چیپ دابنێ'},400);
  if(!await debit(u,tot))return send({e:'کریدیتت بەشی ئەم بڕە ناکات.'},402);
  const n=rnd(37);let pay=0;
  for(const[k,v]of Object.entries(bets)){const x=Number(k.slice(1));
   if(k[0]==='n'&&x===n)pay+=v*36;else if(k[0]==='d'&&n>0&&Math.ceil(n/12)===x)pay+=v*3;
   else if(k==='h1'&&n>=1&&n<=18)pay+=v*2;else if(k==='h2'&&n>=19)pay+=v*2;
   else if(k==='ev'&&n>0&&n%2===0)pay+=v*2;else if(k==='od'&&n%2===1)pay+=v*2;
   else if(k==='rd'&&reds.includes(n))pay+=v*2;else if(k==='bk'&&n>0&&!reds.includes(n))pay+=v*2;}
  if(pay)await R('INCRBY','cr:'+u,pay);return send({r:n,pay,tot,bal:await bal(u)});
 }
 if(r==='slots'){
  const bet=b.bet;if(!Number.isInteger(bet)||bet<=0||bet>1e9)return send({e:'بڕی نادروست'},400);
  if(!await debit(u,bet))return send({e:'کریدیتت بەشی ئەم بڕە ناکات.'},402);
  const s=[0,0,0].map(()=>SL[rnd(SL.length)]);let m=0;
  if(s[0]===s[1]&&s[1]===s[2])m=PAY[s[0]];else if(s.filter(x=>x==='♥').length===2)m=2;
  if(m)await R('INCRBY','cr:'+u,bet*m);return send({s,m,win:bet*m,bal:await bal(u)});
 }
 if(r==='bj'){
  const raw=await R('GET','bj:'+u),s=raw?JSON.parse(raw):null,a=b.a;
  if(a==='deal'){
   if(s)return send({...view(s,false),resume:1});
   const bet=b.bet;if(!Number.isInteger(bet)||bet<=0||bet>1e9)return send({e:'بڕی نادروست'},400);
   if(!await debit(u,bet))return send({e:'کریدیتت بەشی ئەم بڕە ناکات.'},402);
   const d=[];for(const x of '♠♥♦♣')for(const y of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])d.push({r:y,s:x});
   for(let i=d.length-1;i>0;i--){const j=rnd(i+1);[d[i],d[j]]=[d[j],d[i]];}
   const n={deck:d,ph:[d.pop(),d.pop()],dh:[d.pop(),d.pop()],bet};
   if(val(n.ph)===21){if(val(n.dh)===21)return settle(u,n,1,'هەردووکتان بلاک جەک. بڕەکەت گەڕایەوە.',send);return settle(u,n,2.5,'بلاک جەک! بردتەوە',send);}
   await save(u,n);return send({...view(n,false),bal:await bal(u)});
  }
  if(!s)return send({e:'یاری چالاک نییە'},400);
  if(a==='hit'){s.ph.push(s.deck.pop());const v=val(s.ph);if(v>21)return settle(u,s,0,'تێپەڕیت لە 21. دیلەر بردیەوە.',send);if(v===21)return finish(u,s,send);await save(u,s);return send(view(s,false));}
  if(a==='stand')return finish(u,s,send);
  if(a==='double'){if(s.ph.length!==2)return send({e:'نادروست'},400);if(!await debit(u,s.bet))return send({e:'کریدیتت بەشی دووقات ناکات.'},402);s.bet*=2;s.ph.push(s.deck.pop());if(val(s.ph)>21)return settle(u,s,0,'تێپەڕیت لە 21. دیلەر بردیەوە.',send);return finish(u,s,send);}
 }
 return send({e:'نادروست'},400);
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const send=(o,c=200)=>res.status(c).json(o);
 if(req.method!=='POST')return send({e:'method'},405);
 if(!URL_||!TOK)return send({e:'داتابەیس بەستراوەتەوە نییە'},500);
 const b=req.body&&typeof req.body==='object'?req.body:{};
 try{return await route(req,res,b,send);}catch(e){return send({e:'هەڵەی سێرڤەر'},500);}
};
