/** Close independent resources even when one fails; force exit if cleanup hangs. */
export function createShutdown(
  resources: { closeSmtp: () => unknown; closeImap: () => unknown; closeServer: () => unknown },
  exit: (code: number) => unknown = code => process.exit(code),
) {
  let stopping = false;
  return function finish() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => exit(1), 5000);
    deadline.unref();
    void (async () => {
      const results = await Promise.allSettled([
        Promise.resolve().then(resources.closeSmtp),
        Promise.resolve().then(resources.closeImap),
      ]);
      try {
        await resources.closeServer();
        clearTimeout(deadline);
        exit(results.some(r => r.status === 'rejected') ? 1 : 0);
      } catch {
        clearTimeout(deadline);
        exit(1);
      }
    })();
  };
}
