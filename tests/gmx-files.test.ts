import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'fs/promises';
import {tmpdir} from 'os';
import {join} from 'path';
import {checkGmxFilePath} from '../src/utils/gmx-files.js';
describe('GMX file boundary',()=>{
  it('allows staged attachments and rejects credentials or sibling paths',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'gmx-path-test-'));
    try {
      const files=join(dir,'Files'); await mkdir(files);
      const allowed=join(files,'Grüße.txt'); await writeFile(allowed,'test');
      const key=join(dir,'.key'); await writeFile(key,'synthetic');
      await expect(checkGmxFilePath(allowed,files)).resolves.toBeUndefined();
      await expect(checkGmxFilePath(key,files)).rejects.toThrow();
      await expect(checkGmxFilePath(join(dir,'new.txt'),files,true)).rejects.toThrow();
      await expect(checkGmxFilePath(join(files,'new.txt'),files,true)).resolves.toBeUndefined();
    } finally {await rm(dir,{recursive:true,force:true});}
  });
});
