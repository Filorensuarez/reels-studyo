const CACHE='reels-studyo-pwa-v47';
const APP=['./','./index.html','./editor.html','./editor.js','./text-overlays.js','./semantic-reels.js','./quick-editor.js','./subtitles.js','./narration.js','./editor.css','./music-library.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP)));self.skipWaiting();
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('reels-studyo-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();
});
self.addEventListener('fetch',e=>{
 const request=e.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  e.respondWith(fetch(request).then(response=>{
   if(response.ok){const cloned=response.clone();caches.open(CACHE).then(cache=>cache.put(request,cloned));}
   return response;
  }).catch(async()=>await caches.match(request)||await caches.match('./index.html')));
 }else{
  e.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
 }
});