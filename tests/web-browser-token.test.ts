import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
function browser(hash = '#token=synthetic-browser-token') {
  const storage = new Map<string, string>();
  const request = vi.fn(async () => ({ok: true}));
  const history = {replaceState: vi.fn()};
  const window = {location: new URL('http://127.0.0.1:4321/' + hash), history,
    sessionStorage: {setItem: (key: string, value: string) => storage.set(key, value), getItem: (key: string) => storage.get(key)}};
  const context: any = {window, document: {addEventListener: vi.fn()}, fetch: request, URL, URLSearchParams, Headers};
  vm.runInNewContext(source + '\nglobalThis.testApi = wizardApi;', context);
  return {api: context.testApi, request, history, storage};
}
describe('Wizard browser authentication', () => {
  it('removes the fragment and uses a header without sending browser cookies', async () => {
    const b = browser();
    expect(b.api.authenticated).toBe(true);
    expect(b.history.replaceState).toHaveBeenCalledWith(null, '', '/');
    await b.api.fetch('/api/accounts', {method: 'GET'});
    const [url, options] = b.request.mock.calls[0] as any;
    expect(url).toBe('http://127.0.0.1:4321/api/accounts');
    expect(options.headers.get('Authorization')).toBe('Bearer synthetic-browser-token');
    expect(options.credentials).toBe('omit');
    expect(options.redirect).toBe('error');
    expect(b.storage.get('imap-wizard-token')).toBe('synthetic-browser-token');
  });
  it.each(['http://127.0.0.1:9999/api/accounts', 'https://example.test/api/accounts', '/js/app.js'])
    ('refuses to attach its token to %s', async target => {
      const b = browser();
      await expect(b.api.fetch(target)).rejects.toThrow('Only this wizard');
      expect(b.request).not.toHaveBeenCalled();
    });
  it('does not claim an authenticated page without a token', () => {
    expect(browser('').api.authenticated).toBe(false);
  });
});
