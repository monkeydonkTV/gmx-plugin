import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const fake=vi.hoisted(()=>({accounts:vi.fn(),connect:vi.fn(),logout:vi.fn(),close:vi.fn(),verify:vi.fn(),disconnect:vi.fn(),imapOptions:vi.fn()}));
vi.mock('../src/services/account-manager.js',()=>({AccountManager:class {getAllAccounts(){return fake.accounts();}}}));
vi.mock('imapflow',()=>({ImapFlow:class {constructor(options:unknown){fake.imapOptions(options);} connect=fake.connect;logout=fake.logout;close=fake.close;}}));
vi.mock('../src/services/smtp-service.js',()=>({SmtpService:class {verifySmtpConnection=fake.verify;disconnectAll=fake.disconnect;}}));
const account={name:'GMX',host:'imap.gmx.net',port:993,tls:true,user:'synthetic@example.test',password:'synthetic-private-password',smtp:{host:'mail.gmx.net',port:587,secure:false}};
let previousConfig:string|undefined;let previousExit:typeof process.exitCode;let previousError:typeof console.error;
beforeEach(()=>{vi.resetModules();vi.clearAllMocks();previousConfig=process.env.IMAP_MCP_CONFIG_DIR;previousExit=process.exitCode;previousError=console.error;
 process.env.IMAP_MCP_CONFIG_DIR='synthetic-unused';fake.accounts.mockReturnValue([account]);fake.connect.mockResolvedValue(undefined);fake.logout.mockResolvedValue(undefined);fake.verify.mockResolvedValue(true);});
afterEach(()=>{vi.restoreAllMocks();console.error=previousError;process.exitCode=previousExit;if(previousConfig===undefined)delete process.env.IMAP_MCP_CONFIG_DIR;else process.env.IMAP_MCP_CONFIG_DIR=previousConfig;});
async function run(){let output='';vi.spyOn(process.stdout,'write').mockImplementation((chunk:any)=>{output+=String(chunk);return true;});await import('../src/gmx-check.js');return {output,result:JSON.parse(output)};}
describe('GMX onboarding connection check',()=>{
 it('only verifies the fixed IMAP and SMTP endpoints and closes connections',async()=>{const r=await run();expect(r.result).toEqual({success:true,imap:true,smtp:true});expect(fake.imapOptions).toHaveBeenCalledWith(expect.objectContaining({host:'imap.gmx.net',port:993,secure:true,logger:false}));expect(fake.close).toHaveBeenCalledOnce();expect(fake.disconnect).toHaveBeenCalledOnce();expect(r.output).not.toContain(account.password);});
 it('does not authenticate against modified endpoints',async()=>{fake.accounts.mockReturnValue([{...account,host:'not-gmx.example.test'}]);const r=await run();expect(r.result.success).toBe(false);expect(fake.connect).not.toHaveBeenCalled();expect(fake.verify).not.toHaveBeenCalled();});
 it('suppresses provider details on IMAP failure',async()=>{fake.connect.mockRejectedValue(new Error(account.password));const r=await run();expect(r.result).toEqual({success:false,imap:false,smtp:false});expect(r.output).not.toContain(account.password);expect(process.exitCode).toBe(1);expect(fake.close).toHaveBeenCalledOnce();});
 it('distinguishes a failing SMTP verification without sending a message',async()=>{fake.verify.mockResolvedValue(false);const r=await run();expect(r.result).toEqual({success:false,imap:true,smtp:false});expect(process.exitCode).toBe(1);});
});
