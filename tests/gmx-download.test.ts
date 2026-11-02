import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,writeFile,readFile,rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';
import {emailTools} from '../src/tools/email-tools.js';
describe('GMX exclusive downloads',()=>{
  it('refuses to overwrite an existing file',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'gmx-download-'));
    const old=process.env.IMAP_MCP_EXCLUSIVE_DOWNLOADS;
    process.env.IMAP_MCP_EXCLUSIVE_DOWNLOADS='1';
    try {
      const file=join(dir,'existing.txt');await writeFile(file,'original');
      let handler:Function=()=>{};
      emailTools({registerTool:(n:string,_c:any,h:Function)=>{if(n==='imap_download_attachment')handler=h;}} as any,
        {getAttachmentContent:vi.fn(async()=>({content:Buffer.from('new'),contentType:'text/plain',filename:'existing.txt'}))} as any,
        {resolveAccountId:()=> 'a'} as any,{} as any);
      await expect(handler({uid:1,folder:'INBOX',filename:'existing.txt',savePath:file,extractText:false})).rejects.toMatchObject({code:'EEXIST'});
      expect(await readFile(file,'utf8')).toBe('original');
    } finally {if(old===undefined)delete process.env.IMAP_MCP_EXCLUSIVE_DOWNLOADS;else process.env.IMAP_MCP_EXCLUSIVE_DOWNLOADS=old;await rm(dir,{recursive:true,force:true});}
  });
});
