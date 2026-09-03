// ── Minimal PDF writer ────────────────────────────────────────────────
// One page, base-14 fonts, filled rectangles + text only. No dependencies.
// Assembled as a BINARY STRING (one char === one byte) so xref offsets are exact.

const MR_HELV_W=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,350,222,556,333,1000,556,556,333,1000,667,333,1000,350,611,350,350,222,222,333,333,350,556,1000,333,1000,500,333,944,350,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const MR_HELVB_W=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,350,278,556,500,1000,556,556,333,1000,667,333,1000,350,611,350,350,278,278,500,500,350,556,1000,333,1000,556,333,944,350,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

// Unicode → WinAnsi. Anything unmapped above 255 becomes '?'.
const MR_WINMAP={0x2013:0x96,0x2014:0x97,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2026:0x85,0x2212:0x2D,0x2248:0x7E,0x00B7:0xB7,0x2192:0x2D};
function mrWinByte(cp){
  if (cp < 32) return 32;
  if (cp < 127) return cp;
  if (MR_WINMAP[cp] != null) return MR_WINMAP[cp];
  if (cp >= 160 && cp <= 255) return cp;
  return 63; // '?'
}
function mrToWin(s){ let o=''; for (const ch of String(s)) o += String.fromCharCode(mrWinByte(ch.codePointAt(0))); return o; }
function mrStrWidth(s, bold, size){
  const T = bold ? MR_HELVB_W : MR_HELV_W;
  let w = 0;
  for (const ch of String(s)) { const b = mrWinByte(ch.codePointAt(0)); w += T[b-32] != null ? T[b-32] : 500; }
  return w * size / 1000;
}
function mrPdfEsc(s){
  let o = '';
  for (const ch of mrToWin(s)) { if (ch==='('||ch===')'||ch==='\\') o += '\\'; o += ch; }
  return o;
}
const mrN2 = v => (Math.round(v*100)/100).toString();

function MrPdf(w, h){ this.w=w; this.h=h; this.ops=[]; this._c=null; }
MrPdf.prototype._col = function(c){
  const k = c.join(',');
  if (this._c !== k) { this.ops.push(`${mrN2(c[0])} ${mrN2(c[1])} ${mrN2(c[2])} rg`); this._c = k; }
};
MrPdf.prototype.rect = function(x,y,w,h,c){
  if (w <= 0 || h <= 0) return;
  this._col(c);
  this.ops.push(`${mrN2(x)} ${mrN2(y)} ${mrN2(w)} ${mrN2(h)} re f`);
};
MrPdf.prototype.line = function(x0,y,x1,c,lw){ this.rect(x0, y, x1-x0, lw||0.5, c); };
MrPdf.prototype.text = function(x,y,s,size,bold,c,font){
  if (s == null || s === '') return;
  this._col(c);
  const f = font || (bold ? '/F2' : '/F1');
  this.ops.push(`BT ${f} ${mrN2(size)} Tf 1 0 0 1 ${mrN2(x)} ${mrN2(y)} Tm (${mrPdfEsc(s)}) Tj ET`);
  this._c = null; // colour is inside BT/ET in some readers; force re-emit
};
MrPdf.prototype.rtext = function(x,y,s,size,bold,c){ this.text(x - mrStrWidth(s,bold,size), y, s, size, bold, c); };
MrPdf.prototype.ctext = function(x,y,s,size,bold,c){ this.text(x - mrStrWidth(s,bold,size)/2, y, s, size, bold, c); };

MrPdf.prototype.bytes = function(){
  const content = this.ops.join('\n');
  const objs = [null,
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${this.w} ${this.h}]/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>`,
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>'];
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off = [];
  for (let i = 1; i < objs.length; i++) {
    off[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  let x = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) x += String(off[i]).padStart(10,'0') + ' 00000 n \n';
  out += x + `trailer\n<</Size ${objs.length}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  const u8 = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) u8[i] = out.charCodeAt(i) & 0xFF;
  return u8;
};
MrPdf.prototype.base64 = function(){
  const u8 = this.bytes();
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return (typeof btoa === 'function') ? btoa(bin) : Buffer.from(u8).toString('base64');
};

// ── Linalysis monthly reports — data shaping, analysis and page rendering ──

// palette
const MRC_RED=[0.996,0.106,0.016], MRC_INK=[0.078,0.086,0.102], MRC_MUT=[0.42,0.447,0.502],
      MRC_RULE=[0.890,0.902,0.918], MRC_TINT=[0.965,0.969,0.976], MRC_GOOD=[0.020,0.463,0.259],
      MRC_GOODB=[0.906,0.953,0.925], MRC_BAD=[0.706,0.137,0.094], MRC_WHITE=[1,1,1],
      MRC_BAR=[0.039,0.400,0.761], MRC_BARBG=[0.910,0.929,0.949], MRC_WARN=[0.710,0.310,0.031];

const MR_PW=612, MR_PH=792, MR_M=40, MR_CW=MR_PW-2*MR_M;
const MR_MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MR_MON3=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function mrNum(v){ if(v==null||v==='')return null; const n=Number(String(v).replace(/\s/g,'').replace(',','.')); return Number.isFinite(n)?n:null; }
function mrFmtN(n,dp){ if(n==null)return '—'; return dp?n.toFixed(dp):Math.round(n).toLocaleString('en-US'); }
function mrFmtD(n,dp,dir){ // signed delta -> [string, colour]
  if(n==null) return ['—',MRC_MUT];
  const eps=dp?Math.pow(10,-dp)/2:0.5;
  if(Math.abs(n)<eps) return ['no change',MRC_MUT];
  const s=(n>0?'+':'−')+(dp?Math.abs(n).toFixed(dp):Math.round(Math.abs(n)).toLocaleString('en-US'));
  return [s, dir?(n>0?MRC_GOOD:MRC_BAD):MRC_MUT];
}
function mrPad2(n){ return n<10?'0'+n:''+n; }

// previous complete month, or an explicit "YYYY-MM"
function mrMonthWindow(now, label){
  let y, m;
  if (label && /^\d{4}-\d{2}$/.test(label)) { y=+label.slice(0,4); m=+label.slice(5,7)-1; }
  else { y=now.getUTCFullYear(); m=now.getUTCMonth()-1; if(m<0){m=11;y--;} }
  const dim = new Date(Date.UTC(y, m+1, 0)).getUTCDate();
  return { y, m, dim, name:MR_MONTHS[m], key:`${y}-${mrPad2(m+1)}`, label:`${MR_MONTHS[m]} ${y}`.toUpperCase(),
           mon3:MR_MON3[m], first:`${y}-${mrPad2(m+1)}-01`, last:`${y}-${mrPad2(m+1)}-${mrPad2(dim)}` };
}

const MR_FIELDS=['ssi_overall','ssi_brand','ssi_prospecting','ssi_insights','ssi_relationships',
  'ssi_industry_rank','ssi_network_rank','connections','invitations','invitations_sent_24h','invitations_sent_7d',
  'profile_views','search_appearances','all_appearances'];

async function mrLoadAccount(env, email, win, extLatest){
  const user = await env.KV.get('user:'+email,'json');
  const checkin = await env.KV.get('ext_checkin:'+email,'json');
  const keys = await listAll(env.KV, 'stats:'+email+':');
  const dates = keys.map(k=>k.name.split(':').pop()).filter(d=>d>=win.first&&d<=win.last).sort();
  const rows=[];
  for (let i=0;i<dates.length;i+=25){
    const batch=dates.slice(i,i+25);
    const got=await Promise.all(batch.map(d=>env.KV.get(`stats:${email}:${d}`,'json')));
    got.forEach((r,j)=>{ if(r) rows.push([batch[j], r]); });
  }
  const a={ email, name:(user&&user.full_name)||email, days:[], series:{}, first:{}, last:{},
            ext:{version:(checkin&&checkin.version)||null, stale:false}, hasData:false };
  if (checkin && checkin.version && extLatest && extLatest.version)
    a.ext.stale = cmpVer(checkin.version, extLatest.version) < 0;
  for (const f of MR_FIELDS) a.series[f]=[];
  for (const [d,row] of rows){
    a.days.push(+d.slice(8));
    for (const f of MR_FIELDS){
      const v=mrNum(row[f]);
      a.series[f].push(v);
      if(v!=null){ if(a.first[f]==null) a.first[f]={d:+d.slice(8),v}; a.last[f]={d:+d.slice(8),v}; }
    }
  }
  a.hasData = a.days.length>0;
  return a;
}
function mrDelta(a,f){ const x=a.first[f],y=a.last[f]; return (x&&y)?y.v-x.v:null; }

// ── per-user analysis ────────────────────────────────────────────────
function mrAnalyse(a, win){
  const R={wins:[], notes:[], sent:{total:0,daysAny:0,busiest:null,zero:[]}, peak:null, stretch:null, tail:null};
  const S=a.series, D=a.days;
  // outreach
  S.invitations_sent_24h.forEach((v,i)=>{
    if(v==null) return;
    R.sent.total+=v;
    if(v>0){ R.sent.daysAny++; if(!R.sent.busiest||v>R.sent.busiest.v) R.sent.busiest={v,d:D[i]}; }
    else R.sent.zero.push(D[i]);
  });
  // SSI peak
  S.ssi_overall.forEach((v,i)=>{ if(v!=null&&(!R.peak||v>R.peak.v)) R.peak={v,d:D[i]}; });
  // best short connection stretch (span of at most 4 calendar days)
  const c=S.connections;
  for(let i=0;i<D.length;i++){ if(c[i]==null) continue;
    for(let j=i+1;j<D.length;j++){ if(c[j]==null||D[j]-D[i]>3) continue;
      const g=c[j]-c[i];
      if(g>0&&(!R.stretch||g>R.stretch.g)) R.stretch={g, a:D[i], b:D[j], span:D[j]-D[i]+1};
    }}
  // last-4-days movement
  const tailIdx=D.map((d,i)=>({d,i})).filter(o=>o.d>win.dim-4&&c[o.i]!=null);
  if(tailIdx.length>1) R.tail={g:c[tailIdx[tailIdx.length-1].i]-c[tailIdx[0].i], from:tailIdx[0].d, to:tailIdx[tailIdx.length-1].d};
  // pillars
  const PILL=[['Brand','ssi_brand'],['Prospecting','ssi_prospecting'],['Insights','ssi_insights'],['Relationships','ssi_relationships']];
  R.pillars=PILL.map(([n,f])=>({name:n, field:f, v:a.last[f]?a.last[f].v:null, d:mrDelta(a,f)}));
  const gains=R.pillars.filter(p=>p.d!=null&&p.d>0).sort((x,y)=>y.d-x.d);
  const weakest=R.pillars.filter(p=>p.v!=null).sort((x,y)=>x.v-y.v)[0];

  // wins
  if(R.peak) R.wins.push([`SSI peaked at ${R.peak.v.toFixed(2)}`, `on ${R.peak.d} ${win.mon3}, your best of the month`]);
  if(R.stretch) R.wins.push([`+${R.stretch.g} connections in ${R.stretch.span} days`,
                             `${R.stretch.a}–${R.stretch.b} ${win.mon3}, your strongest stretch`]);
  if(gains.length) R.wins.push([`${gains[0].name} +${gains[0].d.toFixed(2)}`, 'the biggest pillar gain you posted']);
  const connD=mrDelta(a,'connections');
  if(R.wins.length<3&&connD!=null&&connD>0) R.wins.push([`+${Math.round(connD)} connections`,'added to your network this month']);
  R.wins=R.wins.slice(0,3);

  // recommendations
  if(weakest){
    const fell=weakest.d!=null&&weakest.d<0;
    R.notes.push([`${weakest.name} is your weakest pillar${fell?', and it fell':''}.`,
      `${weakest.v.toFixed(2)} of 25${fell?`, down ${Math.abs(weakest.d).toFixed(2)}`:''}. It responds to sharing and engaging with industry content.`]);
  }
  if(R.sent.zero.length){
    const days=R.sent.zero.slice(0,3).join(', ').replace(/, ([^,]*)$/,' and $1');
    R.notes.push(['Growth flattened the moment outreach stopped.',
      `You sent nothing on ${days} ${win.mon3}` + (R.tail?`, and the last days of the month produced only ${R.tail.g} new connections.`:'.')]);
  }
  const pv=mrDelta(a,'profile_views'), sa=mrDelta(a,'search_appearances');
  if(R.notes.length<3&&sa!=null&&sa<0&&pv!=null&&pv>0){
    R.notes.push(['Search appearances slipped while views rose.',
      `${mrFmtN(a.first.search_appearances.v)} down to ${mrFmtN(a.last.search_appearances.v)}, even as profile views went up — people are finding you through your activity, not through search.`]);
  }
  if(R.notes.length<3&&a.days.length<win.dim){
    R.notes.push([`${win.dim-a.days.length} of ${win.dim} days went unmeasured.`,
      'Days with no collection are gaps in every number on this page.' + (a.ext.stale?' Your extension is also behind the current release.':'')]);
  }
  R.notes=R.notes.slice(0,3);
  return R;
}

function mrHead(p,y,sub,rightBig,rightSmall){
  p.rect(MR_M,y-4,4,34,MRC_RED);
  p.text(MR_M+14,y+16,'LINALYSIS',17,true,MRC_INK);
  p.text(MR_M+14,y+3,sub,9.5,false,MRC_MUT);
  p.rtext(MR_PW-MR_M,y+16,rightBig,17,true,MRC_RED);
  p.rtext(MR_PW-MR_M,y+4,rightSmall,7.5,false,MRC_MUT);
  p.line(MR_M,y-20,MR_PW-MR_M,MRC_INK,1.2);
  return y-20;
}
function mrSect(p,y,label,x0,x1){
  x0=x0==null?MR_M:x0; x1=x1==null?MR_PW-MR_M:x1;
  const L=label.toUpperCase();
  p.text(x0,y,L,7.5,true,MRC_MUT);
  p.line(x0+mrStrWidth(L,true,7.5)+8,y+2.5,x1,MRC_RULE,0.5);
}
function mrFoot(p,left,right){
  const fy=MR_M-8;
  p.line(MR_M,fy+14,MR_PW-MR_M,MRC_RULE,0.5);
  p.text(MR_M,fy+4,left,6.6,false,MRC_MUT);
  p.rtext(MR_PW-MR_M,fy+4,right,6.6,false,MRC_MUT);
}
// vertical bars on a 1..dim day axis; gaps are days with no collection
function mrChart(p,x,y,w,h,dim,days,vals,lo,hi,caption,colors,ticks){
  p.rect(x,y,w,h,MRC_WHITE);
  p.line(x,y,x+w,MRC_RULE,0.5); p.line(x,y+h,x+w,MRC_RULE,0.5);
  p.rect(x,y,0.5,h,MRC_RULE); p.rect(x+w-0.5,y,0.5,h,MRC_RULE);
  const ax=x+26, aw=w-34, base=y+11, plot=h-23;
  for (const f of [0,0.5,1]){
    const gy=base+plot*f;
    p.line(ax,gy,x+w-6,MRC_RULE,0.4);
    const v=lo+(hi-lo)*f;
    p.rtext(ax-4,gy-2.4,(hi-lo>=6?Math.round(v).toLocaleString('en-US'):v.toFixed(1)),5.6,false,MRC_MUT);
  }
  const pw=aw/dim;
  days.forEach((d,i)=>{
    const v=vals[i]; if(v==null) return;
    const bh=Math.max(1.0, plot*(v-lo)/(hi-lo));
    p.rect(ax+(d-1)*pw+0.5, base, Math.max(1.6,pw-1.4), bh, Array.isArray(colors[0])?colors[i]:colors);
  });
  for (const d of ticks) p.ctext(ax+(d-0.5)*pw, y+3.5, String(d), 5.6, false, MRC_MUT);
  p.text(ax, y+h-9, caption, 6.2, false, MRC_MUT);
}
function mrNiceTop(max){
  if(max<=0) return 1;
  const mag=Math.pow(10,Math.floor(Math.log10(max)));
  for(const s of [1,1.25,1.5,1.6,2,2.5,3,4,5,6,8,10]) if(max<=s*mag) return s*mag;
  return 10*mag;
}
function mrDayTicks(dim){ return [1, Math.round(dim*0.25), Math.round(dim*0.5), Math.round(dim*0.75), dim]; }

// ── PER-USER PAGE ────────────────────────────────────────────────────
function mrUserPdf(a, win, build){
  const p=new MrPdf(MR_PW,MR_PH), an=mrAnalyse(a,win);
  let y=mrHead(p,MR_PH-MR_M,'Your month on LinkedIn',win.label,`${a.name}  ·  ${a.email}`);
  const dim=win.dim, D=a.days, S=a.series, ticks=mrDayTicks(dim);

  if(!a.hasData){
    y-=60; p.rect(MR_M,y,MR_CW,46,MRC_TINT); p.rect(MR_M,y,3,46,MRC_RED);
    p.text(MR_M+14,y+28,`No data was collected for you in ${win.name} ${win.y}.`,12,true,MRC_INK);
    p.text(MR_M+14,y+13,'Your Linalysis extension did not report a single day this month. Install or update it and sign in to start measuring.',8.6,false,MRC_INK);
    mrFoot(p,'Linalysis  ·  linalysis.net  ·  measured from your own LinkedIn pages, daily',build);
    return p;
  }

  const dSsi=mrDelta(a,'ssi_overall'), dConn=mrDelta(a,'connections'), dPv=mrDelta(a,'profile_views');
  // verdict
  const up = dSsi!=null && dSsi>0;
  y-=44; p.rect(MR_M,y,MR_CW,34,MRC_TINT); p.rect(MR_M,y,3,34,MRC_RED);
  p.text(MR_M+13,y+21,`${win.name} ${up?'moved you forward.':'was a holding month.'}`,12,true,MRC_INK);
  const bits=[];
  if(dSsi!=null) bits.push(`Your Social Selling Index ${dSsi>=0?'rose':'fell'} ${Math.abs(dSsi).toFixed(2)} points`);
  if(dConn!=null) bits.push(`you added ${Math.round(dConn)} connections`);
  const bestP=an.pillars.filter(q=>q.d!=null).sort((x,z)=>z.d-x.d)[0];
  if(bestP&&bestP.d>0) bits.push(`and ${bestP.name} was your strongest pillar of the month`);
  p.text(MR_M+13,y+8,bits.join(', ').replace(/, and /,' and ')+'.',8.4,false,MRC_INK);

  // wins
  y-=32;
  const ww=(MR_CW-2*8)/3;
  an.wins.forEach((w,i)=>{
    const x=MR_M+i*(ww+8);
    p.rect(x,y,ww,26,MRC_GOODB); p.rect(x,y,2.5,26,MRC_GOOD);
    p.text(x+10,y+15,w[0],8.6,true,MRC_GOOD);
    p.text(x+10,y+5,w[1],6.6,false,MRC_MUT);
  });

  // tiles
  y-=12; mrSect(p,y,'Your headline numbers'); y-=64;
  const tw=(MR_CW-3*9)/4;
  const tiles=[
    ['SSI OVERALL', a.last.ssi_overall?a.last.ssi_overall.v.toFixed(2):'—',
      dSsi!=null?`${mrFmtD(dSsi,2,true)[0]} over the month`:'no comparison', (dSsi==null||dSsi>=0)?MRC_GOOD:MRC_BAD],
    ['NEW CONNECTIONS', dConn!=null?(dConn>=0?'+':'−')+Math.abs(Math.round(dConn)).toLocaleString('en-US'):'—',
      a.last.connections?`${mrFmtN(a.last.connections.v)} in your network`:'', (dConn==null||dConn>=0)?MRC_GOOD:MRC_BAD],
    ['PROFILE VIEWS', a.last.profile_views?mrFmtN(a.last.profile_views.v):'—',
      dPv!=null?`${mrFmtD(dPv,0,true)[0]} over the month`:'', (dPv==null||dPv>=0)?MRC_GOOD:MRC_BAD],
    ['INVITATIONS SENT', mrFmtN(an.sent.total),
      D.length?`about ${(an.sent.total/D.length).toFixed(1)} a day measured`:'', MRC_BAR],
  ];
  tiles.forEach((t,i)=>{
    const x=MR_M+i*(tw+9);
    p.rect(x,y,tw,56,MRC_WHITE);
    p.line(x,y,x+tw,MRC_RULE,0.5); p.line(x,y+56,x+tw,MRC_RULE,0.5);
    p.rect(x,y,0.5,56,MRC_RULE); p.rect(x+tw-0.5,y,0.5,56,MRC_RULE);
    p.rect(x,y+53,tw,3,t[3]);
    p.text(x+10,y+39,t[0],6.4,true,MRC_MUT);
    p.text(x+10,y+19,t[1],20,true,t[3]);
    p.text(x+10,y+7,t[2],6.6,false,MRC_MUT);
  });

  // pillars + SSI mrChart
  y-=22;
  const LW=244, RX=MR_M+LW+20;
  mrSect(p,y,'SSI breakdown',MR_M,MR_M+LW);
  mrSect(p,y,'SSI through the month',RX,MR_PW-MR_M);
  const top=y-12; let py=top;
  for(const q of an.pillars){
    py-=21;
    p.text(MR_M,py+12,q.name,8.2,true,MRC_INK);
    p.rtext(MR_M+LW-60,py+12,q.v!=null?q.v.toFixed(2):'—',8.2,true,MRC_INK);
    p.rtext(MR_M+LW-45,py+12,'/ 25',6.4,false,MRC_MUT);
    const [ds,dc]=mrFmtD(q.d,2,true);
    p.rtext(MR_M+LW,py+12,ds,7.4,true,dc);
    p.rect(MR_M,py+1,LW,6.5,MRC_BARBG);
    if(q.v!=null) p.rect(MR_M,py+1,LW*Math.min(1,q.v/25),6.5,(q.d!=null&&q.d<0)?MRC_BAD:MRC_BAR);
  }
  py-=16;
  p.rect(MR_M,py+1,LW,14,MRC_TINT);
  const ir=a.last.ssi_industry_rank, nr=a.last.ssi_network_rank;
  p.text(MR_M+8,py+5.5,`Industry rank  top ${ir?ir.v:'—'}%`,7.4,true,MRC_INK);
  p.text(MR_M+124,py+5.5,`Network rank  top ${nr?nr.v:'—'}%`,7.4,true,MRC_INK);
  {
    const vals=S.ssi_overall.filter(v=>v!=null);
    const mn=Math.min(...vals), mx=Math.max(...vals), sp=Math.max(0.5,mx-mn);
    const lo=Math.max(0,Math.floor((mn-sp*0.2)*2)/2), hi=Math.ceil((mx+sp*0.08)*2)/2;
    mrChart(p,RX,py+1,(MR_PW-MR_M)-RX,top-12-(py+1),dim,D,S.ssi_overall,lo,hi,
      'Daily SSI · gaps are days with no collection',MRC_BAR,ticks);
  }
  y=py-8;

  // two charts
  y-=8;
  const CH=(MR_CW-20)/2;
  mrSect(p,y,'Connections gained',MR_M,MR_M+CH);
  mrSect(p,y,'Invitations sent per day',MR_M+CH+20,MR_PW-MR_M);
  y-=82;
  const c0=a.first.connections?a.first.connections.v:0;
  const gain=S.connections.map(v=>v==null?null:v-c0);
  const gmax=mrNiceTop(Math.max(1,...gain.filter(v=>v!=null)));
  mrChart(p,MR_M,y,CH,80,dim,D,gain,0,gmax,`Cumulative, from ${a.first.connections?a.first.connections.d:1} ${win.mon3}`,MRC_BAR,ticks);
  const sv=S.invitations_sent_24h.map(v=>v==null?null:Math.max(v,0.35));
  const scol=S.invitations_sent_24h.map(v=>v===0?MRC_BAD:MRC_BAR);
  const smax=mrNiceTop(Math.max(1,...S.invitations_sent_24h.filter(v=>v!=null)));
  mrChart(p,MR_M+CH+20,y,CH,80,dim,D,sv,0,smax,'Red = a day you sent nothing',scol,ticks);

  // detail
  y-=18; mrSect(p,y,'The detail'); y-=12;
  const pair=(f)=>[a.first[f]?mrFmtN(a.first[f].v):'—', a.last[f]?mrFmtN(a.last[f].v):'—'];
  const groups=[
    ['NETWORK',[
      ['Connections',...pair('connections'),mrDelta(a,'connections'),true],
      ['Invitations pending',...pair('invitations'),mrDelta(a,'invitations'),false],
      ['Invitations sent, 7-day',...pair('invitations_sent_7d'),mrDelta(a,'invitations_sent_7d'),true]]],
    ['VISIBILITY',[
      ['Profile views',...pair('profile_views'),mrDelta(a,'profile_views'),true],
      ['Search appearances',...pair('search_appearances'),mrDelta(a,'search_appearances'),true],
      ['All appearances',...pair('all_appearances'),mrDelta(a,'all_appearances'),true]]],
    ['OUTREACH',[
      ['Invitations sent','',mrFmtN(an.sent.total),null,true],
      ['Days you sent any','',`${an.sent.daysAny} of ${D.length}`,null,true],
      ['Busiest day','',an.sent.busiest?`${an.sent.busiest.v} on ${an.sent.busiest.d} ${win.mon3}`:'—',null,true]]],
  ];
  const gw=(MR_CW-2*16)/3;
  groups.forEach((g,gi)=>{
    const gx=MR_M+gi*(gw+16);
    p.text(gx,y-2,g[0],6.4,true,MRC_MUT);
    p.line(gx,y-6,gx+gw,MRC_RULE,0.5);
    g[1].forEach((it,ri)=>{
      const yy=y-19-ri*17;
      if(ri%2===0) p.rect(gx-4,yy-5,gw+8,17,MRC_TINT);
      p.text(gx,yy+5,it[0],7.4,false,MRC_MUT);
      if(it[1]){
        p.text(gx,yy-4,it[1],7.2,false,MRC_MUT);
        const w1=mrStrWidth(it[1],false,7.2);
        p.text(gx+w1+4,yy-4,'to',6.2,false,MRC_MUT);
        p.text(gx+w1+15,yy-4,it[2],7.6,true,MRC_INK);
      } else p.text(gx,yy-4,it[2],7.6,true,MRC_INK);
      if(it[3]!=null){ const [s,cc]=mrFmtD(it[3],0,it[4]); p.rtext(gx+gw,yy+5,s,7.6,true,cc); }
    });
  });
  y=y-19-3*17-4;

  // outreach read
  y-=14; mrSect(p,y,'What your outreach actually did'); y-=34;
  p.rect(MR_M,y,MR_CW,30,MRC_TINT); p.rect(MR_M,y,3,30,MRC_BAR);
  const pend0=a.first.invitations, pend1=a.last.invitations;
  p.text(MR_M+13,y+18,
    `${mrFmtN(an.sent.total)} invitations went out over the ${D.length} measured days. Your network grew by ${dConn!=null?Math.round(dConn):'—'}`
    + (pend0&&pend1?` while the pending queue ${pend1.v<pend0.v?'fell':'rose'} from ${mrFmtN(pend0.v)} to ${mrFmtN(pend1.v)}.`:'.'),
    8.0,false,MRC_INK);
  p.text(MR_M+13,y+7,
    (an.stretch?`The four days you pushed hardest (${an.stretch.a}–${an.stretch.b} ${win.mon3}) produced ${an.stretch.g} of the month's ${dConn!=null?Math.round(dConn):'—'} connections.`
               :'Not enough consecutive days were measured to read a best stretch.'),
    8.0,false,MRC_INK);

  // coverage
  y-=22;
  const COVW=MR_CW-152, cell=COVW/dim, have=new Set(D);
  for(let d=1;d<=dim;d++) p.rect(MR_M+(d-1)*cell,y,cell-1,9,have.has(d)?MRC_GOOD:MRC_RULE);
  p.text(MR_M+COVW+12,y+5.5,`${D.length} of ${dim} days tracked`,8.0,true,MRC_INK);
  p.text(MR_M+COVW+12,y-2.5,a.first.connections&&a.first.connections.d>1?`nothing captured before ${a.first.connections.d} ${win.mon3}`:'gaps are days the extension did not run',6.6,false,MRC_MUT);

  // recommendations
  y-=16; mrSect(p,y,'What to work on next month'); y-=24;
  for(const n of an.notes){
    p.rect(MR_M,y-2,3,20,MRC_RED);
    p.text(MR_M+12,y+10,n[0],8.4,true,MRC_INK);
    p.text(MR_M+12,y+1,n[1],7.2,false,MRC_MUT);
    y-=24;
  }
  mrFoot(p,'Linalysis  ·  linalysis.net  ·  measured from your own LinkedIn pages, daily',build);
  return p;
}

// ── ESTATE PAGE ──────────────────────────────────────────────────────
const MR_EST_METRICS=[
  ['SSI overall',        'ssi_overall',       'avg', 2, true],
  ['SSI Brand',          'ssi_brand',         'avg', 2, true],
  ['SSI Prospecting',    'ssi_prospecting',   'avg', 2, true],
  ['SSI Insights',       'ssi_insights',      'avg', 2, true],
  ['SSI Relationships',  'ssi_relationships', 'avg', 2, true],
  ['Connections',        'connections',       'sum', 0, true],
  ['Profile views',      'profile_views',     'sum', 0, true],
  ['Search appearances', 'search_appearances','sum', 0, true],
  ['All appearances',    'all_appearances',   'sum', 0, true],
  ['Invitations pending','invitations',       'sum', 0, false],
];
function mrAggregate(accounts, field, mode){
  let a=0,b=0,n=0;
  for(const q of accounts){ const x=q.first[field], y=q.last[field]; if(!x||!y) continue; a+=x.v; b+=y.v; n++; }
  if(!n) return null;
  return mode==='avg' ? {a:a/n,b:b/n,n} : {a,b,n};
}
function mrEstatePdf(accounts, win, build, generatedAt){
  const p=new MrPdf(MR_PW,MR_PH);
  let y=mrHead(p,MR_PH-MR_M,'Monthly activity report',win.label,generatedAt);
  const live=accounts.filter(a=>a.hasData), dark=accounts.filter(a=>!a.hasData);
  const stale=live.filter(a=>a.ext.stale);
  const bestCov=live.reduce((m,a)=>Math.max(m,a.days.length),0);
  const ssiUp=live.filter(a=>{const d=mrDelta(a,'ssi_overall'); return d!=null&&d>0;}).length;
  const aggs=MR_EST_METRICS.map(m=>[m, mrAggregate(live,m[1],m[2])]);
  let up=0,down=0,flat=0;
  for(const [m,g] of aggs){ if(!g||!m[4]) continue; const d=g.b-g.a; if(d>0.0001)up++; else if(d<-0.0001)down++; else flat++; }

  // verdict
  y-=56; p.rect(MR_M,y,MR_CW,46,MRC_TINT); p.rect(MR_M,y,3,46,MRC_RED);
  const headline = dark.length===0 ? 'Every account reported this month.'
      : (dark.length*2>=accounts.length ? 'Half the estate is still dark.' : `${dark.length} accounts are still dark.`);
  p.text(MR_M+14,y+28,headline,12,true,MRC_INK);
  const l2=[`${live.length} of ${accounts.length} accounts produced data in ${win.name}.`];
  if(live.length) l2.push(`${ssiUp} of them moved SSI up`);
  if(stale.length) l2.push(`and ${stale.length} ${stale.length===1?'is':'are'} running an outdated extension`);
  p.text(MR_M+14,y+13,l2.join(' ')+'.',8.6,false,MRC_INK);

  // tiles
  y-=24; mrSect(p,y,'The month at a glance'); y-=82;
  const tw=(MR_CW-3*9)/4;
  const tiles=[
    ['ACCOUNTS COLLECTING', `${live.length} / ${accounts.length}`,
      dark.length?`${dark.length} produced no rows at all`:'every account reported', dark.length?MRC_RED:MRC_GOOD],
    ['DAYS WITH DATA', `${bestCov} / ${win.dim}`, 'best account this month', MRC_INK],
    ['METRICS MOVED UP', `${up} up`, `${down} down · ${flat} flat`, up>=down?MRC_GOOD:MRC_BAD],
    ['EXTENSIONS CURRENT', `${live.length-stale.length} / ${live.length}`,
      stale.length?'some collecting accounts are behind':'all collecting accounts current',
      stale.length?MRC_RED:MRC_GOOD],
  ];
  tiles.forEach((t,i)=>{
    const x=MR_M+i*(tw+9);
    p.rect(x,y,tw,74,MRC_WHITE);
    p.line(x,y,x+tw,MRC_RULE,0.5); p.line(x,y+74,x+tw,MRC_RULE,0.5);
    p.rect(x,y,0.5,74,MRC_RULE); p.rect(x+tw-0.5,y,0.5,74,MRC_RULE);
    p.rect(x,y+71,tw,3,t[3]);
    p.text(x+11,y+53,t[0],6.6,true,MRC_MUT);
    p.text(x+11,y+27,t[1],23,true,t[3]);
    p.text(x+11,y+12,t[2],6.8,false,MRC_MUT);
  });

  // accounts table
  y-=26; mrSect(p,y,'Accounts'); y-=18;
  const X_COV=MR_M+146, COVW=124, cell=COVW/win.dim;
  const X_DAYS=MR_M+302, X_SSI=MR_M+312, X_DSSI=MR_M+402, X_CONN=MR_M+452, X_ST=MR_M+462;
  p.rect(MR_M,y-5,MR_CW,16,MRC_TINT);
  p.text(MR_M,y+1,'ACCOUNT',6.8,true,MRC_MUT);
  p.text(X_COV,y+1,`COLLECTION COVERAGE, DAY 1-${win.dim}`,6.8,true,MRC_MUT);
  p.rtext(X_DAYS,y+1,'DAYS',6.8,true,MRC_MUT);
  p.text(X_SSI,y+1,'SSI  START / END',6.8,true,MRC_MUT);
  p.rtext(X_CONN,y+1,'CONNECTIONS',6.8,true,MRC_MUT);
  p.text(X_ST,y+1,'STATUS',6.8,true,MRC_MUT);
  y-=9;
  const shown=accounts.slice().sort((a,b)=>b.days.length-a.days.length).slice(0,10);
  for(const a of shown){
    y-=26;
    p.line(MR_M,y+23,MR_PW-MR_M,MRC_RULE,0.5);
    const nc=a.hasData?MRC_INK:MRC_MUT;
    p.text(MR_M,y+12,a.name,8.6,true,nc);
    p.text(MR_M,y+3,a.email,6.4,false,MRC_MUT);
    const have=new Set(a.days);
    for(let d=1;d<=win.dim;d++) p.rect(X_COV+(d-1)*cell,y+8,cell-0.9,7,have.has(d)?MRC_GOOD:MRC_RULE);
    p.rtext(X_DAYS,y+8,`${a.days.length}/${win.dim}`,8.4,false,nc);
    const s0=a.first.ssi_overall, s1=a.last.ssi_overall;
    p.text(X_SSI,y+8,(s0&&s1)?`${s0.v.toFixed(2)} / ${s1.v.toFixed(2)}`:'—',8.4,false,nc);
    const [dsS,dsC]=mrFmtD(mrDelta(a,'ssi_overall'),2,true); p.rtext(X_DSSI,y+8,dsS,8,true,dsC);
    const [dcS,dcC]=mrFmtD(mrDelta(a,'connections'),0,true); p.rtext(X_CONN,y+8,dcS,8.4,true,dcC);
    const st = !a.hasData ? 'No data' : (a.days.length===win.dim ? 'Complete' : 'Partial');
    p.text(X_ST,y+12,st,7.8,true, st==='No data'?MRC_MUT:(st==='Complete'?MRC_GOOD:MRC_WARN));
    p.text(X_ST,y+3, !a.hasData ? (a.ext.version?'never landed a row':'never paired')
                                : (a.ext.stale?'extension outdated':'extension current'), 6.4,false,MRC_MUT);
  }
  if(accounts.length>shown.length){ y-=12; p.text(MR_M,y+3,`+ ${accounts.length-shown.length} more accounts`,7,false,MRC_MUT); }
  p.line(MR_M,y-1,MR_PW-MR_M,MRC_RULE,0.8);

  // metric movement
  y-=24; mrSect(p,y,`Metric movement · ${live.length} collecting account${live.length===1?'':'s'}`); y-=16;
  const HALF=5, colw=(MR_CW-18)/2;
  aggs.forEach(([m,g],i)=>{
    const ci=i<HALF?0:1, ri=i<HALF?i:i-HALF;
    const x0=MR_M+ci*(colw+18), yy=y-15-ri*16;
    if(ri===0){
      p.text(x0,y-2,'METRIC',6.4,true,MRC_MUT);
      p.rtext(x0+colw-116,y-2,`${1} ${win.mon3.toUpperCase()}`,6.4,true,MRC_MUT);
      p.rtext(x0+colw-58,y-2,`${win.dim} ${win.mon3.toUpperCase()}`,6.4,true,MRC_MUT);
      p.rtext(x0+colw,y-2,'CHANGE',6.4,true,MRC_MUT);
      p.line(x0,y-6,x0+colw,MRC_RULE,0.5);
    }
    if(ri%2===0) p.rect(x0-4,yy-4.5,colw+8,15,MRC_TINT);
    p.text(x0,yy,m[0]+(m[2]==='avg'?' (avg)':''),8,false,MRC_INK);
    p.rtext(x0+colw-116,yy,g?mrFmtN(g.a,m[3]):'—',8,false,MRC_MUT);
    p.rtext(x0+colw-58,yy,g?mrFmtN(g.b,m[3]):'—',8,true,MRC_INK);
    const [s,cc]=mrFmtD(g?g.b-g.a:null,m[3],m[4]);
    p.rtext(x0+colw,yy,s,8,true,cc);
  });
  y=y-15-HALF*16-8;

  // needs attention
  y-=20; mrSect(p,y,'Needs attention'); y-=30;
  const notes=[];
  if(dark.length) notes.push([`${dark.length} account${dark.length===1?'':'s'} produced no data at all.`,
    dark.map(a=>a.name).slice(0,4).join(', ')+(dark.length>4?` and ${dark.length-4} more`:'')+' — provisioned but never landed a row.']);
  if(stale.length) notes.push([`${stale.length} collecting account${stale.length===1?' is':'s are'} on an outdated extension.`,
    'Selector fixes shipped since their version are not being applied to their data.']);
  if(bestCov<win.dim) notes.push(['Collection is intermittent, not continuous.',
    `The best account covered ${bestCov} of ${win.dim} days. Every gap is a hole in the numbers above.`]);
  if(!notes.length) notes.push(['Nothing needs attention.','Every account collected every day and every extension is current.']);
  for(const n of notes.slice(0,3)){
    p.rect(MR_M,y-2,3,22,MRC_RED);
    p.text(MR_M+12,y+11,n[0],8.8,true,MRC_INK);
    p.text(MR_M+12,y+2,n[1],7.6,false,MRC_MUT);
    y-=30;
  }
  mrFoot(p,'Linalysis  ·  linalysis.net  ·  source: KV daily stats series, api.linalysis.net',build);
  return p;
}

function mrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mrRow(label, val){
  return `<tr><td style="padding:4px 12px 4px 0;color:#6B7280;font:13px -apple-system,Segoe UI,Arial">${mrEsc(label)}</td>`
       + `<td style="padding:4px 0;color:#14161A;font:600 13px -apple-system,Segoe UI,Arial">${mrEsc(val)}</td></tr>`;
}
function mrShell(title, lead, rows, note){
  return `<div style="font:14px/1.5 -apple-system,Segoe UI,Arial;color:#14161A;max-width:640px">
<div style="border-left:4px solid #FE1B04;padding:2px 0 2px 14px;margin-bottom:18px">
<div style="font:700 18px -apple-system,Segoe UI,Arial">${mrEsc(title)}</div>
<div style="color:#6B7280;font-size:13px;margin-top:3px">${mrEsc(lead)}</div></div>
<table cellpadding="0" cellspacing="0" style="margin-bottom:18px">${rows.map(r=>mrRow(r[0],r[1])).join('')}</table>
<div style="color:#6B7280;font-size:12px;border-top:1px solid #E3E6EA;padding-top:10px">${mrEsc(note)}</div></div>`;
}

async function mrSendReport(env, to, subject, html, filename, b64, dry){
  if(dry) return {dry:true, to, subject, filename, kb:Math.round(b64.length*0.75/1024)};
  if(!env.RESEND_API_KEY) return {sent:false, to, subject, reason:'RESEND_API_KEY not configured on the Worker'};
  try{
    const resp=await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.ALERTS_FROM||REPORT_FROM_DEFAULT, to, subject, html,
        attachments:[{filename, content:b64}]})});
    const body=await resp.text();
    return {sent:resp.ok, status:resp.status, to, subject, filename, body:body.slice(0,300), at:new Date().toISOString()};
  }catch(e){ return {sent:false,to,subject,reason:String(e&&e.message||e).slice(0,300)}; }
}

async function runMonthlyReports(env, opts){
  opts = opts||{};
  const now = new Date();
  const win = mrMonthWindow(now, opts.month);
  const build = 'build ' + now.toISOString().slice(0,10) + '.' +
    String(now.getUTCHours()).padStart(2,'0') + String(now.getUTCMinutes()).padStart(2,'0') + '-monthly';
  const generatedAt = 'Generated ' + now.toISOString().slice(0,16).replace('T',' ') + ' UTC';
  const to = reportRecipients(env);

  const userKeys = await listAll(env.KV, 'user:');
  const extLatest = await latestExtVersion(env);
  const accounts = [];
  for (const k of userKeys) {
    try { accounts.push(await mrLoadAccount(env, k.name.slice('user:'.length), win, extLatest)); }
    catch(e){ console.error('monthly load failed', k.name, e); }
  }
  const live = accounts.filter(a=>a.hasData), dark = accounts.filter(a=>!a.hasData);
  const out = { month: win.key, build, accounts: accounts.length, collecting: live.length, deliveries: [] };

  // ── estate report ──────────────────────────────────────────────────
  const estateKey = `report:estate:monthly:${win.key}`;
  if (opts.force || !(await env.KV.get(estateKey))) {
    const pdf = mrEstatePdf(accounts, win, build, generatedAt);
    const ssiUp = live.filter(a=>{const d=mrDelta(a,'ssi_overall'); return d!=null&&d>0;}).length;
    const stale = live.filter(a=>a.ext.stale).length;
    const subject = `[Linalysis] ${win.name} ${win.y} — ${live.length}/${accounts.length} accounts collected`
      + (dark.length?` · ${dark.length} dark`:'') + (stale?` · ${stale} on an old extension`:'');
    const html = mrShell(`Linalysis — ${win.name} ${win.y}`,
      `${live.length} of ${accounts.length} accounts produced data. The one-page report is attached.`,
      [['Accounts collecting', `${live.length} of ${accounts.length}`],
       ['Accounts with no data', String(dark.length)],
       ['Moved SSI up', `${ssiUp} of ${live.length}`],
       ['On an outdated extension', `${stale} of ${live.length}`]],
      'Generated by Linalysis on the first of the month, covering the previous complete month.');
    const d = await mrSendReport(env, to, subject, html,
      `linalysis-${win.key}-estate.pdf`, pdf.base64(), opts.dry);
    out.deliveries.push(d);
    if (d.sent) await env.KV.put(estateKey, JSON.stringify({report_type:'monthly_estate', month:win.key, sent_at:new Date().toISOString(), to}));
  } else out.deliveries.push({skipped:'estate already sent for '+win.key});

  // ── one report per user ────────────────────────────────────────────
  for (const a of accounts) {
    const key = `report:${a.email}:monthly:${win.key}`;
    if (!opts.force && await env.KV.get(key)) { out.deliveries.push({skipped:'already sent', email:a.email}); continue; }
    try {
      const pdf = mrUserPdf(a, win, build);
      const dS = mrDelta(a,'ssi_overall'), dC = mrDelta(a,'connections');
      const subject = a.hasData
        ? `[Linalysis] ${a.name} — your ${win.name} on LinkedIn`
          + (dS!=null?` · SSI ${dS>=0?'+':'−'}${Math.abs(dS).toFixed(2)}`:'')
          + (dC!=null?` · ${dC>=0?'+':'−'}${Math.abs(Math.round(dC))} connections`:'')
        : `[Linalysis] ${a.name} — no data collected in ${win.name}`;
      const rows = a.hasData
        ? [['SSI overall', a.last.ssi_overall?a.last.ssi_overall.v.toFixed(2):'—'],
           ['SSI change', dS!=null?`${dS>=0?'+':'−'}${Math.abs(dS).toFixed(2)}`:'—'],
           ['New connections', dC!=null?`${dC>=0?'+':'−'}${Math.abs(Math.round(dC))}`:'—'],
           ['Days tracked', `${a.days.length} of ${win.dim}`]]
        : [['Days tracked', `0 of ${win.dim}`],
           ['Extension', a.ext.version?`v${a.ext.version}, never landed a row`:'never paired']];
      const html = mrShell(`${a.name} — ${win.name} ${win.y}`,
        a.hasData ? 'Your one-page LinkedIn month is attached.'
                  : 'No data was collected for this account this month.',
        rows, `Account ${a.email}. Generated by Linalysis on the first of the month.`);
      const d = await mrSendReport(env, to, subject, html,
        `linalysis-${win.key}-${a.email.replace(/[^a-z0-9]+/gi,'-')}.pdf`, pdf.base64(), opts.dry);
      d.email = a.email;
      out.deliveries.push(d);
      if (d.sent) await env.KV.put(key, JSON.stringify({report_type:'monthly_user', month:win.key, sent_at:new Date().toISOString(), to}));
    } catch(e){ out.deliveries.push({email:a.email, sent:false, reason:String(e&&e.message||e).slice(0,300)}); }
  }
  if(!opts.dry) await env.KV.put(`report:monthly_run:${win.key}`, JSON.stringify(out), {expirationTtl: 400*86400});
  return out;
}

// On-demand trigger. Accepts an admin session OR the REPORT_RUN_KEY secret,
// so the monthly run can be fired when no admin browser session is available.
//   POST /api/admin/reports/monthly/run-now?month=YYYY-MM&force=1&dry=1
async function mrRunNow(req, env){
  const url = new URL(req.url);
  const key = req.headers.get('X-Report-Key') || url.searchParams.get('key');
  let ok = false;
  if (env.REPORT_RUN_KEY && key && key === env.REPORT_RUN_KEY) ok = true;
  else { try { await requireAdmin(req, env); ok = true; } catch (e) { ok = false; } }
  if (!ok) return err('forbidden', 'Admin session or X-Report-Key required', 403);
  const out = await runMonthlyReports(env, {
    month: url.searchParams.get('month') || null,
    force: url.searchParams.get('force') === '1',
    dry:   url.searchParams.get('dry') === '1',
  });
  return json(out);
}
