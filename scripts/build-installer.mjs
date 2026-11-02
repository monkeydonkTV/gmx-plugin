import {readFile, writeFile, mkdir, mkdtemp, copyFile, readdir, lstat} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {buildPlugin, PACKAGE_FILES} from './build-plugin.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const options={};
for(let i=0;i<args.length;i+=2){
  if(!['--compiler','--runtime','--output'].includes(args[i])||!args[i+1]) throw Error('Use --compiler ISCC.exe --runtime NODE_DIRECTORY [--output DIRECTORY]');
  options[args[i]]=resolve(args[i+1]);
}
if(!options['--compiler']||!options['--runtime']) throw Error('Compiler and verified runtime are required.');
const lock=JSON.parse(await readFile(join(root,'installer/runtime-lock.json'),'utf8'));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex').toUpperCase();
for(const [name,expected] of [['node.exe',lock.nodeSha256],['LICENSE',lock.licenseSha256]]){
  const path=join(options['--runtime'],name);
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||hash(await readFile(path))!==expected) throw Error('Runtime verification failed: '+name);
}
const work=resolve(root,'.build/installer');
await mkdir(work,{recursive:true});
const stage=await mkdtemp(join(work,'gmx-installer-'));
const payload=join(stage,'payload');
const marketplace=join(payload,'marketplace');
const plugin=join(marketplace,'gmx-plugin');
const built=await buildPlugin({targetDir:plugin});
await mkdir(join(plugin,'runtime'));
await copyFile(join(options['--runtime'],'node.exe'),join(plugin,'runtime/node.exe'));
await copyFile(join(options['--runtime'],'LICENSE'),join(plugin,'runtime/LICENSE'));
for(const file of ['mcp.json','.mcp.json']){
  const path=join(plugin,file);
  const manifest=JSON.parse(await readFile(path,'utf8'));
  manifest.mcpServers.gmx_mail.command='${PLUGIN_ROOT}/runtime/node.exe';
  await writeFile(path,JSON.stringify(manifest,null,2));
}
await mkdir(join(marketplace,'.claude-plugin'));
await writeFile(join(marketplace,'.claude-plugin/marketplace.json'),JSON.stringify({
  name:'gmx-projekt',interface:{displayName:'GMX Plugin'},plugins:[{name:'gmx-plugin',
    source:{source:'local',path:'./gmx-plugin'},policy:{installation:'AVAILABLE',authentication:'ON_INSTALL'},category:'Productivity'}]
},null,2));
await mkdir(join(payload,'tools'));
const scripts=['Setup-Account.ps1','Integration-Codex.ps1','Integration-Common.ps1'];
for(const file of scripts) await writeFile(join(payload,'tools',file),'\ufeff'+(await readFile(join(root,'installer',file),'utf8')).replace(/^\ufeff/,''));
await copyFile(join(root,'installer/INSTALLATION.txt'),join(payload,'INSTALLATION.txt'));
const versionSource=join(stage,'VersionInfo.cs');
await writeFile(versionSource,`using System.Reflection; [assembly: AssemblyTitle("GMX Plugin Einrichtung")] [assembly: AssemblyVersion("${built.version}.0")] [assembly: AssemblyFileVersion("${built.version}.0")]`);
const csc=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const gui=spawnSync(csc,['/nologo','/target:winexe','/platform:x64','/optimize+','/out:'+join(payload,'GMX-Einrichten.exe'),
 '/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Web.Extensions.dll',join(root,'installer/GmxSetup.cs'),versionSource],
 {encoding:'utf8',windowsHide:true,timeout:60000});
if(gui.error||gui.status!==0) throw Error('GUI compiler failed: '+gui.stdout+'\n'+gui.stderr);
const allowed=[...PACKAGE_FILES.map(p=>'marketplace/gmx-plugin/'+p),'marketplace/gmx-plugin/runtime/node.exe',
 'marketplace/gmx-plugin/runtime/LICENSE','marketplace/.claude-plugin/marketplace.json','INSTALLATION.txt','GMX-Einrichten.exe',...scripts.map(p=>'tools/'+p)].sort();
const actual=[];
async function walk(folder,prefix=''){
 for(const entry of await readdir(folder,{withFileTypes:true})){
  const path=join(folder,entry.name); const stat=await lstat(path);
  if(stat.isSymbolicLink()) throw Error('Links are not allowed in payload.');
  if(stat.isDirectory()) await walk(path,prefix+entry.name+'/');
  else if(stat.isFile()) actual.push(prefix+entry.name); else throw Error('Unsupported file.');
 }
}
await walk(payload);
if(JSON.stringify(actual.sort())!==JSON.stringify(allowed)) throw Error('Unexpected installer content.');
const output=options['--output']||resolve(root,'.build/release');
await mkdir(output,{recursive:true});
const exe=join(output,`GMX-Plugin-Setup-${built.version}.exe`);
try{await lstat(exe);throw Error('Output already exists; do not overwrite a previous deliverable.');}catch(e){if(e.code!=='ENOENT')throw e;}
const compile=spawnSync(options['--compiler'],['/Qp','/DPayloadDir='+payload,'/DOutputPath='+output,'/DPluginVersion='+built.version,join(root,'installer/GMX-Plugin.iss')],{encoding:'utf8',windowsHide:true,timeout:180000});
if(compile.error||compile.status!==0) throw Error('Compiler failed: '+compile.stdout+'\n'+compile.stderr);
const files=[];
for(const file of actual) files.push({path:file,sha256:hash(await readFile(join(payload,file)))});
const result={version:built.version,executable:exe,sha256:hash(await readFile(exe)),bytes:(await lstat(exe)).size,
  payload,payloadFiles:actual.length,privateNode:lock.version,files};
await writeFile(join(output,`GMX-Plugin-Setup-${built.version}.sha256`),result.sha256+'  '+`GMX-Plugin-Setup-${built.version}.exe`+'\r\n');
await writeFile(join(stage,'build.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,files:undefined,buildRecord:join(stage,'build.json')}));
