/* Reels Stüdyo Özgün Müzik Kütüphanesi - Telifli kayıt veya ağ bağlantısı içermez. */
(function(){
'use strict';
const SR=22050;
const MODE_MAJOR=[0,2,4,5,7,9,11],MODE_MINOR=[0,2,3,5,7,8,10];
const styles={
 masal:{name:'Masal Bahçesi',bpm:92,key:60,melody:[0,2,4,2,4,5,4,2,0,2,4,7,5,4,2,0],inst:'bell',pad:.17,bass:.17,beat:0,minor:false,progression:[0,4,5,3]},
 cocuk:{name:'Neşeli Oyun',bpm:122,key:62,melody:[0,2,4,7,5,4,2,4,7,7,5,4,2,4,2,0],inst:'marimba',pad:.12,bass:.20,beat:1,minor:false,progression:[0,3,4,0]},
 piyano:{name:'Sakin Piyano',bpm:80,key:60,melody:[0,2,4,2,0,-1,2,4,5,4,2,0,-1,2,0,-1],inst:'piano',pad:.17,bass:.14,beat:0,minor:false,progression:[0,5,3,4]},
 motivasyon:{name:'Yeni Başlangıç',bpm:110,key:62,melody:[0,2,4,7,4,5,7,9,7,5,4,2,4,7,9,7],inst:'piano',pad:.23,bass:.23,beat:1,minor:false,progression:[0,4,5,3]},
 vlog:{name:'Modern Vlog',bpm:116,key:60,melody:[0,-1,4,2,7,4,2,-1,0,2,4,-1,7,5,4,2],inst:'pluck',pad:.12,bass:.27,beat:2,minor:false,progression:[0,5,3,4]},
 sinema:{name:'Sinematik Yolculuk',bpm:84,key:57,melody:[0,-1,2,4,5,-1,4,2,0,2,4,7,5,4,2,0],inst:'soft',pad:.32,bass:.27,beat:0,minor:true,progression:[0,5,3,6]},
 huzur:{name:'Huzurlu Esinti',bpm:76,key:65,melody:[0,4,2,-1,5,4,2,0,2,4,5,4,2,-1,0,-1],inst:'bell',pad:.24,bass:.11,beat:0,minor:false,progression:[0,3,5,4]},
 tanitim:{name:'Enerjik Tanıtım',bpm:128,key:60,melody:[0,0,4,7,5,4,2,7,0,2,4,7,9,7,5,4],inst:'pluck',pad:.10,bass:.32,beat:2,minor:false,progression:[0,4,5,3]}
};
const pcmCache=new Map();
const TAU=Math.PI*2;
function degree(key,scale,d){const octave=Math.floor(d/7);return key+scale[((d%7)+7)%7]+12*octave;}
function freq(m){return 440*Math.pow(2,(m-69)/12);}
function addTone(pcm,start,duration,note,amp,kind){
 const startI=Math.max(0,Math.floor(start*SR)), n=Math.min(Math.floor(duration*SR),pcm.length-startI);
 if(n<=0)return;const f=freq(note),inc=TAU*f/SR;const pad=kind==='pad',pluck=kind==='pluck',bell=kind==='bell',bass=kind==='bass',marimba=kind==='marimba',soft=kind==='soft';
 for(let i=0;i<n;i++){
  const t=i/SR,progress=i/n,attack=Math.min(1,t/(pad?.22:.012));
  const release=Math.min(1,(duration-t)/(pad?.27:.06));
  let env=attack*Math.max(0,release);
  if(!pad)env*=Math.exp(-(pluck?5.8:bell?3.4:bass?3.2:marimba?4.2:soft?2.0:2.8)*progress);
  const p=inc*i;
  let w=Math.sin(p);
  if(pad)w+=.18*Math.sin(p*2.001)+.07*Math.sin(p*.501);
  else if(bell)w+=.34*Math.sin(p*2.99)+.13*Math.sin(p*4.12);
  else if(marimba)w+=.28*Math.sin(p*3.01)+.09*Math.sin(p*4.05);
  else if(pluck)w+=.38*Math.sin(2*p)+.14*Math.sin(3*p);
  else if(bass)w+=.17*Math.sin(2*p);
  else w+=.24*Math.sin(2*p)+.08*Math.sin(3*p);
  pcm[startI+i]+=w*env*amp;
 }
}
function kick(pcm,t,amp){const s=Math.floor(t*SR),n=Math.min(Math.floor(.32*SR),pcm.length-s);if(s<0||n<=0)return;let phase=0;for(let i=0;i<n;i++){const x=i/SR;phase+=TAU*(53+80*Math.exp(-x*22))/SR;pcm[s+i]+=(Math.sin(phase)+.15*Math.sin(phase*2))*Math.exp(-x*15)*amp}}
function hat(pcm,t,amp,seed){const s=Math.floor(t*SR),n=Math.min(Math.floor(.09*SR),pcm.length-s);if(s<0||n<=0)return;let x=seed>>>0;let last=0;for(let i=0;i<n;i++){x=(Math.imul(x,1664525)+1013904223)>>>0;const v=x/2147483648-1;const hp=v-last*.92;last=v;pcm[s+i]+=hp*Math.exp(-i/SR*65)*amp}}
function clap(pcm,t,amp,seed){const s=Math.floor(t*SR),n=Math.min(Math.floor(.16*SR),pcm.length-s);if(s<0||n<=0)return;let x=seed>>>0;for(let i=0;i<n;i++){x=(Math.imul(x,1664525)+1013904223)>>>0;const nval=x/2147483648-1;const time=i/SR;pcm[s+i]+=nval*Math.exp(-time*28)*(1+.45*Math.sin(time*TAU*70))*amp}}
function renderTrack(id){
 const c=styles[id];if(!c)throw Error('Müzik seçimi bulunamadı.');
 const quarter=60/c.bpm,duration=quarter*16,pcm=new Float32Array(Math.ceil(duration*SR)),scale=c.minor?MODE_MINOR:MODE_MAJOR;
 const progression=c.progression;
 for(let bar=0;bar<4;bar++){
  const base=bar*quarter*4,root=progression[bar],chord=[root,root+2,root+4];
  for(let j=0;j<chord.length;j++)addTone(pcm,base,quarter*3.98,degree(c.key-12,scale,chord[j]),c.pad/(j===0?1:1.5),'pad');
  addTone(pcm,base,quarter*2.0,degree(c.key-24,scale,root),c.bass,'bass');
  addTone(pcm,base+quarter*2,quarter*1.8,degree(c.key-24,scale,root),c.bass*.85,'bass');
  for(let beat=0;beat<4;beat++){
   const t=base+beat*quarter,arp=chord[[0,2,1,2][beat]];
   addTone(pcm,t,quarter*.78,degree(c.key,scale,arp),c.inst==='piano'?.065:.045,c.inst);
   if(c.beat>0){if(beat%2===0)kick(pcm,t,c.beat===2?.19:.13);else clap(pcm,t,c.beat===2?.038:.026,bar*10+beat+101);}
   if(c.beat===2){hat(pcm,t,c.beat===2?.028:.015,bar*11+beat+1000);hat(pcm,t+quarter*.5,.019,bar*13+beat+900);}
  }
 }
 for(let i=0;i<16;i++){
  const d=c.melody[i];if(d<0)continue;
  const t=i*quarter;
  addTone(pcm,t,quarter*(i%4===3?.88:.77),degree(c.key+12,scale,d),c.inst==='bell'?.095:c.inst==='marimba'?.090:.080,c.inst);
 }
 let max=.001;for(let i=0;i<pcm.length;i++){const a=Math.abs(pcm[i]);if(a>max)max=a}
 const gain=Math.min(1,.82/max);const edge=Math.min(Math.round(.15*SR),Math.round(pcm.length*.015));
 for(let i=0;i<pcm.length;i++){const fade=i<edge?i/edge:i>=pcm.length-edge?(pcm.length-i-1)/edge:1;pcm[i]=Math.tanh(pcm[i]*gain*1.05)*Math.max(0,fade);}
 return pcm;
}
window.ReelsMusic=Object.freeze({
 styles:Object.freeze(Object.fromEntries(Object.entries(styles).map(([id,s])=>[id,s.name]))),
 createBuffer(context,id){
  if(!styles[id])throw Error('Bilinmeyen müzik: '+id);
  let pcm=pcmCache.get(id);
  if(!pcm){pcm=renderTrack(id);pcmCache.set(id,pcm);}
  const buffer=context.createBuffer(1,pcm.length,SR);buffer.copyToChannel(pcm,0);return buffer;
 }
});
})();