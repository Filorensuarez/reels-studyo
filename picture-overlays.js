(function(){
'use strict';
const $=id=>document.getElementById(id),items=[];
const api=()=>window.ReelsQuickAPI;
const status=s=>$('pictureOverlayStatus').textContent=s;
function draw(ctx,cv,time){
 for(const item of items){
  if(time<item.start||time>=item.end||!item.img.complete)continue;
  const w=cv.width,h=cv.height,scale=item.size;
  const dw=w*scale,dh=dw*item.img.naturalHeight/item.img.naturalWidth;
  let x=(w-dw)/2,y=(h-dh)/2;
  if(item.position==='top')y=h*.08;
  if(item.position==='bottom')y=h*.90-dh;
  if(item.position==='left')x=w*.03;
  if(item.position==='right')x=w*.97-dw;
  ctx.save();ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=8;ctx.drawImage(item.img,x,y,dw,dh);ctx.restore();
 }
}
function list(){
 const box=$('pictureOverlayList');box.replaceChildren();
 items.forEach((item,i)=>{
  const row=document.createElement('div');row.className='row';row.style.marginTop='8px';
  const label=document.createElement('span');label.textContent=(i+1)+'. '+item.name+' ('+item.start.toFixed(1)+'–'+item.end.toFixed(1)+' sn)';
  const btn=document.createElement('button');btn.type='button';btn.className='outline';btn.textContent='Sil';btn.onclick=()=>{URL.revokeObjectURL(item.url);items.splice(i,1);list();api()?.repaint()};
  row.append(label,btn);box.append(row);
 });
}
$('pictureOverlayNow').onclick=()=>{const t=api()?.getTime()||0;$('pictureOverlayStart').value=t.toFixed(1);$('pictureOverlayEnd').value=(t+3).toFixed(1)};
$('pictureOverlayAdd').onclick=async()=>{
 const file=$('pictureOverlayFile').files?.[0],start=Number($('pictureOverlayStart').value),end=Number($('pictureOverlayEnd').value),total=api()?.getTotal()||0;
 if(!file){status('Önce görsel seç.');return;}
 if(!total){status('Önce video veya fotoğraf sahnesi ekle.');return;}
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||start>=total||end<=start){status('Geçerli başlangıç ve bitiş saniyesi gir.');return;}
 const url=URL.createObjectURL(file),img=new Image();
 try{
  img.src=url;await img.decode();
  items.push({name:file.name,img,url,start,end,position:$('pictureOverlayPosition').value,size:Number($('pictureOverlaySize').value)});
  list();api()?.repaint();status('Görsel eklendi. Önizleme ve video çıktısında görünecek.');
 }catch(e){URL.revokeObjectURL(url);status('Görsel açılamadı: '+e.message)}
};
window.ReelsPictureOverlays={draw};
})();
