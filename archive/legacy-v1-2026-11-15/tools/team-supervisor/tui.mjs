import { Plugin } from '@opencode/plugin/tui';
import { createElement, insert, setProp } from '@opentui/solid';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import { TeamStatusRpc } from './rpc.mjs';
import { createSidebarPoll } from './sidebar-poll.mjs';
export default Plugin.define({
 id:'rustwake-team-sidebar',
 setup(ctx){
  const rpc=ctx.client.rpc(TeamStatusRpc);
  return ctx.ui.slot({append:'sidebar.content',render(props){
   const box=createElement('box');setProp(box,'flexDirection','column');setProp(box,'paddingTop',1);
   const text=createElement('text');setProp(text,'fg',ctx.theme.text.base);
   const [value,setValue]=createSignal({session:'',text:''});
   insert(text,()=>value().session===props.sessionID?value().text:'RUSTWAKE TEAM\nLoading…');insert(box,text);
   const poll=createSidebarPoll({
    async read(session){const location=ctx.data.session.get(session)?.location;if(!location)throw Error('Session location unavailable');return rpc.read({sessionID:session},{location});},
    write(session,text){setValue({session,text});}
   });
   createEffect(()=>{void poll.refresh(props.sessionID);});
   const timer=setInterval(()=>void poll.refresh(props.sessionID),2000);
   onCleanup(()=>{clearInterval(timer);poll.close();});
   return box;
  }});
 }
});
