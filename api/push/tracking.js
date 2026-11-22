const { put, list, get } = require('@vercel/blob');
const crypto = require('crypto');
const auth = (req) => {
 const s=String(req.headers['x-admin-secret']||''), e=String(process.env.PUSH_ADMIN_SECRET||'');
 const a=Buffer.from(s),b=Buffer.from(e);
 return !!e && a.length===b.length && crypto.timingSafeEqual(a,b);
};
module.exports=async function(req,res){
 if(req.method==='POST'){
  try{
   const {notificationId,event}=req.body||{};
   if(!/^[a-f0-9]{24,64}$/.test(String(notificationId||'')) || event!=='click') return res.status(400).json({error:'Invalid event'});
   const id=crypto.randomBytes(16).toString('hex');
   await put('push/tracking/events/'+id+'.json',JSON.stringify({notificationId,event,at:new Date().toISOString()}),{access:'private',addRandomSuffix:false});
   return res.status(200).json({success:true});
  }catch(e){return res.status(500).json({error:'Tracking unavailable'});}
 }
 if(req.method==='GET'){
  if(!auth(req))return res.status(401).json({error:'Unauthorized'});
  try{
   const logs=await list({prefix:'push/tracking/sends/'}), events=await list({prefix:'push/tracking/events/'});
   const records=[];
   for(const b of logs.blobs){
    try{const r=await get(b.url,{access:'private'});if(r?.statusCode===200)records.push(await new Response(r.stream).json());}catch{}
   }
   const clickCounts={};
   for(const b of events.blobs){
    try{const r=await get(b.url,{access:'private'});if(r?.statusCode===200){const e=await new Response(r.stream).json();clickCounts[e.notificationId]=(clickCounts[e.notificationId]||0)+1;}}catch{}
   }
   records.sort((a,b)=>new Date(b.sentAt)-new Date(a.sentAt));
   return res.status(200).json({success:true,notifications:records.map(x=>({...x,clicks:clickCounts[x.notificationId]||0})).slice(0,100)});
  }catch(e){return res.status(500).json({error:'Tracking records unavailable'});}
 }
 return res.status(405).json({error:'Method not allowed'});
};
