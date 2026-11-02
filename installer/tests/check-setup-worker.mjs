import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createDecipheriv,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const payload=resolve(process.argv[2]);
const work=resolve(process.argv[3]); mkdirSync(work,{recursive:true});
const dir=mkdtempSync(join(work,'synthetic-worker-'));
const marker=randomUUID(); writeFileSync(join(dir,'.synthetic-only'),marker,{flag:'wx'});
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('IMAP_MCP_')));
env.GMX_PLUGIN_DATA_DIR=dir;
env.PATH=process.env.WINDIR+'\\System32'; // no installed/global Node in this process
const pwsh=join(process.env.WINDIR,'System32/WindowsPowerShell/v1.0/powershell.exe');
function setup(input,mode='direct'){
 const worker=mode==='direct'?[join(payload,'tools/Setup-Account.ps1')]:[fileURLToPath(new URL('./Run-SetupWorker.ps1',import.meta.url)),'-Payload',payload];
 return spawnSync(pwsh,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',...worker],{env,input,encoding:'utf8',windowsHide:true,timeout:25000});
}
const passwords=['synthetic-ä-🔐-first','\uFEFFsynthetic-ö-🔑-second'];
let id;
for(const mode of ['direct','dotnet-bom']) for(const password of passwords){
 const r=setup(JSON.stringify({email:'synthetic@example.test',password}),mode);
 assert.equal(r.status,0,'Synthetic setup worker failed');
 assert(!r.stdout.includes(password)&&!r.stderr.includes(password));
 assert.equal(readFileSync(join(dir,'.synthetic-only'),'utf8'),marker);
 assert.equal(realpathSync(dir),dir);
 const raw=readFileSync(join(dir,'accounts.json'),'utf8');const accounts=JSON.parse(raw);
 assert.equal(accounts.length,1);assert.equal(accounts[0].email,'synthetic@example.test');
 assert(!passwords.some(p=>raw.includes(p)));
 if(id)assert.equal(accounts[0].id,id);id=accounts[0].id;
 // Decrypt only after positively identifying our new synthetic store above.
 const [iv,ciphertext]=accounts[0].password.split(':');
 const decipher=createDecipheriv('aes-256-cbc',Buffer.from(readFileSync(join(dir,'.key'),'utf8'),'hex'),Buffer.from(iv,'hex'));
 const decoded=Buffer.concat([decipher.update(Buffer.from(ciphertext,'hex')),decipher.final()]).toString('utf8');
 assert(decoded===password,'Synthetic UTF-8 credential roundtrip failed');
}
const before=readFileSync(join(dir,'accounts.json'));
for(const input of ['null','{"password":"synthetic-secret" INVALID']){
 const r=setup(input);assert.equal(r.status,1);assert(!r.stderr.includes('synthetic-secret'));assert(!r.stderr.includes(' at '));
 assert(readFileSync(join(dir,'accounts.json')).equals(before));
}
console.log(JSON.stringify({success:true,privateRuntimeWithoutGlobalNode:true,utf8CredentialsRoundtrip:true,dotnetBomRoundtrip:true,passwordLeadingBomPreserved:true,updatedSameAccount:true,malformedInputPreservesAccount:true,noPlaintextInStoreOrOutput:true,syntheticOnly:true,directory:dir}));
