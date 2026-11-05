import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse,modify,applyEdits} from 'jsonc-parser';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
let file=path.join(root,'opencode.jsonc');
try{await fs.access(file);}catch{file=path.join(root,'opencode.json');}
let before='{}\n';try{before=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const errors=[];const config=parse(before,errors,{allowTrailingComma:true});
if(errors.length||!config||typeof config!=='object'||Array.isArray(config))throw new Error('Invalid OpenCode config');
for(const key of ['plugin','plugins'])if(config[key]!==undefined&&!Array.isArray(config[key]))throw new Error(`${key} is not an array`);
const spec=pathToFileURL(path.dirname(fileURLToPath(import.meta.url))).href;
const entries=[...(config.plugin??[]),...(config.plugins??[])];
if(!entries.some(x=>x===spec||x?.package===spec))entries.push({package:spec,options:{waitTools:[]}});
let after=applyEdits(before,modify(before,['plugins'],entries,{formattingOptions:{insertSpaces:true,tabSize:2}}));
if(config.plugin!==undefined)after=applyEdits(after,modify(after,['plugin'],undefined,{}));
if(after!==before){await fs.writeFile(file+'.rustwake-team.bak',before,{flag:'wx'});await fs.writeFile(file+'.rustwake-team.tmp',after);await fs.rename(file+'.rustwake-team.tmp',file);}
console.log('Configured local companion plugin. Reload OpenCode, select coordinator, /rustwake-team bind, then /goal forever goal.md. Map verified wait tool names before relying on the wait guard.');
