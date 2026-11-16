// Session changes invalidate outstanding reads; slow RPCs never overlap for one session.
export function createSidebarPoll({read,write}){
 let selected,version=0,pending=null,closed=false;
 return {
  async refresh(session){
   if(closed)return;
   if(selected!==session){selected=session;version++;pending=null;write(session,'RUSTWAKE TEAM\nLoading…');}
   if(!session||pending!==null)return;
   const token=++version;pending=token;
   try{const result=await read(session);if(!closed&&token===version&&selected===session)write(session,result.text);}
   catch{if(!closed&&token===version&&selected===session)write(session,'RUSTWAKE TEAM\nTelemetry unavailable\nCheck companion server/config.');}
   finally{if(pending===token)pending=null;}
  },
  close(){closed=true;version++;}
 };
}
