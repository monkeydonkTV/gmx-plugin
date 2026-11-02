import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]);
const spec=JSON.parse(readFileSync(join(root,'mcp.json'),'utf8')).mcpServers.gmx_mail;
const child=spawn(spec.command.replaceAll('${PLUGIN_ROOT}',root),spec.args.map(a=>a.replaceAll('${PLUGIN_ROOT}',root)),{cwd:root,env:process.env,windowsHide:true,stdio:['pipe','pipe','pipe']});
const timer=setTimeout(()=>{child.kill();console.error('Offline protocol timeout');process.exitCode=1;},30000);
const pending=new Map();let sequence=0,buffer='';
child.stderr.on('data',()=>{});
child.stdout.on('data',chunk=>{buffer+=chunk.toString();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!line.trim())continue;const message=JSON.parse(line);if(message.id)pending.get(message.id)?.(message);}});
function call(method,params){const id=++sequence;return new Promise(resolve=>{pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});}
try{
 const init=await call('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'offline-installer-test',version:'1.0.0'}});assert(!init.error);
 child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
 const tools=await call('tools/list',{});assert.equal(tools.result.tools.length,12);
 const accounts=await call('tools/call',{name:'imap_list_accounts',arguments:{}});assert(!accounts.result.isError);assert.equal(JSON.parse(accounts.result.content[0].text).accounts.length,1);
 const dry=await call('tools/call',{name:'imap_send_email',arguments:{to:'synthetic@example.test',subject:'Offline only',text:'No network',dryRun:true}});assert(!dry.result.isError);assert.equal(JSON.parse(dry.result.content[0].text).dryRun,true);
 child.stdin.end();
 const code=await new Promise((resolve,reject)=>{child.on('exit',resolve);child.on('error',reject);});assert.equal(code,0);
 console.log(JSON.stringify({success:true,version:init.result.serverInfo.version,toolCount:12,syntheticAccounts:1,dryRunOnly:true,exitCode:code}));
}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
