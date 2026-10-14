(function(){
'use strict';
const $=id=>document.getElementById(id);
const cv=$('editCanvas'),g=cv.getContext('2d',{alpha:false}),player=$('player');
const clips=[];let uid=0,run=null,seekToken=0,currentTime=0,musicCtx=null,musicSource=null,musicGainNode=null,musicToken=0,outputURL=null;
const MAX_CLIPS=24;
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const fmt=s=>{s=Math.floor(Math.max(0,s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');};
const round=n=>Math.round(n*10)/10;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const total=()=>clips.reduce((sum,c)=>sum+c.to-c.from,0);
function status(s,type=''){const x=$('editorStatus');x.textContent=s;x.className='status '+type;}
function draw(v){
 const w=cv.width,h=cv.height;g.fillStyle='#0a0e17';g.fillRect(0,0,w,h);
 if(v&&v.readyState>=2&&v.videoWidth&&v.videoHeight){
  const sw=v.videoWidth,sh=v.videoHeight,scale=($('contain').checked?Math.min:Math.max)(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
  try{g.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh)}catch(e){}
 }else{
  g.fillStyle='#97bac4';g.textAlign='center';g.font='22px system-ui,Arial';g.fillText('Reels Stüdyo',w/2,h/2);
 }
 const cap=$('captionText').value.trim();
 if(cap){
  g.font='bold '+Math.round(w*.048)+'px system-ui,Arial';g.textAlign='center';
  const max=w*.84,words=cap.split(/\s+/),lines=[];let line='';
  for(const word of words){const test=(line?line+' ':'')+word;if(g.measureText(test).width>max&&line){lines.push(line);line=word}else line=test;}if(line)lines.push(line);
  const visible=lines.slice(0,3),step=w*.067,y=h*.80;
  g.fillStyle='rgba(0,0,0,.65)';g.fillRect(0,y-step,w,visible.length*step+step*2);
  g.fillStyle='#fff';g.shadowColor='#000';g.shadowBlur=5;
  visible.forEach((s,i)=>g.fillText(s,w/2,y+i*step,max));g.shadowBlur=0;
 }
}
function timelinePosition(pos){
 const length=total();pos=clamp(pos,0,Math.max(0,length));currentTime=pos;
 $('playLabel').textContent=fmt(pos);$('totalLabel').textContent=fmt(length);
 $('seekBar').value=length?Math.round(pos/length*1000):0;
}
function updateDuration(){
 const len=total();$('durationLabel').textContent='Birleştirilmiş süre: '+fmt(len);
 $('makeVideo').disabled=clips.length===0||Boolean(run&&run.type==='export');
 timelinePosition(Math.min(currentTime,len));
}
function refreshList(){
 const holder=$('clipList');
 if(!clips.length){holder.innerHTML='<p class="note">Video ekleyerek kesme, bölme ve birleştirme araçlarını kullanabilirsin.</p>';updateDuration();draw(null);return;}
 holder.innerHTML=clips.map((c,i)=>{
  const len=c.to-c.from,mid=round(c.from+len/2);
  return '<article class="clip" data-id="'+c.id+'">'+
   '<div class="clip-head"><span class="clip-name">'+(i+1)+'. '+escapeHtml(c.asset.name)+'</span><span class="clip-meta">'+fmt(len)+' / kaynak '+fmt(c.asset.duration)+'</span></div>'+
   '<div class="trim"><div><label>Başlangıç (saniye)</label><input data-action="from" type="number" inputmode="decimal" min="0" max="'+round(c.to-.1)+'" step="0.1" value="'+round(c.from)+'"></div>'+
   '<div><label>Bitiş (saniye)</label><input data-action="to" type="number" inputmode="decimal" min="'+round(c.from+.1)+'" max="'+round(c.asset.duration)+'" step="0.1" value="'+round(c.to)+'"></div></div>'+
   '<div class="split-row"><div><label>Bölme noktası (saniye)</label><input data-action="splitAt" type="number" inputmode="decimal" min="'+round(c.from+.1)+'" max="'+round(c.to-.1)+'" step="0.1" value="'+mid+'"></div><button type="button" data-action="split" class="secondary">✂ Böl</button></div>'+
   '<div class="clip-actions"><button type="button" data-action="up" class="outline" '+(i===0?'disabled':'')+'>↑ Yukarı</button><button type="button" data-action="down" class="outline" '+(i===clips.length-1?'disabled':'')+'>↓ Aşağı</button><button type="button" data-action="select" class="secondary">▶ Göster</button><button type="button" data-action="delete" class="outline danger">Sil</button></div></article>';
 }).join('');
 updateDuration();
}
function clipAt(t){
 let cumulative=0;
 for(let i=0;i<clips.length;i++){
  const c=clips[i],dur=c.to-c.from;
  if(t<cumulative+dur || i===clips.length-1)return {clip:c,index:i,offset:Math.min(dur,Math.max(0,t-cumulative)),startAt:cumulative};
  cumulative+=dur;
 }
 return null;
}
function clearUnusedAsset(asset){if(!clips.some(c=>c.asset===asset))URL.revokeObjectURL(asset.url);}
function stopMusic(){
 musicToken++;try{musicSource?.stop()}catch(e){}musicSource=null;try{musicCtx?.close()}catch(e){}musicCtx=null;musicGainNode=null;
 $('sampleMusic').textContent='♪ Müziği dinle';
}
async function chosenBuffer(context){const id=$('editorMusic').value;if(id==='none')return null;if(!window.ReelsMusic)throw Error('Müzik kütüphanesi yüklenemedi. Sayfayı yenile.');return window.ReelsMusic.createBuffer(context,id);}
async function playSample(){
 if(musicCtx){stopMusic();return;}
 if($('editorMusic').value==='none'){status('Müzik seçilmedi.');return;}
 const token=++musicToken;const C=window.AudioContext||window.webkitAudioContext;if(!C){status('Müzik desteği bulunamadı.','error');return;}
 let ctx;try{
  ctx=new C();musicCtx=ctx;await ctx.resume();const b=await chosenBuffer(ctx);
  if(token!==musicToken){await ctx.close();return;}
  const src=ctx.createBufferSource(),gain=ctx.createGain();src.buffer=b;src.loop=true;gain.gain.value=Number($('musicGain').value)/100;
  src.connect(gain);gain.connect(ctx.destination);musicSource=src;musicGainNode=gain;src.start();
  $('sampleMusic').textContent='■ Müziği durdur';status('Seçili arka plan müziği çalıyor.');
 }catch(e){stopMusic();status('Müzik açılamadı: '+e.message,'error');}
}
async function fileMetadata(url){
 return new Promise((resolve,reject)=>{
  const v=document.createElement('video');v.preload='metadata';v.playsInline=true;
  let done=false;const timer=setTimeout(()=>finish(Error('Video okunamadı veya biçimi desteklenmiyor.')),20000);
  function finish(err,value){if(done)return;done=true;clearTimeout(timer);v.onloadedmetadata=v.onerror=null;v.removeAttribute('src');v.load();err?reject(err):resolve(value);}
  v.onerror=()=>finish(Error('Video biçimi bu tarayıcıda desteklenmiyor.'));
  v.onloadedmetadata=()=>{const d=v.duration;if(!Number.isFinite(d)||d<=.2){finish(Error('Bu videonun süresi okunamadı.'))}else finish(null,d);};
  v.src=url;v.load();
 });
}
async function addVideos(){
 if(run){status('Düzenleme işlemi sürerken yeni video eklenemez.','error');return;}
 const files=[...$('videoFiles').files];$('videoFiles').value='';
 if(!files.length)return;
 const available=Math.max(0,MAX_CLIPS-clips.length);
 let added=0;
 for(const file of files.slice(0,available)){
  const url=URL.createObjectURL(file);
  try{status('Video okunuyor: '+file.name);
   const dur=await fileMetadata(url);
   const asset={url,name:file.name,duration:dur};
   clips.push({id:++uid,asset,from:0,to:dur});added++;
  }catch(e){URL.revokeObjectURL(url);status(file.name+': '+e.message,'error');}
 }
 if(!added&&files.length>0)return;
 refreshList();await seekTo(0);
 $('fileStatus').textContent=clips.length+' klip hazır. En fazla '+MAX_CLIPS+' klip eklenebilir.';
 status(added+' video eklendi. Süreleri ayarla, gerekirse böl ve sırasını değiştir.','ok');
}
function eventWait(v,name,timeout=20000){
 return new Promise((resolve,reject)=>{
  if(name==='loadedmetadata'&&v.readyState>=1){resolve();return}
  if(name==='loadeddata'&&v.readyState>=2){resolve();return}
  let ended=false;const timer=setTimeout(()=>finish(Error('Video yüklemesi zaman aşımına uğradı.')),timeout);
  function finish(err){if(ended)return;ended=true;clearTimeout(timer);v.removeEventListener(name,ok);v.removeEventListener('error',fail);err?reject(err):resolve();}
  function ok(){finish()}function fail(){finish(Error('Video oynatılamadı.'))}
  v.addEventListener(name,ok,{once:true});v.addEventListener('error',fail,{once:true});
 });
}
async function loadClip(v,c,from,controller){
 if(v.dataset.assetUrl!==c.asset.url){v.pause();v.src=c.asset.url;v.dataset.assetUrl=c.asset.url;v.load();}
 await eventWait(v,'loadedmetadata');
 if(controller?.cancelled)throw Error('İşlem iptal edildi.');
 const at=clamp(from,0,Math.max(0,c.asset.duration-.01));
 if(Math.abs(v.currentTime-at)>.03){v.currentTime=at;await eventWait(v,'seeked');}
 if(v.readyState<2)await eventWait(v,'loadeddata');
 if(controller?.cancelled)throw Error('İşlem iptal edildi.');
}
async function seekTo(t){
 if(run)return;
 const point=clipAt(t);timelinePosition(t);
 if(!point){player.pause();draw(null);return;}
 const token=++seekToken;
 try{player.pause();await loadClip(player,point.clip,point.clip.from+point.offset);
  if(token===seekToken)draw(player);
 }catch(e){if(token===seekToken)status('Ön izleme: '+e.message,'error')}
}
function stopRun(){
 if(!run)return;run.cancelled=true;
 try{run.video.pause()}catch(e){}
 if(run.type==='preview'){run=null;stopMusic();$('previewPlay').textContent='▶ Ön izlemeyi oynat';}
}
async function playSequence(v,controller,offset=0,prepared=false,onFirstFrame){
 let first=true;
 const p=clipAt(offset);if(!p)return;
 let globalStart=p.startAt;
 for(let i=p.index;i<clips.length;i++){
  if(controller.cancelled)throw Error('İşlem iptal edildi.');
  const c=clips[i],from=first?c.from+p.offset:c.from;
  if(!first||!prepared)await loadClip(v,c,from,controller);
  if(first&&onFirstFrame)await onFirstFrame();
  first=false;
  if(controller.cancelled)throw Error('İşlem iptal edildi.');
  await v.play();
  let stallSince=performance.now(),lastPosition=v.currentTime;
  while(!controller.cancelled){
   draw(v);
   const nowPos=clamp(v.currentTime,from,c.to);
   timelinePosition(globalStart+(nowPos-c.from));
   if(v.currentTime>=c.to-.022||v.ended)break;
   if(v.currentTime>lastPosition+.015){lastPosition=v.currentTime;stallSince=performance.now();}
   if(performance.now()-stallSince>9000)throw Error('Video oynatımı durdu. Dosyayı veya tarayıcıyı kontrol et.');
   await new Promise(requestAnimationFrame);
  }
  v.pause();
  if(controller.cancelled)throw Error('İşlem iptal edildi.');
  globalStart+=c.to-c.from;
 }
 timelinePosition(total());draw(v);
}
async function playPreview(){
 if(run){stopRun();return}
 if(!clips.length){status('Önce video yükle.');return;}
 stopMusic();
 const controller={cancelled:false,type:'preview',video:player};run=controller;
 player.muted=!$('keepAudio').checked;
 $('previewPlay').textContent='Ⅱ Duraklat';
 try{
  if($('editorMusic').value!=='none'){
   const C=window.AudioContext||window.webkitAudioContext;const c=new C();musicCtx=c;
   await c.resume();const b=await chosenBuffer(c);if(controller.cancelled)return;
   const source=c.createBufferSource(),gain=c.createGain();source.buffer=b;source.loop=true;gain.gain.value=Number($('musicGain').value)/100;
   source.connect(gain);gain.connect(c.destination);musicSource=source;musicGainNode=gain;
   source.start(0,currentTime%b.duration);
  }
  await playSequence(player,controller,currentTime);
  if(!controller.cancelled){status('Ön izleme tamamlandı.');currentTime=0;timelinePosition(0);}
 }catch(e){if(!controller.cancelled)status('Ön izleme hatası: '+e.message,'error');}
 finally{if(run===controller){run=null;player.pause();stopMusic();$('previewPlay').textContent='▶ Ön izlemeyi oynat';}}
}
const chooseMime=audio=>{
 const choices=audio?['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:
 ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
 return choices.find(m=>MediaRecorder.isTypeSupported(m))||'';
};
function download(blob,filename){
 if(outputURL)URL.revokeObjectURL(outputURL);outputURL=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=outputURL;a.download=filename;a.textContent='Videoyu indir: '+filename;
 $('editorDownload').replaceChildren(a);
}
function loadScript(url){return new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.onload=resolve;el.onerror=()=>reject(Error('MP4 dönüştürücü indirilemedi.'));document.head.appendChild(el);});}
async function remoteBlob(url,type){
 const res=await fetch(url);if(!res.ok)throw Error('Dönüştürücü yüklenemedi.');
 return URL.createObjectURL(new Blob([await res.blob()],{type}));
}
async function convertMp4(input){
 status('MP4 dönüştürücü ilk kullanımda indiriliyor. Bu işlem telefonda biraz zaman alabilir.');
 const pkg='https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/dist/umd',core='https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
 if(!window.FFmpegWASM)await loadScript(pkg+'/ffmpeg.js');
 const ff=new window.FFmpegWASM.FFmpeg();let urls=[];
 try{
  const worker=await remoteBlob(pkg+'/814.ffmpeg.js','text/javascript');
  const coreUrl=await remoteBlob(core+'/ffmpeg-core.js','text/javascript');
  const wasm=await remoteBlob(core+'/ffmpeg-core.wasm','application/wasm');
  urls=[worker,coreUrl,wasm];
  await ff.load({classWorkerURL:worker,coreURL:coreUrl,wasmURL:wasm});
  status('MP4 formatına dönüştürülüyor. Ekranı açık tut.');
  await ff.writeFile('reels.webm',new Uint8Array(await input.arrayBuffer()));
  const ok=await ff.exec(['-i','reels.webm','-c:v','libx264','-preset','ultrafast','-crf','29','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','reels.mp4']);
  if(ok!==0)throw Error('MP4 kodlama başarısız.');
  const bytes=await ff.readFile('reels.mp4');return new Blob([bytes],{type:'video/mp4'});
 }finally{urls.forEach(URL.revokeObjectURL);try{ff.terminate()}catch(e){}}
}
async function exportClips(){
 if(run||!clips.length)return;
 stopMusic();++seekToken;player.pause();
 if(!window.MediaRecorder||!cv.captureStream){status('Telefon tarayıcısı video dışa aktarımını desteklemiyor. Güncel Chrome ile dene.','error');return;}
 const W=Number($('outputSize').value),FPS=Number($('outputFps').value),musicId=$('editorMusic').value;
 const audio=$('keepAudio').checked||musicId!=='none',mime=chooseMime(audio);
 if(!mime){status('Desteklenen video kayıt biçimi bulunamadı.','error');return;}
 const v=document.createElement('video');v.playsInline=true;v.preload='auto';v.style.cssText='position:fixed;left:-10px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
 document.body.appendChild(v);
 const controller={type:'export',cancelled:false,video:v};run=controller;
 $('cancelVideo').hidden=false;$('makeVideo').disabled=true;$('previewPlay').disabled=true;
 let recorder=null,stream=null,canvasStream=null,context=null,source=null,music=null,videoTracks=[],fallback=null;
 try{
  cv.width=W;cv.height=Math.round(W*16/9);
  await loadClip(v,clips[0],clips[0].from,controller);draw(v);
  const tracks=(()=>{canvasStream=cv.captureStream(FPS);return [...canvasStream.getVideoTracks()]})();
  if(audio){
   const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Tarayıcı ses mikslemeyi desteklemiyor.');
   context=new C();await context.resume();const dest=context.createMediaStreamDestination();
   if($('keepAudio').checked){
    source=context.createMediaElementSource(v);const gain=context.createGain();gain.gain.value=1;source.connect(gain);gain.connect(dest);v.muted=false;
   }else v.muted=true;
   if(musicId!=='none'){
    const b=await chosenBuffer(context);music=context.createBufferSource();const gain=context.createGain();gain.gain.value=Number($('musicGain').value)/100;
    music.buffer=b;music.loop=true;music.connect(gain);gain.connect(dest);
   }
   tracks.push(...dest.stream.getAudioTracks());
  }else v.muted=true;
  stream=new MediaStream(tracks);
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:W===1080?5500000:W===720?3000000:1800000});
  let chunks=[];const stopped=new Promise((resolve,reject)=>{
   recorder.ondataavailable=e=>{if(e.data.size>0)chunks.push(e.data)};
   recorder.onerror=e=>reject(e.error||Error('Video kayıt hatası.'));
   recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));
  });
  recorder.start(600);if(music)music.start(0);
  status('Klipler birleştiriliyor. Süre: '+fmt(total())+'. Ekranı açık tut.');
  await playSequence(v,controller,0,true);
  if(controller.cancelled)throw Error('İşlem iptal edildi.');
  recorder.stop();const data=await stopped;fallback=data;
  if(!data.size)throw Error('Kaydedilen video boş.');
  if(mime.startsWith('video/mp4')){
   download(data,'reels-el-analizi.mp4');status('Videolar birleştirildi. MP4 dosyası indirilmeye hazır.','ok');
  }else{
   try{const mp4=await convertMp4(data);if(controller.cancelled)return;
    download(mp4,'reels-el-analizi.mp4');status('MP4 hazır. Videonu Instagram Reels bölümüne yükleyebilirsin.','ok');
   }catch(e){console.warn(e);download(data,'reels-el-analizi.webm');status('Videolar birleştirildi ancak MP4 dönüşümü tamamlanmadı. WebM dosyası indirilebilir; Instagram için MP4 gerekebilir. '+e.message,'error');}
  }
 }catch(e){if(!controller.cancelled){status('Video oluşturulamadı: '+e.message,'error');if(fallback?.size)download(fallback,'reels-el-analizi.webm');}}
 finally{
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(e){}}
  try{music?.stop()}catch(e){}try{v.pause()}catch(e){}
  try{stream?.getTracks().forEach(t=>t.stop())}catch(e){}
  try{canvasStream?.getTracks().forEach(t=>t.stop())}catch(e){}
  try{await context?.close()}catch(e){}
  v.removeAttribute('src');v.load();v.remove();
  cv.width=540;cv.height=960;
  if(run===controller)run=null;
  $('cancelVideo').hidden=true;$('previewPlay').disabled=false;updateDuration();
  await seekTo(0);
 }
}
$('videoFiles').addEventListener('change',()=>addVideos().catch(e=>status(e.message,'error')));
$('clipList').addEventListener('change',e=>{
 if(run)return;const input=e.target;if(!input.matches('input[data-action]'))return;
 if(input.dataset.action==='splitAt')return;
 const card=input.closest('[data-id]'),index=clips.findIndex(x=>x.id===Number(card?.dataset.id));if(index<0)return;
 const c=clips[index],v=Number(input.value);
 if(!Number.isFinite(v))return;
 if(input.dataset.action==='from')c.from=clamp(v,0,c.to-.1);
 if(input.dataset.action==='to')c.to=clamp(v,c.from+.1,c.asset.duration);
 c.from=round(c.from);c.to=round(c.to);refreshList();seekTo(0);
});
$('clipList').addEventListener('click',e=>{
 if(run)return;const btn=e.target.closest('button[data-action]');if(!btn)return;
 const card=btn.closest('[data-id]'),index=clips.findIndex(x=>x.id===Number(card?.dataset.id));if(index<0)return;
 const c=clips[index],action=btn.dataset.action;
 if(action==='up'&&index>0){[clips[index-1],clips[index]]=[clips[index],clips[index-1]];}
 if(action==='down'&&index<clips.length-1){[clips[index+1],clips[index]]=[clips[index],clips[index+1]];}
 if(action==='delete'){clips.splice(index,1);clearUnusedAsset(c.asset);}
 if(action==='split'){
  const mid=Number(card.querySelector('[data-action=splitAt]').value);
  if(!Number.isFinite(mid)||mid<=c.from+.1||mid>=c.to-.1){status('Bölme saniyesi başlangıç ile bitiş arasında olmalı.','error');return;}
  const second={id:++uid,asset:c.asset,from:round(mid),to:c.to};
  c.to=round(mid);clips.splice(index+1,0,second);
  status('Klip iki parçaya bölündü. Parçaları ayrı ayrı düzenleyebilirsin.','ok');
 }
 if(action==='select'){let t=0;for(let i=0;i<index;i++)t+=clips[i].to-clips[i].from;seekTo(t);return;}
 refreshList();seekTo(0);
});
$('seekBar').addEventListener('input',()=>{if(run)return;seekTo(total()*Number($('seekBar').value)/1000);});
$('captionText').addEventListener('input',()=>draw(player));
$('contain').addEventListener('change',()=>draw(player));
$('musicGain').addEventListener('input',()=>{$('musicGainValue').textContent='%'+$('musicGain').value;if(musicGainNode)musicGainNode.gain.value=Number($('musicGain').value)/100;});
$('sampleMusic').addEventListener('click',playSample);
$('editorMusic').addEventListener('change',stopMusic);
$('previewPlay').addEventListener('click',playPreview);
$('previewStop').addEventListener('click',()=>{stopRun();player.pause();stopMusic();timelinePosition(0);seekTo(0);});
$('makeVideo').addEventListener('click',exportClips);
$('cancelVideo').addEventListener('click',()=>{if(run?.type==='export'){run.cancelled=true;run.video.pause();status('İptal ediliyor...');}});
window.addEventListener('beforeunload',()=>{stopRun();stopMusic();clips.forEach(c=>URL.revokeObjectURL(c.asset.url));if(outputURL)URL.revokeObjectURL(outputURL);});
draw(null);updateDuration();
})();