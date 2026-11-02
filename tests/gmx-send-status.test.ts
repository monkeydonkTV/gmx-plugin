import { describe,it,expect,vi } from 'vitest';
import { SmtpService, SmtpSendError, MAX_MESSAGE_BYTES, MAX_ATTACHMENT_BYTES } from '../src/services/smtp-service.js';
const account: any = { id:'a', name:'GMX',host:'imap.gmx.net',user:'self@example.test',password:'synthetic' };
const email = {from:account.user,to:'to@example.test',subject:'Test',text:'Hallo'};
describe('GMX SMTP outcomes', () => {
  it.each([[new Error('socket timeout'),'unknown'],[Object.assign(new Error('rejected'),{responseCode:550}),'not_sent']])('does not retry %s', async (error,status) => {
    const service = new SmtpService();
    const sendMail = vi.fn().mockRejectedValue(error);
    vi.spyOn(service,'createTransporter').mockResolvedValue({sendMail} as any);
    await expect(service.sendEmail('a',account,email)).rejects.toMatchObject({deliveryStatus:status});
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('distinguishes setup failure from uncertain SMTP outcome', async () => {
    const service = new SmtpService();
    vi.spyOn(service,'createTransporter').mockRejectedValue(new Error('auth failed'));
    await expect(service.sendEmail('a',account,email)).rejects.toMatchObject({deliveryStatus:'not_sent'});
  });
  it('reports partial acceptance', async () => {
    const service = new SmtpService();
    vi.spyOn(service,'createTransporter').mockResolvedValue({sendMail:vi.fn(async()=>({messageId:'x',rejected:['bad@example.test']}))} as any);
    expect(await service.sendEmail('a',account,email)).toMatchObject({deliveryStatus:'partial',rejectedCount:1});
  });
  it('limits complete MIME size before sending', async () => {
    const service = new SmtpService();
    const sendMail=vi.fn();
    vi.spyOn(service,'createTransporter').mockResolvedValue({sendMail} as any);
    await expect(service.sendEmail('a',account,{...email,text:'x'.repeat(MAX_MESSAGE_BYTES)})).rejects.toBeInstanceOf(SmtpSendError);
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('uses GMX default and keeps explicit SMTP settings', () => {
    const service = new SmtpService();
    expect((service as any).getDefaultSmtpConfig(account)).toEqual({host:'mail.gmx.net',port:587,secure:false});
  });
  it('accepts the attachment limit and rejects one byte beyond it', async () => {
    const service=new SmtpService();
    const raw=await service.composeRaw(account,{...email,attachments:[{filename:'limit.bin',content:Buffer.alloc(MAX_ATTACHMENT_BYTES)}]});
    expect(raw.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    await expect(service.composeRaw(account,{...email,attachments:[{filename:'large.bin',content:Buffer.alloc(MAX_ATTACHMENT_BYTES+1)}]})).rejects.toThrow('14 MiB');
  });
  it('checks MIME overhead in addition to separate body and attachment limits', async () => {
    const service=new SmtpService();
    await expect(service.composeRaw(account,{...email,text:'x'.repeat(2*1024*1024),attachments:[{filename:'big.bin',content:Buffer.alloc(MAX_ATTACHMENT_BYTES)}]})).rejects.toThrow('20 MiB');
  });
});
