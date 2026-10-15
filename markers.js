(function(){
'use strict';
const $=id=>document.getElementById(id),canvas=$('editCanvas');
const items=[];let pending=false,first=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const time=()=>window.ReelsQuickAPI?.getTime()||0;
const total=()=>window.ReelsQuickAPI?.getTotal()||0;
const repaint=()=>window.ReelsQuickAPI?.repaint();
const say=s=>$('markerStatus').textContent=s;
function draw(ctx,cv,t){
 const w=cv.width,h=cv.height;
 for(const m of items){
  if(t<m.start||t>=m.end)continue;
  const x=m.x*w,y=m.y*h,X=m.X*w,Y=m.Y*h;
  ctx.save();ctx.strokeStyle=m.color;ctx.fillStyle=m.color;ctx.lineWidth=m.width*w/540;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.shadowColor='rgba(0,0,0,.65)';ctx.shadowBlur=5;
  if(m.type==='arrow'||m.type==='line'){
   ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.stroke();
   if(m.type==='arrow'){
    const angle=Math.atan2(Y-y,X-x),head=Math.max(16,ctx.lineWidth*3);
    ctx.beginPath();ctx.moveTo(X,Y);ctx.lineTo(X-head*Math.cos(angle-.55),Y-head*Math.sin(angle-.55));ctx.moveTo(X,Y);ctx.lineTo(X-head*Math.cos(angle+.55),Y-head*Math.sin(angle+.55));ctx.stroke();
   }
  }else if(m.type==='circle'){
   ctx.beginPath();ctx.ellipse((x+X)/2,(y+Y)/2,Math.max(6,Math.abs(X-x)/2),Math.max(6,Math.abs(Y-y)/2),0,0,Math.PI*2);ctx.stroke();
  }else{
   const left=Math.min(x,X),top=Math.min(y,Y),width=Math.abs(X-x),height=Math.abs(Y-y);
   if(m.type==='highlight'){ctx.fillStyle=m.color+'55';ctx.fillRect(left,top,width,height)}
   ctx.strokeRect(left,top,width,height);
  }
  ctx.restore();
 }
}
function render(){
 const holder=$('markerList');holder.replaceChildren();
 items.forEach((m,i)=>{
  const row=document.createElement('div');row.className='moment-card';
  const label=document.createElement('span');label.textContent=(i+1)+'. '+({arrow:'Ok',circle:'Daire',rect:'Kutu',line:'Çizgi',highlight:'Vurgu'}[m.type])+' — '+m.start.toFixed(1)+'–'+m.end.toFixed(1)+' sn';
  const del=document.createElement('button');del.type='button';del.className='outline';del.textContent='Sil';
  del.onclick=()=>{items.splice(i,1);render();repaint()};
  row.append(label,del);holder.append(row);
 });
}
$('markerNow').onclick=()=>{const t=time();$('markerStart').value=t.toFixed(1);$('markerEnd').value=(Math.min(total()||t+3,t+3)).toFixed(1);say('Başlangıç ve bitiş zamanı ayarlandı.')};
$('markerAdd').onclick=()=>{
 if(!total()){say('Önce video yükle.');return;}
 const a=Number($('markerStart').value),b=Number($('markerEnd').value);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a||a>=total()){say('Geçerli başlangıç ve bitiş saniyesi seç.');return;}
 pending=true;first=null;say('İşaretin ilk noktasına dokun. Ardından ikinci noktaya dokun.');
};
canvas.addEventListener('pointerdown',e=>{
 if(!pending)return;
 e.preventDefault();
 const r=canvas.getBoundingClientRect(),p={x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)};
 if(!first){first=p;say('Şimdi işaretin ikinci noktasına dokun.');return;}
 items.push({type:$('markerType').value,color:$('markerColor').value,width:Number($('markerWidth').value),start:Number($('markerStart').value),end:Number($('markerEnd').value),x:first.x,y:first.y,X:p.x,Y:p.y});
 first=null;pending=false;render();repaint();say('İşaret eklendi. Seçilen saniyeler arasında görünür.');
});
window.ReelsMarkers={draw};
})();
