(function(){
'use strict';
const $=id=>document.getElementById(id);
const PROFILES={
 soft:{rate:.96,pitch:1.00,aiRate:.98,title:'Yumuşak anlatım'},
 clear:{rate:1.00,pitch:1.00,aiRate:1.00,title:'Net anlatım'},
 mystic:{rate:.92,pitch:.99,aiRate:.94,title:'Mistik anlatım'}
};
let voiceList=[],recognisedFemale=[],voiceModel=null,working=false,currentAudio=null,lastWavURL=null,chosenVoice=null;
const synth=window.speechSynthesis;
const info=$('deviceVoiceInfo'),status=$('voiceStatus'),audio=$('generatedVoicePlayer'),a=$('downloadAiVoice');
const chosen=()=>PROFILES[$('narratorStyle').value]||PROFILES.soft;
const supported=typeof SpeechSynthesisUtterance!=='undefined'&&!!synth;
function genderPool(){
 const female=/filiz|emel|zeynep|seda|ayşe|ayse|bayan|kadın|female|woman|demet|ece|sinem|aslı|asli|tülay|tulay|selin|merve|gamze|nazlı|nazli|gülsüm|gulsum/i;
 const male=/(?:^|\b)(?:cem|ahmet|mehmet|ali|murat|erkek|male|yusuf|kemal|barış|baris|onur|kaan|serkan|tolga|hakan|fatih|mustafa)(?:\b|$)/i;
 return voiceList.filter(v=>($('narratorGender').value==='male'?male:female).test(v.name));
}
function updateVoiceList(){
 if(!supported){info.textContent='Tarayıcı cihaz seslendirmesini desteklemiyor.';return;}
 voiceList=synth.getVoices().filter(v=>/^tr([-_]|$)/i.test(v.lang));
 const picker=$('deviceVoiceChoice'),old=picker.value;
 picker.replaceChildren();const automatic=document.createElement('option');automatic.value='';automatic.textContent='Uygun Türkçe ses (otomatik)';picker.append(automatic);
 const pool=genderPool();
 pool.forEach(v=>{const o=document.createElement('option');o.value=v.name;o.textContent=v.name+(v.localService?' — telefonda':' — çevrimiçi');picker.append(o)});
 if(old&&pool.some(v=>v.name===old))picker.value=old;
 info.textContent=pool.length?pool.length+' uygun isimli Türkçe ses bulundu. İstediğini seçip dinle.':'Bu telefonda seçilen cinsiyet için doğrulanabilir Türkçe ses bulunamadı. Telefonunun konuşma hizmeti ayarlarından başka bir ses yükleyebilirsin.';
}
function previewDevice(){
 if(!supported){info.textContent='Tarayıcı metni sese dönüştürmeyi desteklemiyor.';return;}
 const text=$('narrationText').value.trim();if(!text){info.textContent='Önce seslendirilecek metni yaz.';return;}
 synth.cancel();const profile=chosen(),u=new SpeechSynthesisUtterance(text.slice(0,450));u.lang='tr-TR';u.rate=profile.rate;u.pitch=profile.pitch;u.volume=1;
 const pool=genderPool();const selected=$('deviceVoiceChoice').value;
 u.voice=pool.find(v=>v.name===selected)||pool[0]||null;
 if(!u.voice){info.textContent='Bu telefonda seçilen türde doğrulanmış Türkçe ses yok. Yanlışlıkla kadın sesi çalmamak için oynatma durduruldu. Telefonun konuşma hizmetinden uygun ses indir.';return;}
 else info.textContent='Dinlenen ses: '+u.voice.name+'. Hız: '+profile.rate+'x.';
 u.onerror=e=>{info.textContent='Ses oynatılamadı: '+(e.error||'Bilinmeyen hata')};
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
 if($('narratorGender').value==='male'){refreshStatus('Bu yapay zekâ modeli ayrı erkek sesi üretemiyor. Kadın sesini erkek olarak oynatmamak için üretim engellendi. Erkek sesi için telefondaki doğrulanmış erkek sesini kullan.',true);return;}
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
$('generatedMaleWav').addEventListener('change',async()=>{
 const file=$('generatedMaleWav').files?.[0],label=$('maleWavStatus');
 if(!file)return;
 if(file.size>40*1048576){label.textContent='Dosya çok büyük (en fazla 40 MB).';return;}
 let ctx;
 try{
  const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw Error('Ses desteği yok');
  ctx=new AudioCtx();const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
  if(buffer.duration>180)throw Error('Ses 3 dakikadan uzun olamaz');
  const samples=new Float32Array(buffer.length);
  for(let ch=0;ch<buffer.numberOfChannels;ch++){const channel=buffer.getChannelData(ch);for(let i=0;i<samples.length;i++)samples[i]+=channel[i]/buffer.numberOfChannels;}
  currentAudio={samples,rate:buffer.sampleRate,origin:'uploaded'};displayWave();
  label.textContent='Erkek sesi eklendi: '+file.name+'. Video dışa aktarımında kullanılacak.';
 }catch(e){label.textContent='Ses dosyası açılamadı: '+e.message}
 finally{try{await ctx?.close()}catch(e){}}
});
$('listenDeviceVoice').addEventListener('click',previewDevice);
$('stopDeviceVoice').addEventListener('click',()=>synth?.cancel());
$('makeAiVoice').addEventListener('click',generate);
$('clearAiVoice').addEventListener('click',clear);
$('narratorGender').addEventListener('change',()=>{synth?.cancel();updateVoiceList();});
$('narratorStyle').addEventListener('change',()=>{synth?.cancel();if(hasAudio())displayWave();});
$('narrationText').addEventListener('input',()=>{if(hasAudio()&&currentAudio.origin==='ai'){currentAudio=null;resetWave();refreshStatus('Metin değiştirildi. Yeni metin için yeniden ses dosyası oluştur.');}});
if(supported){updateVoiceList();synth.addEventListener?.('voiceschanged',updateVoiceList);setTimeout(updateVoiceList,650);}
window.ReelsNarration={hasAudio,getAudioBuffer,clear};
})();