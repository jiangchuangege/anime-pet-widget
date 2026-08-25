/**
 * anime-pet-widget — Host half
 * ---------------------------------------------------------------
 * A DeepSeek Harness (DSH) dynamic Cordis Plugin. This half runs in the
 * DSH Node.js host process and is responsible for:
 *
 *   1. Listening to the Agent lifecycle events that describe its state.
 *   2. Keeping a small, serializable snapshot of that state.
 *   3. Serving that snapshot to the browser (Client) half over the
 *      Package-private JSON RPC channel (`harness.handle` ⇄ `host.call`).
 *
 * The plugin is intentionally tiny: all state lives in a plain object of
 * scalars, and every listener/handler is owned by the current Cordis fiber
 * (via `ctx.effect`), so stopping or updating the Package cleans everything up.
 */

return {
  apply(ctx) {
    // Serialisable snapshot. No live Service / Session objects ever cross
    // the JSON boundary — only these scalars do.
    const state = { status: 'idle', errored: false };

    // Agent went idle ⇄ running. `agent/status` is a global emit event.
    ctx.effect(() =>
      ctx.on('agent/status', (payload) => {
        const p = payload || {};
        const s = p.status || (p.agent && p.agent.status);
        if (s === 'running' || s === 'idle') {
          state.status = s;
          // A new turn starting or a clean settle clears any error flag.
          if (s === 'idle') state.errored = false;
        }
      }),
    );

    // A step or turn errored — the pet uses this to play a "sorry" sound.
    ctx.effect(() =>
      ctx.on('agent/error', () => {
        state.errored = true;
      }),
    );

    // Package-private RPC the Client polls. Must return lossless JSON only.
    ctx.effect(() =>
      harness.handle('anime-pet:status', async () => ({
        status: state.status,
        errored: state.errored,
      })),
    );
  },
};
