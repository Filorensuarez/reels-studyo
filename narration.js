(function(){
'use strict';
const $=id=>document.getElementById(id);
const PROFILES={
 soft:{rate:.90,pitch:.98,aiRate:.95,title:'Yumuşak anlatım'},
 clear:{rate:.99,pitch:1.00,aiRate:1.03,title:'Net anlatım'},
 mystic:{rate:.84,pitch:.94,aiRate:.90,title:'Mistik anlatım'}
};
let voiceList=[],recognisedFemale=[],voiceModel=null,working=false,currentAudio=null,lastWavURL=null,chosenVoice=null;
const synth=window.speechSynthesis;
const info=$('deviceVoiceInfo'),status=$('voiceStatus'),audio=$('generatedVoicePlayer'),a=$('downloadAiVoice');
const chosen=()=>PROFILES[$('narratorStyle').value]||PROFILES.soft;
const supported=typeof SpeechSynthesisUtterance!=='undefined'&&!!synth;
function updateVoiceList(){
 if(!supported){info.textContent='Bu tarayıcı cihaz seslendirmesini desteklemiyor. Yapay zekâ modelini deneyebilirsin.';return;}
 voiceList=synth.getVoices().filter(v=>/^tr([-_]|$)/i.test(v.lang));
 const femaleNames=/filiz|emel|zeynep|seda|ayşe|ayse|bayan|kadın|female|woman|demet|ece|sinem|aslı|asli|tülay|tulay|selin|merve|gamze|nazlı|nazli|gülsüm|gulsum/i;
 recognisedFemale=voiceList.filter(v=>femaleNames.test(v.name));
 if(recognisedFemale.length)info.textContent=recognisedFemale.length+' kadın olarak adlandırılan Türkçe cihaz sesi bulundu. Buradaki 3 seçenek ses tonu ve hızını da değiştirir. Cihaz sesini doğrudan video dosyasına aktaramayız.';
 else if(voiceList.length)info.textContent=voiceList.length+' Türkçe cihaz sesi bulundu ancak kadın sesi olduğu doğrulanamıyor. AI modelinin kadın sesi olduğu da garanti edilmez.';
 else info.textContent='Türkçe cihaz sesi bulunamadı. Telefonun dil/ses ayarlarından Türkçe ses indirilebilir veya deneysel AI seçeneği kullanılabilir.';
}
function previewDevice(){
 if(!supported){info.textContent='Tarayıcı metni sese dönüştürmeyi desteklemiyor.';return;}
 const text=$('narrationText').value.trim();if(!text){info.textContent='Önce seslendirilecek metni yaz.';return;}
 synth.cancel();const profile=chosen(),u=new SpeechSynthesisUtterance(text.slice(0,450));u.lang='tr-TR';u.rate=profile.rate;u.pitch=profile.pitch;u.volume=1;
 let pool=recognisedFemale.length?recognisedFemale:voiceList;
 let idx=({soft:0,clear:1,mystic:2})[$('narratorStyle').value]||0;
 if(pool.length)u.voice=pool[Math.min(idx,pool.length-1)];
 u.onerror=e=>{info.textContent='Cihaz sesinin oynatımı başarısız oldu: '+(e.error||'Bilinmeyen hata')};
 if(!recognisedFemale.length)info.textContent='Kadın olarak etiketlenmiş cihaz sesi bulunmadı. Duyduğun sesin kadın sesi olduğunu doğrula.';
 synth.speak(u);
}
function refreshStatus(text,err=false){status.textContent=text;status.className='status'+(err?' error':'');}
function splitSentences(text,limit=145){
 const result=[];let current='';
 const tokens=text.trim().split(/\s+/);
 for(const word of tokens){
  if(word.length>limit){
   if(current){result.push(current);current='';}
   for(let i=0;i<word.length;i+=limit)result.push(word.slice(i,i+limit));
   continue;
  }
  const proposed=current?current+' '+word:word;
  if(proposed.length>limit){if(current)result.push(current);current=word;}else current=proposed;
  if(/[.!?]$/.test(word)&&current.length>45){result.push(current);current='';}
 }
 if(current)result.push(current);
 return result;
}
async function fetchModel(){
 if(voiceModel)return voiceModel;
 refreshStatus('Türkçe yapay zekâ modeli indiriliyor. Büyük bir indirme ve telefon belleği gerekebilir.');
 const hf=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
 const model=await hf.pipeline('text-to-speech','payam1394/traxlate-mms-tts-tur',{
  device:'wasm',dtype:'q8',progress_callback:p=>{
   if(p?.status==='progress'&&typeof p.progress==='number')refreshStatus('AI modeli indiriliyor: %'+Math.round(p.progress));
  }
 });
 voiceModel=model;return model;
}
function riffPcm16(float,rate){
 const total=float.length*2,buf=new ArrayBuffer(44+total),v=new DataView(buf);
 function bytes(offset,str){for(let i=0;i<str.length;i++)v.setUint8(offset+i,str.charCodeAt(i));}
 bytes(0,'RIFF');v.setUint32(4,36+total,true);bytes(8,'WAVE');bytes(12,'fmt ');
 v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
 v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
 bytes(36,'data');v.setUint32(40,total,true);
 for(let i=0;i<float.length;i++){const x=Math.max(-1,Math.min(1,float[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true);}
 return new Blob([buf],{type:'audio/wav'});
}
function getEncodedWav(){
 if(!currentAudio)return null;const p=chosen();
 // Sesin hızı ve tonu örnekleme frekansıyla birlikte değiştirilir.
 return riffPcm16(currentAudio.samples,currentAudio.origin==='uploaded'?currentAudio.rate:Math.max(1000,Math.round(currentAudio.rate*p.aiRate)));
}
function hasAudio(){return Boolean(currentAudio?.samples?.length);}
function getAudioBuffer(context){
 if(!hasAudio())return null;
 const b=context.createBuffer(1,currentAudio.samples.length,currentAudio.rate);
 b.copyToChannel(currentAudio.samples,0);
 return {buffer:b,playbackRate:currentAudio.origin==='uploaded'?1:chosen().aiRate};
}
function resetWave(){
 if(lastWavURL)URL.revokeObjectURL(lastWavURL);lastWavURL=null;
 a.removeAttribute('href');a.hidden=true;audio.hidden=true;audio.removeAttribute('src');audio.load();
}
function displayWave(){
 resetWave();const blob=getEncodedWav();if(!blob)return;
 lastWavURL=URL.createObjectURL(blob);
 audio.src=lastWavURL;audio.hidden=false;a.href=lastWavURL;a.download='reels-turkce-ai-seslendirme.wav';a.hidden=false;
}
async function warmAndLevel(samples,rate){
 if(!window.OfflineAudioContext)return samples;
 const ctx=new OfflineAudioContext(1,samples.length,rate);
 const b=ctx.createBuffer(1,samples.length,rate);b.copyToChannel(samples,0);
 const source=ctx.createBufferSource();source.buffer=b;
 const low=ctx.createBiquadFilter();low.type='lowshelf';low.frequency.value=220;low.gain.value=3.2;
 const presence=ctx.createBiquadFilter();presence.type='peaking';presence.frequency.value=2900;presence.Q.value=.85;presence.gain.value=1.1;
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-23;compressor.knee.value=14;compressor.ratio.value=2.5;compressor.attack.value=.006;compressor.release.value=.17;
 source.connect(low);low.connect(presence);presence.connect(compressor);compressor.connect(ctx.destination);
 source.start();const rendered=await ctx.startRendering();const result=Float32Array.from(rendered.getChannelData(0));
 let peak=0;for(const x of result)peak=Math.max(peak,Math.abs(x));
 const gain=peak>0?Math.min(1.65,.91/peak):1;
 if(gain!==1)for(let i=0;i<result.length;i++)result[i]*=gain;
 return result;
}
async function generate(){
 if(working){refreshStatus('Seslendirme oluşturuluyor, lütfen bekle.');return;}
 if(!$('voiceLicenseConsent').checked){refreshStatus('Modelin ticari olmayan kullanım şartını kabul etmelisin. Gelir elde edilen içeriklerde bu modeli kullanma.',true);return;}
 const text=$('narrationText').value.trim().replace(/\s+/g,' ');if(!text){refreshStatus('Seslendirilecek metni yaz.',true);return;}
 if(text.length>450){refreshStatus('En fazla 450 karakter seslendirilebilir.',true);return;}
 working=true;$('makeAiVoice').disabled=true;synth?.cancel();
 try{
  const model=await fetchModel(),sentences=splitSentences(text);let wave=[],samplerate=0;
  for(let i=0;i<sentences.length;i++){
   refreshStatus((i+1)+' / '+sentences.length+' bölümün sesi üretiliyor. Sayfayı kapatma.');
   const out=await model(sentences[i]);
   if(!out?.audio?.length||!Number.isFinite(out.sampling_rate))throw Error('Model geçerli ses verisi üretmedi.');
   if(samplerate&&samplerate!==out.sampling_rate)throw Error('Modelin örnekleme hızı değişti.');
   samplerate=out.sampling_rate;
   wave.push(Float32Array.from(out.audio));
   if(i<sentences.length-1)wave.push(new Float32Array(Math.round(samplerate*.16)));
  }
  const len=wave.reduce((s,x)=>s+x.length,0);
  if(len>samplerate*150)throw Error('Çıktı çok uzun. Daha kısa metin dene.');
  const samples=new Float32Array(len);let at=0;for(const x of wave){samples.set(x,at);at+=x.length;}
  const polished=await warmAndLevel(samples,samplerate).catch(()=>samples);
  currentAudio={samples:polished,rate:samplerate,origin:'ai'};
  displayWave();
  refreshStatus('AI ses dosyası oluşturuldu; sıcaklık, dolgunluk ve ses dengesi iyileştirildi. Dinle, WAV olarak indir veya video dışa aktarımına ekle. Bu model yalnızca ticari olmayan kullanım içindir.');
 }catch(e){refreshStatus('Seslendirme üretilemedi: '+(e?.message||String(e))+'. Telefonunda büyük modeli çalıştırmak mümkün olmayabilir.',true);}
 finally{working=false;$('makeAiVoice').disabled=false;}
}
function clear(){currentAudio=null;resetWave();refreshStatus('Yapay zekâ ses kaydı kaldırıldı.');}
let voiceFiles=[],selectedVoice=-1;
const voiceInfo=msg=>$('myVoiceStatus').textContent=msg;
function openVoiceDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('reels-studyo-voice-library',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('voices'))req.result.createObjectStore('voices')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function readVoiceDB(){const db=await openVoiceDB();return new Promise((resolve,reject)=>{const t=db.transaction('voices','readonly'),req=t.objectStore('voices').get('mySamples');req.onsuccess=()=>{resolve(req.result||[]);db.close()};req.onerror=()=>{reject(req.error);db.close()}})}
async function writeVoiceDB(files){const db=await openVoiceDB();return new Promise((resolve,reject)=>{const t=db.transaction('voices','readwrite');t.objectStore('voices').put(files,'mySamples');t.oncomplete=()=>{db.close();resolve()};t.onerror=()=>{db.close();reject(t.error)}})}
function renderVoiceFiles(){const holder=$('myVoiceList');holder.replaceChildren();voiceFiles.forEach((file,i)=>{const row=document.createElement('div');row.className='moment-card';const name=document.createElement('span');name.textContent=(i+1)+'. '+file.name+' ('+(file.size/1048576).toFixed(1)+' MB)';const use=document.createElement('button');use.type='button';use.className='secondary';use.textContent=i===selectedVoice?'Seçili ses':'Videoda kullan';use.onclick=()=>useVoice(i);const remove=document.createElement('button');remove.type='button';remove.className='outline';remove.textContent='Sil';remove.onclick=()=>{voiceFiles.splice(i,1);if(selectedVoice===i){selectedVoice=-1;currentAudio=null;resetWave()}else if(selectedVoice>i)selectedVoice--;renderVoiceFiles();voiceInfo('Liste değişti. Kaydet düğmesine bas.')};row.append(name,use,remove);holder.append(row)});}
async function useVoice(index){const file=voiceFiles[index];if(!file)return;let ctx=null;try{const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Ses çözümleme desteklenmiyor');ctx=new C();const buffer=await ctx.decodeAudioData(await file.arrayBuffer());const samples=new Float32Array(buffer.length);for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0;i<samples.length;i++)samples[i]+=data[i]/buffer.numberOfChannels}if(samples.length>buffer.sampleRate*180)throw Error('Ses en fazla üç dakika olabilir.');currentAudio={samples,rate:buffer.sampleRate,origin:'uploaded'};selectedVoice=index;displayWave();renderVoiceFiles();voiceInfo('Videoda kullanılacak ses: '+file.name+'. Kütüphaneyi saklamak için Kaydet düğmesine bas.')}catch(e){voiceInfo('Ses açılamadı: '+e.message)}finally{try{await ctx?.close()}catch(e){}}}
$('importNarrator').addEventListener('change',async()=>{const files=Array.from($('importNarrator').files||[]);let added=0;for(const file of files){if(file.size>45*1048576){voiceInfo(file.name+' çok büyük (en fazla 45 MB).');continue}if(voiceFiles.length>=15){voiceInfo('En fazla 15 ses örneği eklenebilir.');break}voiceFiles.push(file);added++}renderVoiceFiles();if(added){voiceInfo(added+' yeni ses eklendi, toplam '+voiceFiles.length+'. Kaydet düğmesine bas.');if(selectedVoice<0)await useVoice(0)}$('importNarrator').value='';});
$('saveMyVoices').addEventListener('click',async()=>{try{await writeVoiceDB(voiceFiles);voiceInfo(voiceFiles.length+' ses örneği bu cihazın tarayıcı belleğine kaydedildi.')}catch(e){voiceInfo('Kayıt başarısız: '+e.message+'. Telefon depolama alanını kontrol et.')}});
$('clearMyVoices').addEventListener('click',async()=>{voiceFiles=[];selectedVoice=-1;currentAudio=null;resetWave();renderVoiceFiles();try{await writeVoiceDB([]);voiceInfo('Kayıtlı ses örnekleri temizlendi.')}catch(e){voiceInfo('Temizleme hatası: '+e.message)}});
readVoiceDB().then(async files=>{voiceFiles=files;renderVoiceFiles();voiceInfo(files.length+' kayıtlı ses bulundu.');if(files.length)await useVoice(0)}).catch(()=>voiceInfo('Tarayıcı depolaması açılamadı; sesleri geçici olarak ekleyebilirsin.'));
$('listenDeviceVoice').addEventListener('click',previewDevice);
$('stopDeviceVoice').addEventListener('click',()=>synth?.cancel());
$('makeAiVoice').addEventListener('click',generate);
$('clearAiVoice').addEventListener('click',clear);
$('narratorStyle').addEventListener('change',()=>{synth?.cancel();if(hasAudio())displayWave();});
$('narrationText').addEventListener('input',()=>{if(hasAudio()&&currentAudio.origin==='ai'){currentAudio=null;resetWave();refreshStatus('Metin değiştirildi. Yeni metin için yeniden ses dosyası oluştur.');}});
if(supported){updateVoiceList();synth.addEventListener?.('voiceschanged',updateVoiceList);setTimeout(updateVoiceList,650);}
window.ReelsNarration={hasAudio,getAudioBuffer,clear};
})();