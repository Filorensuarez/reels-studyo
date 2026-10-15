(function(){
'use strict';
const $=id=>document.getElementById(id), api=window.ReelsQuickAPI;
if(!api)return;
let rows=[],nextId=1,editEpoch=0,autoRunning=false,transcriber=null,stopRequested=false,lastDownload=null;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const round=x=>Math.round(x*100)/100;
const S=id=>$(id);
const duration=()=>api.getTotal();
function status(msg,type=''){const e=S('subtitleStatus');e.textContent=msg;e.className='status '+type;}
function ensureValid(item){
 const dur=duration();
 item.start=round(clamp(Number(item.start)||0,0,Math.max(.05,dur-.05)));
 item.end=round(clamp(Number(item.end)||item.start+.2,item.start+.05,dur));
 item.text=String(item.text||'').trim().slice(0,300);
}
function addRow(start,end,text,rerender=true){
 const dur=duration();if(dur<.15)return null;
 const it={id:nextId++,start:round(clamp(start,0,dur-.1)),end:round(clamp(end,.1,dur)),text:String(text||'').slice(0,300)};
 if(it.end<=it.start+.05)it.end=Math.min(dur,it.start+.8);
 ensureValid(it);rows.push(it);
 if(rerender)renderRows();
 return it;
}
function timeText(t){let n=Math.round(Math.max(0,t)*1000),m=n%1000;n=Math.floor(n/1000);const s=n%60;const min=Math.floor(n/60)%60;const h=Math.floor(n/3600);return [h,min,s].map(v=>String(v).padStart(2,'0')).join(':')+','+String(m).padStart(3,'0');}
function timeParse(t){
 const m=String(t).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
 if(!m)return NaN;
 return (Number(m[1])||0)*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/Math.pow(10,m[4].length);
}
function buildSrt(){
 return rows.filter(r=>r.text.trim()).sort((a,b)=>a.start-b.start).map((r,i)=>
  String(i+1)+'\n'+timeText(r.start)+' --> '+timeText(r.end)+'\n'+r.text.trim().replace(/\n/g,'\n')+'\n'
 ).join('\n');
}
function downloadSrt(){
 const data=buildSrt();if(!data){status('SRT indirmek için en az bir altyazı yaz.','error');return;}
 if(lastDownload)URL.revokeObjectURL(lastDownload);
 lastDownload=URL.createObjectURL(new Blob(['\ufeff',data],{type:'text/plain;charset=utf-8'}));
 const a=document.createElement('a');a.href=lastDownload;a.download='reels-turkce-altyazilar.srt';document.body.appendChild(a);a.click();a.remove();
 status('Altyazı dosyası SRT olarak indirildi.','ok');
}
function parseSrt(raw){
 raw=raw.replace(/^\ufeff/,'').replace(/\r/g,'');
 let blocks=raw.trim().split(/\n\s*\n/),parsed=[];
 for(const block of blocks){
  const lines=block.split('\n'),at=lines.findIndex(x=>x.includes('-->'));
  if(at<0)continue;
  const mm=lines[at].match(/(\d{1,3}:\d\d:\d\d[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d\d:\d\d[,.]\d{1,3})/);
  if(!mm)continue;const from=timeParse(mm[1]),to=timeParse(mm[2]),text=lines.slice(at+1).join(' ').trim();
  if(Number.isFinite(from)&&Number.isFinite(to)&&to>from&&text)parsed.push({start:from,end:to,text});
 }
 return parsed;
}
function renderRows(){
 rows.sort((a,b)=>a.start-b.start);
 const holder=S('subtitleEntries');holder.replaceChildren();
 if(!rows.length){const p=document.createElement('p');p.className='note';p.textContent='Henüz altyazı yok. Videoyu istediğin saniyede durdurup “Bulunduğum ana altyazı” düğmesine basabilirsin.';holder.appendChild(p);}
 rows.forEach((r,i)=>{
  const card=document.createElement('div');card.className='subtitleItem';card.dataset.id=String(r.id);
  const header=document.createElement('div');header.className='subtitleItemHeader';
  const label=document.createElement('span');label.textContent='Altyazı '+(i+1);
  const actions=document.createElement('div');actions.className='subtitleItemActions';
  const jump=document.createElement('button');jump.type='button';jump.className='outline';jump.textContent='▶ Göster';jump.dataset.act='jump';
  const erase=document.createElement('button');erase.type='button';erase.className='outline danger';erase.textContent='Sil';erase.dataset.act='delete';
  actions.append(jump,erase);header.append(label,actions);
  const grid=document.createElement('div');grid.className='subtitleTimeGrid';
  for(const key of ['start','end']){
   const wrap=document.createElement('div'),lab=document.createElement('label'),input=document.createElement('input');
   lab.textContent=key==='start'?'Başlangıç (sn)':'Bitiş (sn)';
   input.type='number';input.min='0';input.max=String(Math.max(0,duration()));input.step='.1';input.inputMode='decimal';input.value=String(r[key]);input.dataset.field=key;
   wrap.append(lab,input);grid.append(wrap);
  }
  const text=document.createElement('textarea');text.rows=2;text.maxLength=300;text.placeholder='Konuşmada söylenen metin';text.value=r.text;text.dataset.field='text';
  card.append(header,grid,text);holder.append(card);
 });
 api.repaint();
}
function invalidateOnEdit(){
 editEpoch++;
 if(rows.length){rows=[];renderRows();status('Klipler değiştiği için altyazı zamanları sıfırlandı. Montaj tamamlandıktan sonra altyazıları yeniden oluştur.','error');}
}
function captionAt(time){return rows.find(x=>time>=x.start&&time<x.end&&x.text.trim())||null;}
function wrapText(ctx,txt,maxWidth,maxLines=2){
 const words=txt.replace(/\s+/g,' ').trim().split(' '),lines=[];let line='';
 for(const word of words){const candidate=line?line+' '+word:word;
  if(ctx.measureText(candidate).width>maxWidth&&line){lines.push(line);line=word;}else line=candidate;
 }
 if(line)lines.push(line);
 if(lines.length>maxLines){const clipped=lines.slice(0,maxLines);let last=clipped[maxLines-1];while(last.length>3&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);clipped[maxLines-1]=last+'…';return clipped;}
 return lines;
}
function draw(ctx,canvas,time){
 const c=captionAt(time);if(!c)return;
 const w=canvas.width,h=canvas.height,pad=w*.035,fs=Math.max(19,Math.round(w*.056)),lineH=fs*1.24;
 ctx.save();ctx.font='800 '+fs+'px Arial, sans-serif';
 const lines=wrapText(ctx,c.text,w*.88,2),max=lines.reduce((v,line)=>Math.max(v,ctx.measureText(line).width),0);
 const boxW=Math.min(w*.96,max+pad*2),boxH=lines.length*lineH+pad*1.5;
 const x=(w-boxW)/2,y=h*.89-boxH/2;
 ctx.fillStyle='rgba(0,0,0,.78)';ctx.beginPath();ctx.roundRect(x,y,boxW,boxH,Math.max(8,w*.024));ctx.fill();
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=S('subtitleColor').value==='yellow'?'#ffeb56':'#ffffff';
 ctx.shadowColor='rgba(0,0,0,.9)';ctx.shadowBlur=3;ctx.lineWidth=1;
 lines.forEach((line,i)=>ctx.fillText(line,w/2,y+pad*.65+lineH*(i+.5),w*.88));
 ctx.restore();
}
S('subtitleAdd').addEventListener('click',()=>{
 if(api.isBusy()){status('Önce videoyu duraklat.','error');return;}
 if(duration()<.2){status('Önce bir video ekle.','error');return;}
 const st=api.getTime();addRow(st,Math.min(duration(),st+2.8),'');status('Yeni altyazı eklendi. Metni yazıp başlangıç ve bitiş saniyelerini ayarlayabilirsin.','ok');
 const els=S('subtitleEntries').querySelectorAll('textarea');if(els.length)els[els.length-1].focus();
});
S('subtitleEntries').addEventListener('input',e=>{
 const field=e.target.dataset.field;if(!field)return;
 const it=rows.find(r=>r.id===Number(e.target.closest('[data-id]')?.dataset.id));if(!it)return;
 if(field==='text'){it.text=e.target.value.slice(0,300);}else{
  const v=Number(e.target.value);if(Number.isFinite(v))it[field]=v;
 }
 api.repaint();
});
S('subtitleEntries').addEventListener('change',e=>{
 if(!['start','end'].includes(e.target.dataset.field))return;
 const it=rows.find(r=>r.id===Number(e.target.closest('[data-id]')?.dataset.id));if(!it)return;
 ensureValid(it);renderRows();
});
S('subtitleEntries').addEventListener('click',e=>{
 const button=e.target.closest('button[data-act]');if(!button)return;
 const it=rows.find(r=>r.id===Number(button.closest('[data-id]')?.dataset.id));if(!it)return;
 if(button.dataset.act==='delete'){rows=rows.filter(x=>x.id!==it.id);renderRows();status('Altyazı çıkarıldı.');}
 if(button.dataset.act==='jump'){api.pause();api.seek(it.start);}
});
S('subtitleColor').addEventListener('change',()=>api.repaint());
S('subtitleExport').addEventListener('click',downloadSrt);
S('subtitleImport').addEventListener('click',()=>S('subtitleFile').click());
S('subtitleFile').addEventListener('change',async()=>{
 const file=S('subtitleFile').files[0];S('subtitleFile').value='';if(!file)return;
 if(duration()<.2){status('Önce video ekle.','error');return;}
 try{
  const raw=await file.text();const captions=parseSrt(raw);
  if(!captions.length)throw Error('SRT dosyasında zamanlı altyazı bulunamadı.');
  rows=[];for(const cap of captions.slice(0,250)){if(cap.start<duration()-.05)addRow(cap.start,Math.min(cap.end,duration()),cap.text,false);}
  renderRows();status(rows.length+' altyazı SRT dosyasından yüklendi.','ok');
 }catch(e){status('SRT okunamadı: '+e.message,'error');}
});
async function resampleSection(decoded,from,to){
 const rate=16000,seconds=to-from;
 const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(seconds*rate)),rate);
 const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);
 source.start(0,from,seconds);const rendered=await offline.startRendering();
 return rendered.getChannelData(0).slice();
}
function splitText(text,start,end){
 const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return [];
 const words=clean.split(' '),parts=[],maxChar=54;
 let current='';for(const w of words){if(current&&(current+' '+w).length>maxChar){parts.push(current);current=w;}else current=current?current+' '+w:w;}if(current)parts.push(current);
 const weights=parts.map(x=>Math.max(1,x.length)),sum=weights.reduce((a,b)=>a+b,0),length=Math.max(.6,end-start);
 let elapsed=0;
 return parts.map((text,i)=>{let from=start+elapsed/sum*length;elapsed+=weights[i];let to=i===parts.length-1?end:start+elapsed/sum*length;return {start:from,end:to,text};});
}
function normalizedResult(output,offset,length){
 let chunks=Array.isArray(output?.chunks)?output.chunks:[],found=[];
 for(const ch of chunks){
  const txt=String(ch.text||'').trim();if(!txt)continue;
  let st=Number(ch.timestamp?.[0]),en=Number(ch.timestamp?.[1]);
  if(!Number.isFinite(st))st=0;if(!Number.isFinite(en)||en<=st)en=length;
  st=clamp(st,0,length);en=clamp(en,st+.1,length);
  found.push(...splitText(txt,offset+st,offset+en));
 }
 if(!found.length&&output?.text)found=splitText(output.text,offset,offset+length);
 return found;
}
function feedback(text){status(text);}
async function autoGenerate(){
 if(autoRunning){stopRequested=true;status('İşlem durdurulacak; devam eden model hesaplamasının bitmesi gerekebilir.');return;}
 if(api.isBusy()){status('Önce videoyu duraklat.','error');return;}
 const clips=api.getClips(),total=duration();
 if(!clips.length){status('Önce video ekle.','error');return;}
 if(total>90){status('Telefonu yormamak için otomatik altyazı en fazla 90 saniyelik montajda kullanılabilir. Videoyu kısalt veya SRT kullan.','error');return;}
 if(!window.AudioContext||!window.OfflineAudioContext){status('Bu tarayıcı ses çözümlemeyi desteklemiyor. Elle altyazı ekleyebilirsin.','error');return;}
 if(!navigator.onLine){status('İlk model indirmesi için internet gerekli. Elle altyazı eklemeyi kullanabilirsin.','error');return;}
 autoRunning=true;stopRequested=false;
 const button=S('autoSubtitles');button.textContent='İşlemi durdur';const epoch=editEpoch;
 let audioCtx=null;
 try{
  feedback('Türkçe konuşma modeli yükleniyor. İlk kullanımda onlarca MB indirilebilir; telefonun belleğine dikkat et.');
  if(!transcriber){
   const lib=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
   const model=await lib.pipeline('automatic-speech-recognition','onnx-community/whisper-tiny',{
    device:'wasm',dtype:'q8',
    progress_callback:p=>{
     if(p?.status==='progress'&&p.progress!=null)feedback('Model indiriliyor: %'+Math.round(p.progress));
    }
   });
   transcriber=model;
  }
  if(stopRequested||epoch!==editEpoch)throw Error('İşlem durduruldu veya montaj değişti.');
  audioCtx=new AudioContext();const cache=new Map(),output=[];
  for(let i=0;i<clips.length;i++){
   const c=clips[i];if(stopRequested||epoch!==editEpoch)throw Error('İşlem durduruldu veya montaj değişti.');
   let decoded=cache.get(c.asset.url);
   if(!decoded){
    feedback((i+1)+'. klibin sesi hazırlanıyor...');
    const response=await fetch(c.asset.url);
    if(!response.ok)throw Error('Video dosyası açılamadı.');
    const file=await response.arrayBuffer();
    if(file.byteLength>130*1024*1024)throw Error('Dosya 130 MB sınırını aşıyor. Daha kısa video kullan.');
    try{decoded=await audioCtx.decodeAudioData(file);}catch(e){throw Error('Bu videonun sesi tarayıcıda çözülemedi. Başka MP4 ile dene veya altyazıyı elle gir.');}
    cache.set(c.asset.url,decoded);
   }
   const piece=c.to-c.from;
   for(let k=0;k<piece;k+=20){
    if(stopRequested||epoch!==editEpoch)throw Error('İşlem durduruldu veya montaj değişti.');
    const from=clamp(c.from+k,0,decoded.duration-.12),to=clamp(c.from+Math.min(piece,k+20),from+.1,decoded.duration);
    if(to-from<.2)continue;
    feedback((i+1)+'. video, '+Math.floor(k)+'–'+Math.floor(Math.min(piece,k+20))+' saniyeleri dinleniyor...');
    const signal=await resampleSection(decoded,from,to);
    const result=await transcriber(signal,{language:'turkish',task:'transcribe',return_timestamps:true});
    output.push(...normalizedResult(result,c.timelineStart+k,to-from));
  }
  }
  if(stopRequested||epoch!==editEpoch)throw Error('İşlem durduruldu veya montaj değişti.');
  if(!output.length)throw Error('Anlaşılır konuşma bulunamadı. Bu video sessiz olabilir.');
  rows=[];for(const r of output.slice(0,230))addRow(r.start,r.end,r.text,false);
  renderRows();status(rows.length+' altyazı oluşturuldu. Türkçe yazım ve zamanlamayı kontrol ederek MP4 oluştur.','ok');window.dispatchEvent(new CustomEvent('reels:transcript-ready',{detail:{count:rows.length}}));
 }catch(e){status('Otomatik altyazı tamamlanamadı: '+e.message+' Elle altyazı ekleme ve SRT yükleme kullanılabilir.','error');window.dispatchEvent(new CustomEvent('reels:transcript-error',{detail:{message:e.message}}));}
 finally{try{await audioCtx?.close()}catch(e){} autoRunning=false;stopRequested=false;button.textContent='Türkçe altyazıyı otomatik oluştur (deneysel)';}
}
S('autoSubtitles').addEventListener('click',autoGenerate);
window.ReelsSubtitles={draw,invalidateOnEdit,captionAt,getAll:()=>rows.map(c=>({...c}))};
renderRows();
})();