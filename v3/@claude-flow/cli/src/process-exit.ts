/**
 * Drain queued CLI output before terminating native handles from one-shot work.
 * The wrapper owns the same small helper so it does not require a newer CLI
 * package API. Stream failures must not turn a successful command into exit 0.
 */
export async function exitAfterFlush(code: number): Promise<never> {
  let failed = false;
  const cleanup: Array<() => void> = [];
  try {
    await Promise.all([process.stdout, process.stderr].map((stream) => new Promise<void>((resolve) => {
      const onError = () => { failed = true; resolve(); };
      stream.once('error', onError);
      cleanup.push(() => stream.removeListener('error', onError));
      try {
        stream.write('', (error) => {
          if (error) failed = true;
          resolve();
        });
      } catch {
        onError();
      }
    })));
    return process.exit(failed && code === 0 ? 1 : code);
  } finally {
    for (const remove of cleanup) remove();
  }
}
