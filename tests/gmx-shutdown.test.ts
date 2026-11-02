import {describe,it,expect,vi} from 'vitest';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createShutdown} from '../src/utils/shutdown.js';
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
describe('GMX shutdown',()=>{
 it('cleans independent resources once after repeated close events',async()=>{
  const smtp=vi.fn(),imap=vi.fn(),server=vi.fn(),exit=vi.fn();
  const finish=createShutdown({closeSmtp:smtp,closeImap:imap,closeServer:server},exit);
  finish();finish();await settle();
  expect(smtp).toHaveBeenCalledTimes(1);expect(imap).toHaveBeenCalledTimes(1);
  expect(server).toHaveBeenCalledTimes(1);expect(exit).toHaveBeenCalledWith(0);
 });
 it('still closes IMAP and server when SMTP cleanup throws',async()=>{
  const imap=vi.fn(),server=vi.fn(),exit=vi.fn();
  createShutdown({closeSmtp:()=>{throw new Error('synthetic close failure');},closeImap:imap,closeServer:server},exit)();
  await settle();expect(imap).toHaveBeenCalledOnce();expect(server).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledWith(1);
 });
 it('reports a server close failure as failed exit',async()=>{
  const exit=vi.fn();
  createShutdown({closeSmtp:()=>{},closeImap:()=>{},closeServer:()=>{throw new Error('synthetic');}},exit)();
  await settle();expect(exit).toHaveBeenCalledWith(1);
 });
 it('exits a real process with an active socket and blocked cleanup after the deadline',async()=>{
  const moduleUrl=pathToFileURL(resolve('src/utils/shutdown.ts')).href;
  const code=`import {createServer} from 'node:net';import {createShutdown} from ${JSON.stringify(moduleUrl)};const active=createServer();active.listen(0,'127.0.0.1',()=>{createShutdown({closeSmtp:()=>{},closeImap:()=>new Promise(()=>{}),closeServer:()=>active.close()})();});`;
  const start=performance.now();
  const result=await new Promise<{code:number|null,stderr:string}>((resolve,reject)=>{
   const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:process.cwd(),stdio:['ignore','ignore','pipe'],windowsHide:true});
   let stderr='';child.stderr.on('data',d=>{stderr+=d;});child.on('error',reject);child.on('close',code=>resolve({code,stderr}));
  });
  expect(result.stderr).toBe('');expect(result.code).toBe(1);expect(performance.now()-start).toBeGreaterThanOrEqual(4800);
 },10000);
});
