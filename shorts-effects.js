(function(){
'use strict';
const $=id=>document.getElementById(id);
const settings=['shortsPreset','shortsHeadline','shortsHeadlineStart','shortsHeadlineEnd','shortsZoom','shortsZoomDuration'];
settings.forEach(id=>$(id)?.addEventListener('input',()=>window.ReelsQuickAPI?.repaint()));
function drawHeadline(ctx,cv,t){
 const text=$('shortsHeadline').value.trim(),start=Number($('shortsHeadlineStart').value),end=Number($('shortsHeadlineEnd').value);
 if(!text||t<start||t>=end)return;
 const w=cv.width,h=cv.height,words=text.split(/\s+/),lines=[];let line='';
 ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 '+Math.round(w*.077)+'px system-ui,Arial';
 const max=w*.85;
 for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>max&&line){lines.push(line);line=word;}else line=test}if(line)lines.push(line);
 const visible=lines.slice(0,4),fontSize=w*.077,step=fontSize*1.35,blockH=visible.length*step+30,top=h*.2-blockH/2;
 ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(w*.04,top,w*.92,blockH);
 const preset=$('shortsPreset').value;
 visible.forEach((l,i)=>{const y=top+24+i*step+fontSize*.55;ctx.lineWidth=fontSize*.16;ctx.strokeStyle='#000';ctx.fillStyle=preset==='red'&&i===visible.length-1?'#ff3b30':preset==='yellow'?'#ffeb38':'#fff';ctx.strokeText(l,w/2,y,max);ctx.fillText(l,w/2,y,max)});
 ctx.restore();
}
function zoom(ctx,cv,t){
 const z=$('shortsZoom').value;if(z==='none')return;
 const amount=z==='strong'?.18:.08,period=Math.max(1,Number($('shortsZoomDuration').value)||3),progress=(t%period)/period;
 const scale=1+amount*progress,w=cv.width,h=cv.height;
 const copy=document.createElement('canvas');copy.width=w;copy.height=h;copy.getContext('2d').drawImage(cv,0,0);
 ctx.save();ctx.drawImage(copy,(w-w*scale)/2,(h-h*scale)/2,w*scale,h*scale);ctx.restore();
}
window.ReelsShortsEffects={drawHeadline,zoom,preset:()=>$('shortsPreset').value};
})();
