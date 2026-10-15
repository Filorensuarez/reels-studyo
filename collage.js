(function(){
'use strict';
const $=id=>document.getElementById(id);
function watermark(ctx,cv){
 const text=$('watermarkText').value.trim();if(!text)return;
 const w=cv.width,h=cv.height,position=$('watermarkPosition').value;
 ctx.save();ctx.globalAlpha=Number($('watermarkOpacity').value)/100;ctx.font='bold '+Math.round(w*.029)+'px system-ui,Arial';ctx.textAlign=position==='left'?'left':'right';
 const x=position==='left'?w*.045:w*.955,y=position==='top'?h*.075:h*.94;
 ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.fillStyle='#fff';ctx.strokeText(text,x,y);ctx.fillText(text,x,y);ctx.restore();
}
['watermarkText','watermarkPosition','watermarkOpacity'].forEach(id=>$(id).addEventListener('input',()=>window.ReelsQuickAPI?.repaint()));
$('collageAdd').addEventListener('click',async()=>{
 const files=Array.from($('collageFiles').files||[]),count=Number($('collageLayout').value),duration=Number($('collageDuration').value),status=$('collageStatus');
 if(files.length<count){status.textContent='Bu yerleşim için '+count+' fotoğraf seç.';return;}
 if(!(duration>=2&&duration<=15)){status.textContent='Süre 2–15 saniye olmalı.';return;}
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){status.textContent='Tarayıcı video oluşturmayı desteklemiyor.';return;}
 const button=$('collageAdd');button.disabled=true;
 let stream,recorder;const urls=[];
 try{
  const imgs=await Promise.all(files.slice(0,count).map(async file=>{const u=URL.createObjectURL(file);urls.push(u);const im=new Image();im.src=u;await im.decode();return im}));
  const canvas=document.createElement('canvas');canvas.width=540;canvas.height=960;const g=canvas.getContext('2d');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));if(!mime)throw Error('WebM kaydı desteklenmiyor.');
  const cols=count===2?1:Math.sqrt(count),rows=count/cols,cw=canvas.width/cols,ch=canvas.height/rows;
  function paint(){
   g.fillStyle='#080808';g.fillRect(0,0,canvas.width,canvas.height);
   imgs.forEach((im,i)=>{const x=(i%cols)*cw,y=Math.floor(i/cols)*ch,scale=Math.max(cw/im.width,ch/im.height),iw=im.width*scale,ih=im.height*scale;
    g.save();g.beginPath();g.rect(x,y,cw,ch);g.clip();g.drawImage(im,x+(cw-iw)/2,y+(ch-ih)/2,iw,ih);g.restore();g.strokeStyle='#101010';g.lineWidth=4;g.strokeRect(x,y,cw,ch);
   });
  }
  paint();stream=canvas.captureStream(30);const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000});
  const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=e=>reject(e.error||Error('Kayıt hatası'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}))});
  recorder.start(200);status.textContent='Kolaj videosu oluşturuluyor...';
  const start=performance.now();await new Promise(resolve=>{function tick(now){paint();if(now-start<duration*1000)requestAnimationFrame(tick);else resolve()}requestAnimationFrame(tick)});
  recorder.stop();const blob=await finished;if(blob.size<1000)throw Error('Çıktı boş');
  const input=$('videoFiles'),dt=new DataTransfer();dt.items.add(new File([blob],'kolaj-sahnesi.webm',{type:'video/webm'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));status.textContent='Kolaj sahnesi video listesine gönderildi.';
 }catch(e){status.textContent='Kolaj oluşturulamadı: '+e.message}
 finally{stream?.getTracks().forEach(t=>t.stop());urls.forEach(URL.revokeObjectURL);button.disabled=false}
});
window.ReelsCollage={watermark};
})();
