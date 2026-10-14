(function(){
'use strict';
const $=id=>document.getElementById(id),api=window.ReelsQuickAPI;
if(!api){console.error('Basit düzenleyici başlatılamadı.');return;}
let analyzing=false,cancelAnalysis=false;
const fmt=t=>{t=Math.floor(Math.max(0,t));return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0');};
const btns={split:$('quickSplit'),insert:$('quickInsert'),start:$('quickTrimStart'),end:$('quickTrimEnd'),remove:$('quickDelete'),undo:$('quickUndo')};
function setResultsStatus(msg){$('bestStatus').textContent=msg;}
function action(type){
 if(analyzing){api.status('Öne çıkan anlar taranırken bekle veya taramayı iptal et.');return;}
 api.edit(type);
}
btns.split.addEventListener('click',()=>action('split'));
btns.start.addEventListener('click',()=>action('start'));
btns.end.addEventListener('click',()=>action('end'));
btns.remove.addEventListener('click',()=>action('delete'));
btns.undo.addEventListener('click',()=>{if(analyzing)return;api.undo();});
btns.insert.addEventListener('click',()=>{
 if(analyzing){api.status('Tarama bitince video ekleyebilirsin.');return;}
 api.pause();$('quickInsertFiles').click();
});
$('quickInsertFiles').addEventListener('change',async()=>{
 if(analyzing)return;
 try{await api.insert($('quickInsertFiles'));$('bestResults').replaceChildren();setResultsStatus('Video düzenlendi. Önerileri yenilemek için tekrar tara.');}
 catch(e){api.status('Video ekleme hatası: '+e.message,'error');}
});
$('editCanvas').addEventListener('click',()=>{const play=$('previewPlay');play.click();});
const sampleCanvas=document.createElement('canvas');
sampleCanvas.width=48;sampleCanvas.height=72;
const sampleCtx=sampleCanvas.getContext('2d',{willReadFrequently:true});
function waitFor(v,name,max=18000){
 return new Promise((resolve,reject)=>{
  let ended=false;
  const timer=setTimeout(()=>done(Error('Video kareleri zamanında okunamadı.')),max);
  const ok=()=>done(),bad=()=>done(Error('Video görüntüsü okunamadı.'));
  function done(err){if(ended)return;ended=true;clearTimeout(timer);v.removeEventListener(name,ok);v.removeEventListener('error',bad);if(err)reject(err);else resolve();}
  v.addEventListener(name,ok,{once:true});v.addEventListener('error',bad,{once:true});
 });
}
async function loadVideo(v,url){
 v.pause();
 v.src=url;v.load();
 if(v.readyState<1)await waitFor(v,'loadedmetadata');
}
async function seekFrame(v,t){
 if(cancelAnalysis)throw Error('Tarama iptal edildi.');
 if(Math.abs(v.currentTime-t)>.045){v.currentTime=t;await waitFor(v,'seeked');}
 if(v.readyState<2)await waitFor(v,'loadeddata');
}
function features(v,prev){
 sampleCtx.fillStyle='#101010';sampleCtx.fillRect(0,0,48,72);
 const scale=Math.max(48/v.videoWidth,72/v.videoHeight),w=v.videoWidth*scale,h=v.videoHeight*scale;
 sampleCtx.drawImage(v,(48-w)/2,(72-h)/2,w,h);
 const p=sampleCtx.getImageData(0,0,48,72).data,blocks=[],cols=8,rows=12,sw=6,sh=6;
 let lumTotal=0,detail=0,color=0;
 for(let row=0;row<rows;row++){
  for(let col=0;col<cols;col++){
   let acc=0,sat=0;const bx=col*sw,by=row*sh;
   for(let y=by;y<by+sh;y+=2)for(let x=bx;x<bx+sw;x+=2){
    const i=(y*48+x)*4,r=p[i],g=p[i+1],b=p[i+2];
    acc+=r*.2126+g*.7152+b*.0722;sat+=Math.max(r,g,b)-Math.min(r,g,b);
   }
   blocks.push(acc/9);lumTotal+=acc/9;color+=sat/9;
  }
 }
 const mean=lumTotal/blocks.length;
 for(let i=1;i<blocks.length;i++)detail+=Math.abs(blocks[i]-blocks[i-1]);
 detail/=blocks.length*255;
 let change=0;if(prev){for(let i=0;i<blocks.length;i++)change+=Math.abs(blocks[i]-prev.blocks[i]);change/=blocks.length*255;}
 const balanced=mean>=40&&mean<=220?1:.35,clear=detail*.9+color/blocks.length/255*.08;
 const score=(.19+change*3.8+clear*.65)*balanced;
 return {blocks,score,change,detail,brightness:mean};
}
function bestWindows(points,clip){
 const dur=clip.to-clip.from;
 const windowSize=Math.min(10,dur);
 if(windowSize<2||!points.length)return [];
 const attempts=[];
 const step=Math.max(1,windowSize/4);
 const starts=[clip.from,clip.to-windowSize];
 for(let t=clip.from;t<=clip.to-windowSize+.01;t+=step)starts.push(t);
 for(const st of starts){
  const start=Math.max(clip.from,Math.min(clip.to-windowSize,st)),end=start+windowSize;
  const selected=points.filter(p=>p.time>=start-.25&&p.time<=end+.25);
  if(!selected.length)continue;
  const score=selected.reduce((sum,p)=>sum+p.score,0)/selected.length;
  const motion=selected.reduce((sum,p)=>sum+p.change,0)/selected.length;
  const detail=selected.reduce((sum,p)=>sum+p.detail,0)/selected.length;
  attempts.push({clipId:clip.id,start,end,score:score+.15*motion+.1*detail,global:clip.timelineStart+start-clip.from,duration:windowSize,asset:clip.asset.name});
 }
 return attempts;
}
async function analyze(){
 if(analyzing){cancelAnalysis=true;setResultsStatus('Tarama durduruluyor...');return;}
 const clips=api.getClips();
 if(!clips.length){setResultsStatus('Önce telefondan video yükle.');return;}
 if(!api.pause())return;
 analyzing=true;cancelAnalysis=false;
 const button=$('findBest');button.textContent='Taramayı iptal et';$('bestResults').replaceChildren();
 const total=api.getTotal(),sampleStep=Math.max(1.4,total/105);
 const frameVideo=document.createElement('video');
 frameVideo.muted=true;frameVideo.playsInline=true;frameVideo.preload='auto';
 frameVideo.style.cssText='position:fixed;left:-8px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
 document.body.appendChild(frameVideo);
 let sampled=0,all=[];
 try{
  setResultsStatus('Görüntüler inceleniyor. Telefonda bu işlem biraz sürebilir...');
  for(let index=0;index<clips.length;index++){
   if(cancelAnalysis)throw Error('Tarama iptal edildi.');
   const clip=clips[index];const duration=clip.to-clip.from;
   if(duration<2)continue;
   await loadVideo(frameVideo,clip.asset.url);
   let previous=null;const points=[];
   const count=Math.max(2,Math.min(80,Math.ceil(duration/sampleStep)+1));
   for(let i=0;i<count;i++){
    if(cancelAnalysis)throw Error('Tarama iptal edildi.');
    const t=Math.min(clip.to-.05,clip.from+.1+i*sampleStep);
    if(t<=clip.from||t>=clip.to)continue;
    await seekFrame(frameVideo,t);
    if(!frameVideo.videoWidth)continue;
    const f=features(frameVideo,previous);
    previous=f;points.push({...f,time:t});
    sampled++;
    if(sampled%6===0){setResultsStatus(sampled+' kare incelendi. '+(index+1)+' / '+clips.length+' klip taranıyor.');await new Promise(resolve=>setTimeout(resolve,0));}
   }
   all.push(...bestWindows(points,clip));
  }
  if(cancelAnalysis)throw Error('Tarama iptal edildi.');
  all.sort((a,b)=>b.score-a.score);
  let chosen=[];
  for(const item of all){
   if(chosen.length>=3)break;
   if(chosen.some(prev=>prev.clipId===item.clipId&&Math.abs(prev.start-item.start)<Math.min(6,item.duration*.7)))continue;
   chosen.push(item);
  }
  const holder=$('bestResults');
  if(!chosen.length){setResultsStatus('Bu videoda yeterli görüntü örneği incelenemedi. İstersen süreleri elle kes.');return;}
  chosen.forEach((item,i)=>{
   const card=document.createElement('div');card.className='moment-card';
   const heading=document.createElement('div');heading.className='moment-heading';heading.textContent=(i+1)+'. öneri · '+fmt(item.global)+' – '+fmt(item.global+item.duration);
   const info=document.createElement('p');info.className='note';info.textContent='Yaklaşık '+Math.round(item.duration)+' saniye. Kaynak: '+item.asset+'. Hareket ve görüntü değişimi ölçümüne göre seçildi.';
   const controls=document.createElement('div');controls.className='moment-actions';
   const visit=document.createElement('button');visit.type='button';visit.className='outline';visit.textContent='Bu ana git';
   visit.addEventListener('click',async()=>{api.pause();await api.seek(item.global);api.status('Önerilen ana gelindi. Oynat düğmesine basarak izleyebilirsin.','ok');});
   const add=document.createElement('button');add.type='button';add.className='secondary';add.textContent='Bu kısmı sona ekle';
   add.addEventListener('click',()=>{api.pause();api.addSuggestedMoment(item.clipId,item.start,item.end);setResultsStatus('Öneri sona eklendi. Yeni analiz yapmak için tekrar tara.');holder.replaceChildren();});
   controls.append(visit,add);card.append(heading,info,controls);holder.append(card);
  });
  setResultsStatus(sampled+' görüntü karesi incelendi. En hareketli 3 bölüm önerildi. Bunlar içeriğin anlamına göre değil, görsel etkinliğe göre seçildi.');
 }catch(e){setResultsStatus(e.message||String(e));}
 finally{
  frameVideo.pause();frameVideo.removeAttribute('src');frameVideo.load();frameVideo.remove();
  button.textContent='Videodaki öne çıkan 10 saniyeleri bul';
  analyzing=false;cancelAnalysis=false;
 }
}
$('findBest').addEventListener('click',()=>{analyze().catch(err=>setResultsStatus('Tarama hatası: '+err.message));});
})();