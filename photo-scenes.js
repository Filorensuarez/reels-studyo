(function(){
'use strict';
const $=id=>document.getElementById(id),status=$('photoSceneStatus');
$('photoSceneAdd').addEventListener('click',async()=>{
 const file=$('photoSceneFile').files?.[0],duration=Number($('photoSceneDuration').value),motion=$('photoSceneMotion').value;
 if(!file){status.textContent='Önce bir fotoğraf seç.';return;}
 if(!Number.isFinite(duration)||duration<2||duration>15){status.textContent='Süre 2–15 saniye olmalı.';return;}
 if(!HTMLCanvasElement.prototype.captureStream||!window.MediaRecorder){status.textContent='Tarayıcın fotoğrafı videoya dönüştürmeyi desteklemiyor.';return;}
 const button=$('photoSceneAdd');button.disabled=true;
 let url,stream,recorder;
 try{
  url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=540;canvas.height=960;const g=canvas.getContext('2d');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
  if(!mime)throw Error('Bu tarayıcı WebM video kaydını desteklemiyor.');
  stream=canvas.captureStream(30);const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000});
  const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=e=>reject(e.error||Error('Video kaydı başarısız'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}))});
  const paint=t=>{
   const p=Math.min(1,t/duration),w=canvas.width,h=canvas.height;
   g.fillStyle='#101010';g.fillRect(0,0,w,h);
   const cover=Math.max(w/img.width,h/img.height),base=motion==='still'?1:motion==='out'?1.14-.14*p:1+.14*p;
   const scale=cover*base,iw=img.width*scale,ih=img.height*scale,travel=Math.max(0,iw-w);
   const dx=motion==='left'?(w-iw)/2-travel*.3*(p-.5):motion==='right'?(w-iw)/2+travel*.3*(p-.5):(w-iw)/2;
   g.drawImage(img,dx,(h-ih)/2,iw,ih);
  };
  paint(0);recorder.start(200);status.textContent='Fotoğraf sahnesi oluşturuluyor; sayfayı kapatma.';
  const started=performance.now();
  await new Promise(resolve=>{function frame(now){const elapsed=(now-started)/1000;paint(Math.min(duration,elapsed));if(elapsed<duration)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame)});
  recorder.stop();const blob=await finished;
  if(blob.size<1000)throw Error('Video dosyası boş oluştu.');
  const videoFile=new File([blob],file.name.replace(/\.[^.]+$/,'')+'-sahne.webm',{type:'video/webm'});
  const transfer=new DataTransfer();transfer.items.add(videoFile);const input=$('videoFiles');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  status.textContent='Hareketli fotoğraf sahnesi video listesine gönderildi.';
 }catch(e){status.textContent='Sahne oluşturulamadı: '+e.message}
 finally{stream?.getTracks().forEach(t=>t.stop());if(url)URL.revokeObjectURL(url);button.disabled=false;}
});
})();
