/**
 * anime-pet-widget — Client half
 * ---------------------------------------------------------------
 * The browser half of the DSH dynamic Cordis Plugin. It renders a kawaii
 * pet pinned to the bottom-right of the web GUI and reacts to the Agent
 * state with synthesized sounds.
 *
 * How the pieces fit:
 *   - `styles.insert(css)`   → injects the widget's own stylesheet.
 *   - `slots.inject/register` → mounts the pet in the frame-wide
 *                               `shell.overlay` layer (bottom-right, above
 *                               every column, click-through by default).
 *   - `host.call('anime-pet:status')` → polls the Host half every 650 ms
 *     for the current `{ status, errored }` snapshot.
 *   - Web Audio (`AudioContext`) → synthesizes three sounds on the fly,
 *     so no audio files or network are needed.
 *
 * Automatic-play note: browsers only allow audio after a user gesture on the
 * page. A one-time `window` `pointerdown` listener calls `AudioContext.resume()`
 * to "unlock" audio on the first click anywhere in the app.
 */

const PET_CSS = `
.anime-pet-widget {
  position: fixed; right: 20px; bottom: 20px;
  display: flex; flex-direction: column; align-items: flex-end;
  z-index: 2147483000; pointer-events: auto;
  font-family: ui-rounded, "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none;
}
.pet-bubble {
  background: #fff; color: #444; border: 2px solid #ffd6e7;
  border-radius: 14px; padding: 6px 10px; font-size: 13px;
  box-shadow: 0 4px 14px rgba(0,0,0,.12); margin-bottom: 6px;
  max-width: 240px; line-height: 1.35; animation: petPop .28s ease;
}
.pet-body {
  display: flex; align-items: center; gap: 8px;
  background: linear-gradient(135deg, #ffd6e7, #d6e4ff);
  border-radius: 999px; padding: 6px 12px;
  box-shadow: 0 6px 18px rgba(0,0,0,.15); cursor: pointer;
  transition: transform .18s ease;
}
.pet-body:hover { transform: translateY(-2px); }
.pet-face { font-size: 26px; line-height: 1; animation: petBreathe 2.2s ease-in-out infinite; }
.pet-body.working .pet-face { animation: petWork 0.9s ease-in-out infinite; }
.pet-body.done .pet-face { animation: petCelebrate 0.5s ease; }
.pet-body.error .pet-face { animation: petSad 1s ease; }
.pet-name { font-size: 13px; font-weight: 700; color: #7a4a6f; }
.pet-mute { background: rgba(255,255,255,.8); border: none; border-radius: 999px; cursor: pointer; font-size: 14px; padding: 2px 6px; }
@keyframes petBreathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
@keyframes petWork    { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes petCelebrate { 0% { transform: scale(1) } 40% { transform: scale(1.35) rotate(-8deg) } 100% { transform: scale(1) } }
@keyframes petSad     { 0% { transform: scale(1) } 30% { transform: rotate(-12deg) } 60% { transform: rotate(10deg) } 100% { transform: scale(1) } }
@keyframes petPop     { 0% { transform: scale(.85); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
`;

/* Lazy Web-Audio synthesizer — three tiny "kawaii" sounds, no assets. */
const AudioFX = (() => {
  let ac = null;

  function ensure() {
    try {
      const Ctor =
        typeof AudioContext !== 'undefined'
          ? AudioContext
          : typeof window !== 'undefined' && window.AudioContext
            ? window.AudioContext
            : null;
      if (!Ctor) return null;
      if (ac === null) ac = new Ctor();
      if (ac && ac.state === 'suspended' && typeof ac.resume === 'function') {
        ac.resume().catch(() => {});
      }
      return ac;
    } catch (e) {
      return null;
    }
  }

  function tone(freq, t0, dur, type, vol, slide) {
    const a = ensure();
    if (!a || typeof a.createOscillator !== 'function') return;
    const osc = a.createOscillator();
    const gain = a.createGain();
    const t = a.currentTime + t0;
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  return {
    ensure,
    // "Start working" — a soft rising poof.
    start: () => {
      tone(523.25, 0, 0.18, 'sine', 0.14);
      tone(659.25, 0.08, 0.2, 'sine', 0.12);
    },
    // "Task complete" — a happy do-mi-sol-do arpeggio (the completion chime).
    complete: () => {
      tone(523.25, 0, 0.16, 'triangle', 0.18);
      tone(659.25, 0.14, 0.16, 'triangle', 0.18);
      tone(783.99, 0.28, 0.16, 'triangle', 0.18);
      tone(1046.5, 0.42, 0.34, 'triangle', 0.2);
      tone(1318.5, 0.48, 0.3, 'sine', 0.1);
    },
    // "Something went wrong" — a low, sorry double-buzz.
    error: () => {
      tone(220, 0, 0.25, 'sawtooth', 0.1);
      tone(174.61, 0.18, 0.3, 'sawtooth', 0.1);
    },
  };
})();

/* The pet, rendered with React (plain createElement — no JSX). */
function AnimePet(props) {
  const ctx = props.ctx;
  const [status, setStatus] = React.useState('idle');
  const [phase, setPhase] = React.useState('idle'); // idle | working | done | error
  const [muted, setMuted] = React.useState(false);
  const [speech, setSpeech] = React.useState('主人，你好呀～');

  const statusRef = React.useRef(null);
  const erroredRef = React.useRef(false);
  const mutedRef = React.useRef(false);
  const resetTimer = React.useRef(null);
  mutedRef.current = muted;

  const play = (fn) => {
    if (!mutedRef.current) {
      try {
        fn();
      } catch (e) {}
    }
  };

  React.useEffect(() => {
    let disposed = false;
    let busy = false;

    const unlock = () => AudioFX.ensure();
    // First user gesture anywhere unlocks autoplay audio.
    try {
      window.addEventListener('pointerdown', unlock, { once: true });
    } catch (e) {}
    try {
      AudioFX.ensure();
    } catch (e) {}

    const scheduleReset = (delay, idleText) => {
      if (resetTimer.current) {
        try {
          resetTimer.current();
        } catch (e) {}
        resetTimer.current = null;
      }
      resetTimer.current = ctx.timeout(() => {
        if (disposed) return;
        setPhase(statusRef.current === 'running' ? 'working' : erroredRef.current ? 'error' : 'idle');
        setSpeech(statusRef.current === 'running' ? '努力工作中…' : idleText);
      }, delay);
    };

    const tick = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        let data;
        try {
          data = await host.call('anime-pet:status');
        } catch (e) {
          return;
        }
        if (disposed) return;

        const st = data && data.status === 'running' ? 'running' : 'idle';
        const err = !!(data && data.errored);
        const prev = statusRef.current;
        statusRef.current = st;
        const prevErr = erroredRef.current;
        erroredRef.current = err;

        // First read — just adopt the current state, no sound.
        if (prev === null) {
          setStatus(st);
          setPhase(err ? 'error' : st === 'running' ? 'working' : 'idle');
          setSpeech(err ? '抱歉，主人我出错了…' : st === 'running' ? '努力工作中…' : '主人，我在等你哦～');
          return;
        }

        // A step/turn errored.
        if (err && !prevErr) {
          setPhase('error');
          setSpeech('唔…刚刚出错了…');
          scheduleReset(4000, '我没事啦～');
          play(AudioFX.error);
          return;
        }

        if (prev === st) return;

        // idle → running : start sound + busy animation.
        if (st === 'running') {
          setStatus(st);
          setPhase('working');
          setSpeech('努力工作中！加油！');
          if (resetTimer.current) {
            try {
              resetTimer.current();
            } catch (e) {}
            resetTimer.current = null;
          }
          play(AudioFX.start);
        } else {
          // running → idle : THE completion moment → happy chime + celebrate.
          setStatus(st);
          setPhase('done');
          setSpeech('完成啦！🎉');
          scheduleReset(3500, '主人，我在等你哦～');
          play(AudioFX.complete);
        }
      } finally {
        busy = false;
      }
    };

    tick();
    const stop = ctx.interval(tick, 650);

    return () => {
      disposed = true;
      if (resetTimer.current) {
        try {
          resetTimer.current();
        } catch (e) {}
        resetTimer.current = null;
      }
      try {
        stop();
      } catch (e) {}
      try {
        window.removeEventListener('pointerdown', unlock);
      } catch (e) {}
    };
  }, []);

  const toggleMute = () => {
    setMuted((m) => !m);
    try {
      AudioFX.ensure();
    } catch (e) {}
  };

  const face =
    phase === 'done'
      ? status === 'running'
        ? '✨'
        : '🎉'
      : phase === 'error'
        ? '😿'
        : '🐱';

  return React.createElement(
    'div',
    {
      className: 'anime-pet-widget',
      onPointerDown: () => {
        try {
          AudioFX.ensure();
        } catch (e) {}
      },
    },
    React.createElement('div', { className: 'pet-bubble' }, speech),
    React.createElement(
      'div',
      { className: 'pet-body ' + phase },
      React.createElement('div', { className: 'pet-face' }, face),
      React.createElement('div', { className: 'pet-name' }, '小窝兽'),
      React.createElement(
        'button',
        {
          className: 'pet-mute',
          onClick: toggleMute,
          title: muted ? '开启声音' : '静音',
        },
        muted ? '🔇' : '🔊',
      ),
    ),
  );
}

return {
  inject: ['timer'],
  apply(ctx) {
    ctx.effect(() => styles.insert(PET_CSS));
    const slots = ctx.get('slots');
    if (slots === undefined) return;
    slots.inject('shell.overlay', () =>
      slots.register(
        { name: 'shell.overlay', id: 'anime-pet', order: 100 },
        () => React.createElement(AnimePet, { ctx }),
      ),
    );
  },
};
