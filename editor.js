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
 if(window.ReelsTextOverlays)window.ReelsTextOverlays.draw(g,cv,currentTime);
 if(window.ReelsSubtitles)window.ReelsSubtitles.draw(g,cv,currentTime);
 if(window.ReelsShortsEffects)window.ReelsShortsEffects.zoom(g,cv,currentTime);
 if(window.ReelsMarkers)window.ReelsMarkers.draw(g,cv,currentTime);
 if(window.ReelsShortsEffects)window.ReelsShortsEffects.drawHeadline(g,cv,currentTime);
 if(window.ReelsCollage)window.ReelsCollage.watermark(g,cv);
}
function transitionPaint(previous,elapsed){
 if(!previous)return;
 const type=$('transitionType')?.value||'none',duration=Number($('transitionDuration')?.value)||.6;
 if(type==='none'||elapsed<0||elapsed>=duration)return;
 const t=clamp(elapsed/duration,0,1),w=cv.width,h=cv.height;
 g.save();g.shadowBlur=0;g.globalAlpha=1;
 if(type==='fade'){g.globalAlpha=1-t;g.drawImage(previous,0,0,w,h)}
 else if(type==='slide'){g.drawImage(previous,-t*w,0,w,h)}
 else if(type==='wipe'){g.beginPath();g.rect(t*w,0,w*(1-t),h);g.clip();g.drawImage(previous,0,0,w,h)}
 else if(type==='zoom'){g.globalAlpha=1-t;const scale=1+t*.35;g.drawImage(previous,(w-w*scale)/2,(h-h*scale)/2,w*scale,h*scale)}
 else if(type==='flash'){g.fillStyle='#fff';g.globalAlpha=Math.max(0,1-Math.abs(t-.38)/.38);g.fillRect(0,0,w,h)}
 else if(type==='black'){g.fillStyle='#000';g.globalAlpha=1-t;g.fillRect(0,0,w,h)}
 g.restore();
}
function timelinePosition(pos){
 const length=total();pos=clamp(pos,0,Math.max(0,length));currentTime=pos;
 $('playLabel').textContent=fmt(pos);$('totalLabel').textContent=fmt(length);
 $('seekBar').value=length?Math.round(pos/length*1000):0; if($('atLabel'))$('atLabel').textContent='Seçili an: '+fmt(pos);
}
function updateDuration(){
 const len=total();$('durationLabel').textContent='Birleştirilmiş süre: '+fmt(len);
 $('makeVideo').disabled=clips.length===0||Boolean(run&&run.type==='export');
 timelinePosition(Math.min(currentTime,len));
}
function refreshList(){
 if(window.ReelsSubtitles)window.ReelsSubtitles.invalidateOnEdit();
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
function clearUnusedAsset(asset){/* URL saklanır: geri al işlemi eski parçayı yeniden kullanabilmelidir. */}
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
async function addVideos(fileInput=$('videoFiles'),insertAt=null){
 if(run){status('Düzenleme işlemi sürerken yeni video eklenemez.','error');return;}
 const files=[...fileInput.files];fileInput.value='';
 if(!files.length)return;
 const available=Math.max(0,MAX_CLIPS-clips.length);
 let added=0;
 for(const file of files.slice(0,available)){
  const url=URL.createObjectURL(file);
  try{status('Video okunuyor: '+file.name);
   const dur=await fileMetadata(url);
   const asset={url,name:file.name,duration:dur};
   const newClip={id:++uid,asset,from:0,to:dur};if(insertAt==null)clips.push(newClip);else clips.splice(insertAt++,0,newClip);added++;
  }catch(e){URL.revokeObjectURL(url);status(file.name+': '+e.message,'error');}
 }
 if(!added&&files.length>0)return 0;
 refreshList();await seekTo(0);
 $('fileStatus').textContent=clips.length+' klip hazır. En fazla '+MAX_CLIPS+' klip eklenebilir.';
 status(added+' video eklendi. Süreleri ayarla, gerekirse böl ve sırasını değiştir.','ok');return added;
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
 if(!run)return;run.cancelled=true;try{run.narrator?.stop()}catch(e){}
 try{run.video.pause()}catch(e){}
 if(run.type==='preview'){run=null;stopMusic();$('previewPlay').textContent='▶ Ön izlemeyi oynat';}
}
async function playSequence(v,controller,offset=0,prepared=false,onFirstFrame){
 let first=true,previousFrame=null;
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
   const nowPos=clamp(v.currentTime,from,c.to);
   timelinePosition(globalStart+(nowPos-c.from));
   draw(v);
   if(i>0)transitionPaint(previousFrame,nowPos-c.from);
   if(v.currentTime>=c.to-.022||v.ended)break;
   if(v.currentTime>lastPosition+.015){lastPosition=v.currentTime;stallSince=performance.now();}
   if(performance.now()-stallSince>9000)throw Error('Video oynatımı durdu. Dosyayı veya tarayıcıyı kontrol et.');
   await new Promise(requestAnimationFrame);
  }
  v.pause();
  if(controller.cancelled)throw Error('İşlem iptal edildi.');
  if(i<clips.length-1){previousFrame=document.createElement('canvas');previousFrame.width=cv.width;previousFrame.height=cv.height;const pg=previousFrame.getContext('2d');pg.fillStyle='#0a0e17';pg.fillRect(0,0,cv.width,cv.height);if(v.readyState>=2&&v.videoWidth){const w=cv.width,h=cv.height,scale=($('contain').checked?Math.min:Math.max)(w/v.videoWidth,h/v.videoHeight),dw=v.videoWidth*scale,dh=v.videoHeight*scale;pg.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh)}}
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
  if(window.ReelsNarration?.hasAudio()){
    if(!musicCtx){const C=window.AudioContext||window.webkitAudioContext;musicCtx=new C();await musicCtx.resume();}
    const d=window.ReelsNarration.getAudioBuffer(musicCtx);
    const narrator=musicCtx.createBufferSource();narrator.buffer=d.buffer;narrator.playbackRate.value=d.playbackRate;
    narrator.connect(musicCtx.destination);
    const endTime=narrator.buffer.duration/d.playbackRate;
    if(currentTime<endTime){narrator.start(0,currentTime*d.playbackRate);controller.narrator=narrator;}
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
 const hasNarration=Boolean(window.ReelsNarration?.hasAudio());
 const audio=$('keepAudio').checked||musicId!=='none'||hasNarration,mime=chooseMime(audio);
 if(!mime){status('Desteklenen video kayıt biçimi bulunamadı.','error');return;}
 const v=document.createElement('video');v.playsInline=true;v.preload='auto';v.style.cssText='position:fixed;left:-10px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
 document.body.appendChild(v);
 const controller={type:'export',cancelled:false,video:v};run=controller;
 $('cancelVideo').hidden=false;$('makeVideo').disabled=true;$('previewPlay').disabled=true;
 let recorder=null,stream=null,canvasStream=null,context=null,source=null,music=null,narration=null,videoTracks=[],fallback=null;
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
   if(hasNarration){
    const data=window.ReelsNarration.getAudioBuffer(context);
    narration=context.createBufferSource();narration.buffer=data.buffer;narration.playbackRate.value=data.playbackRate;
    const narrGain=context.createGain();narrGain.gain.value=.94;narration.connect(narrGain);narrGain.connect(dest);
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
  recorder.start(600);if(music)music.start(0);if(narration)narration.start(0);
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
  try{music?.stop()}catch(e){}try{narration?.stop()}catch(e){}try{v.pause()}catch(e){}
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
$('seekBar').addEventListener('input',()=>{if(run?.type==='preview')stopRun();if(run)return;seekTo(total()*Number($('seekBar').value)/1000);});
$('captionText').addEventListener('input',()=>draw(player));
$('contain').addEventListener('change',()=>draw(player));
$('musicGain').addEventListener('input',()=>{$('musicGainValue').textContent='%'+$('musicGain').value;if(musicGainNode)musicGainNode.gain.value=Number($('musicGain').value)/100;});
$('sampleMusic').addEventListener('click',playSample);
$('editorMusic').addEventListener('change',stopMusic);
$('previewPlay').addEventListener('click',playPreview);
$('previewStop').addEventListener('click',()=>{stopRun();player.pause();stopMusic();timelinePosition(currentTime);draw(player);status('Video durduruldu. Şimdi bu saniyede kesebilir veya klip ekleyebilirsin.','ok');});
$('makeVideo').addEventListener('click',exportClips);
$('cancelVideo').addEventListener('click',()=>{if(run?.type==='export'){run.cancelled=true;run.video.pause();status('İptal ediliyor...');}});
window.addEventListener('beforeunload',()=>{stopRun();stopMusic();clips.forEach(c=>URL.revokeObjectURL(c.asset.url));if(outputURL)URL.revokeObjectURL(outputURL);});
const undoHistory=[];
function saveUndo(){undoHistory.push({clips:clips.map(c=>({...c})),at:currentTime});if(undoHistory.length>20)undoHistory.shift();}
function undoQuick(){
 if(run){status('Önce oynatmayı duraklat.','error');return;}
 const prev=undoHistory.pop();if(!prev){status('Geri alınacak işlem yok.');return;}
 clips.splice(0,clips.length,...prev.clips);refreshList();seekTo(prev.at);status('Son düzenleme geri alındı.','ok');
}
function pauseAtCurrent(){
 if(run?.type==='export'){status('Video kaydı sürerken düzenleme yapılamaz.','error');return false;}
 if(run?.type==='preview')stopRun();player.pause();stopMusic();return true;
}
function quickAction(action){
 if(!clips.length){status('Önce bir video yükle.','error');return;}
 if(!pauseAtCurrent())return;
 const p=clipAt(currentTime),c=p.clip;
 const point=c.from+p.offset,eps=.12;
 if(action==='split'){
  if(point<=c.from+eps||point>=c.to-eps){status('Bölmek için oynatma çizgisini parçanın ortasına getir.','error');return;}
  saveUndo();const tail={id:++uid,asset:c.asset,from:round(point),to:c.to};c.to=round(point);
  clips.splice(p.index+1,0,tail);refreshList();seekTo(p.startAt+(c.to-c.from));
  status('Video tam bu noktada iki parçaya bölündü. İstersen parçayı çıkar veya araya video ekle.','ok');
 }else if(action==='start'){
  if(point>=c.to-eps){status('Başlangıç noktasını parçanın bitişinden önce seç.','error');return;}
  saveUndo();c.from=round(clamp(point,0,c.to-.1));refreshList();seekTo(p.startAt);
  status('Bu parçanın başındaki görüntüler çıkarıldı.','ok');
 }else if(action==='end'){
  if(point<=c.from+eps){status('Bitiş noktasını parçanın başlangıcından sonra seç.','error');return;}
  saveUndo();c.to=round(clamp(point,c.from+.1,c.asset.duration));refreshList();seekTo(Math.max(0,p.startAt+c.to-c.from-.06));
  status('Bu parçanın sonundaki görüntüler çıkarıldı.','ok');
 }else if(action==='delete'){
  saveUndo();clips.splice(p.index,1);refreshList();seekTo(Math.min(p.startAt,total()));
  status('Seçili video parçası çıkarıldı. Geri Al ile geri getirebilirsin.','ok');
 }
}
async function quickInsert(input){
 if(!input.files.length)return;
 if(!clips.length){saveUndo();await addVideos(input);return;}
 if(!pauseAtCurrent())return;
 const p=clipAt(currentTime),c=p.clip,point=c.from+p.offset,eps=.12;
 saveUndo();let index=p.index;
 if(point>=c.to-eps)index=p.index+1;
 else if(point>c.from+eps){
  const tail={id:++uid,asset:c.asset,from:round(point),to:c.to};c.to=round(point);
  clips.splice(p.index+1,0,tail);index=p.index+1;
 }
 const count=await addVideos(input,index);
 if(!count){undoQuick();return;}
 refreshList();
 let target=0;for(let i=0;i<index;i++)target+=clips[i].to-clips[i].from;
 await seekTo(target);
 status(count+' video seçtiğin noktanın arasına eklendi.','ok');
}
function addSuggestedMoment(id,from,to){
 if(run){status('Önce videoyu durdur.','error');return;}
 const c=clips.find(c=>c.id===id);
 if(!c){status('Klip bulunamadı. Yeniden tara.','error');return;}
 from=round(clamp(from,c.from,c.to-.1));to=round(clamp(to,from+.1,c.to));
 if(to-from<.3)return;
 saveUndo();const start=total();clips.push({id:++uid,asset:c.asset,from,to});refreshList();seekTo(start);
 status('Öne çıkan bölüm sona yeni bir parça olarak eklendi. İstersen diğer parçaları silebilirsin.','ok');
}
async function exportMoment(start,end,title){
 if(run||!clips.length){status('Önce oynatmayı veya dışa aktarmayı durdur.','error');return}
 start=clamp(Number(start),0,total());end=clamp(Number(end),start,total());if(end-start<1){status('Reels bölümü çok kısa.','error');return}
 const saved=clips.slice(),savedTime=currentTime;let elapsed=0,parts=[];
 for(const c of saved){const duration=c.to-c.from,a=Math.max(start,elapsed),b=Math.min(end,elapsed+duration);if(b-a>.05)parts.push({...c,id:++uid,from:round(c.from+a-elapsed),to:round(c.from+b-elapsed)});elapsed+=duration}
 if(!parts.length)return;
 clips.splice(0,clips.length,...parts);updateDuration();
 try{await exportClips()}finally{clips.splice(0,clips.length,...saved);updateDuration();await seekTo(Math.min(savedTime,total()));status('Seçilen Reels dışa aktarma işlemi tamamlandı. Ana montaj geri yüklendi.','ok')}
}
window.ReelsQuickAPI={
 getClips(){let elapsed=0;return clips.map(c=>{const copy={id:c.id,asset:c.asset,from:c.from,to:c.to,timelineStart:elapsed};elapsed+=c.to-c.from;return copy;});},
 getTime(){return currentTime;},
 getTotal:total,
 repaint(){draw(player)},
 isBusy(){return Boolean(run)},
 seek:seekTo,
 pause:pauseAtCurrent,
 edit:quickAction,
 insert:quickInsert,
 undo:undoQuick,
 addSuggestedMoment,
 exportMoment,
 status
};
draw(null);updateDuration();
})();