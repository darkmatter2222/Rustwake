import {initial,restore,type State} from './engine';
const KEY='rustwake.save.v1';
let welcome='';let warning='';let state:State;
try {const raw=localStorage.getItem(KEY);if(raw){const restored=restore(raw,Date.now());state=restored.state;if(restored.elapsed>=60)welcome=`While you were away, your yard worked for ${Math.floor(restored.elapsed/60)} minutes. Cargo and production are already credited (8-hour cap).`;}else state=initial();}catch {state=initial();warning='Your previous save could not be loaded. It has not been overwritten. Export it from your browser storage before resetting.';}
let blocked=!!warning;
export const game={get:()=>state,welcome,warning,save(){if(blocked)return false;try{state.savedAt=Math.max(state.savedAt,Date.now());localStorage.setItem(KEY,JSON.stringify(state));return true;}catch{game.warning='Saving unavailable. Export a save before closing this tab.';return false;}},import(raw:string){const result=restore(raw,Date.now());state=result.state;blocked=false;game.warning='';game.save();},export(){return JSON.stringify({...state,savedAt:Math.max(state.savedAt,Date.now())},null,2);}};
