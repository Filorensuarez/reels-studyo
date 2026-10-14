// MediaPipe Face Landmarker: on-device face landmarks for supported mobile browsers.
// This module does not swap identities or synthesize expressions.
const VERSION='0.10.22';
const BASE='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+VERSION;
const MODEL='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
export async function createTracker(){
  const {FaceLandmarker,FilesetResolver}=await import(BASE+'/vision_bundle.mjs');
  const fileset=await FilesetResolver.forVisionTasks(BASE+'/wasm');
  const tracker=await FaceLandmarker.createFromOptions(fileset,{
    baseOptions:{modelAssetPath:MODEL,delegate:'CPU'},
    runningMode:'VIDEO',numFaces:5,
    outputFaceBlendshapes:true,
    minFaceDetectionConfidence:.5,minTrackingConfidence:.5
  });
  let lastTime=-1,lastResult=[];
  return {
    detect(video){
      if(!video.videoWidth||video.readyState<2)return lastResult;
      const ms=Math.round(video.currentTime*1000);
      if(ms<=lastTime)return lastResult;
      lastTime=ms;
      const result=tracker.detectForVideo(video,ms);
      lastResult=(result.faceLandmarks||[]).map((points,i)=>{
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
        const left=Math.max(0,Math.min(...xs)),right=Math.min(1,Math.max(...xs));
        const top=Math.max(0,Math.min(...ys)),bottom=Math.min(1,Math.max(...ys));
        const eyeA=points[33],eyeB=points[263];
        const roll=eyeA&&eyeB?Math.atan2(eyeB.y-eyeA.y,eyeB.x-eyeA.x):0;
        return {x:(left+right)/2,y:(top+bottom)/2,size:Math.max(right-left,bottom-top),roll,
          expressions:result.faceBlendshapes?.[i]?.categories?.map(c=>({name:c.categoryName,score:c.score}))||[]};
      });
      return lastResult;
    },
    close(){tracker.close()}
  };
}
