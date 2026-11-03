(() => {
  'use strict';

  const CORE = window.SaturdayGenesisCore;
  const KEY_BUTTONS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyZ: 'cross', KeyX: 'square', KeyC: 'circle', KeyA: 'triangle',
    Enter: 'start', ShiftRight: 'select'
  };
  const GENESIS_BUTTONS = {
    up: CORE?.Button.Up, down: CORE?.Button.Down, left: CORE?.Button.Left, right: CORE?.Button.Right,
    cross: CORE?.Button.A, square: CORE?.Button.B, circle: CORE?.Button.C, triangle: CORE?.Button.X,
    l1: CORE?.Button.Y, r1: CORE?.Button.Z, l2: CORE?.Button.Mode, r2: CORE?.Button.Mode,
    start: CORE?.Button.Start, select: CORE?.Button.Mode, l3: CORE?.Button.Start, r3: CORE?.Button.Mode
  };
  let canvas = null;
  let screen = null;
  let emulator = null;
  let active = false;
  let gameTitle = '';
  let frameNumber = 0;
  let lastFrameTime = 0;
  let raf = 0;
  let audioContext = null;
  let audioNode = null;
  let audioChunks = [];
  let audioOffset = 0;
  let queuedFrames = 0;
  const heldKeys = new Set();

  function clearAudio() {
    audioChunks = [];
    audioOffset = 0;
    queuedFrames = 0;
    audioNode?.port?.postMessage('flush');
  }

  function makeAudioOutput() {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      audioNode = audioContext.createScriptProcessor(2048, 0, 2);
      audioNode.onaudioprocess = event => {
        const left = event.outputBuffer.getChannelData(0);
        const right = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : left;
        left.fill(0);
        if (right !== left) right.fill(0);
        let written = 0;
        while (written < left.length && audioChunks.length) {
          const chunk = audioChunks[0];
          const available = Math.floor((chunk.length - audioOffset) / 2);
          const take = Math.min(available, left.length - written);
          for (let i = 0; i < take; i++) {
            left[written + i] = chunk[audioOffset + i * 2];
            if (right !== left) right[written + i] = chunk[audioOffset + i * 2 + 1];
          }
          written += take;
          audioOffset += take * 2;
          queuedFrames -= take;
          if (audioOffset >= chunk.length) {
            audioChunks.shift();
            audioOffset = 0;
          }
        }
      };
      audioNode.connect(audioContext.destination);
      void audioContext.resume().catch(error => console.warn('Genesis audio is waiting for a local gesture.', error));
    } catch (error) {
      audioContext = null;
      audioNode = null;
      console.warn('Genesis audio could not be started.', error);
    }
  }

  function queueAudio(samples) {
    if (!audioContext || !audioNode || audioContext.state !== 'running' || !samples?.length) return;
    audioChunks.push(samples);
    queuedFrames += samples.length / 2;
    const target = Math.floor(audioContext.sampleRate * 0.12);
    let drop = Math.max(0, queuedFrames - target);
    while (drop > 0 && audioChunks.length) {
      const first = audioChunks[0];
      const available = (first.length - audioOffset) / 2;
      const take = Math.min(available, drop);
      audioOffset += take * 2;
      queuedFrames -= take;
      drop -= take;
      if (audioOffset >= first.length) {
        audioChunks.shift();
        audioOffset = 0;
      }
    }
  }

  function runFrame(now) {
    raf = 0;
    if (!active || !emulator) return;
    const elapsed = lastFrameTime ? now - lastFrameTime : 1000 / 60;
    lastFrameTime = now;
    emulator.run(elapsed);
    queueAudio(emulator.takeAudioSamples());
    screen.present();
    frameNumber += 1;
    raf = requestAnimationFrame(runFrame);
  }

  function bitset(names, axes = {}) {
    let buttons = 0;
    for (const name of names || []) buttons |= GENESIS_BUTTONS[name] || 0;
    const axis = (name, negative, positive) => {
      const value = Number(axes?.[name]);
      if (!Number.isFinite(value)) return;
      if (value <= -0.42) buttons |= GENESIS_BUTTONS[negative] || 0;
      if (value >= 0.42) buttons |= GENESIS_BUTTONS[positive] || 0;
    };
    axis('lx', 'left', 'right'); axis('ly', 'up', 'down');
    axis('rx', 'left', 'right'); axis('ry', 'up', 'down');
    return buttons;
  }

  function updateKeyboard() {
    if (!emulator) return;
    const names = [...heldKeys].map(code => KEY_BUTTONS[code]).filter(Boolean);
    emulator.machine.controllers.inputs[0].set('keyboard', { buttons: bitset(names) });
  }

  window.addEventListener('keydown', event => {
    if (!active || !KEY_BUTTONS[event.code]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    heldKeys.add(event.code);
    updateKeyboard();
  }, true);
  window.addEventListener('keyup', event => {
    if (!KEY_BUTTONS[event.code]) return;
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    heldKeys.delete(event.code);
    updateKeyboard();
  }, true);
  window.addEventListener('blur', () => {
    heldKeys.clear();
    updateKeyboard();
  });

  const aux = {
    init(targetCanvas) {
      if (!CORE) throw new Error('The bundled Genesis emulator did not load.');
      canvas = targetCanvas;
      screen = new CORE.Screen(canvas);
      emulator = new CORE.Emulator(screen);
      emulator.setAudioRate(48000);
      screen.showIdle();
      screen.present();
    },
    async loadFile(file) {
      if (!emulator) throw new Error('The Genesis input is not ready.');
      if (!file) throw new Error('Choose a Genesis cartridge file first.');
      makeAudioOutput();
      if (audioContext?.sampleRate) emulator.setAudioRate(audioContext.sampleRate);
      const files = await CORE.filesFrom(file);
      if (files.length !== 1) throw new Error('Choose one cartridge image at a time, not a ZIP with several games.');
      const media = await CORE.readMedia(files[0]);
      if (media.kind !== 'cartridge') throw new Error('Choose a Genesis cartridge image (.md, .bin, .gen, .smd, or a ZIP with one game).');
      const info = CORE.detectRom(media.image, media.name);
      if (info.rom.length < 0x200) throw new Error('That file is too small to be a Genesis cartridge image.');
      const cartridge = new CORE.Cartridge(info.rom, info.saveRam);
      emulator.machine.setRegion(info.region || 'export');
      emulator.setTv(info.tv || 'ntsc');
      emulator.machine.insertCartridge(cartridge);
      emulator.resetTiming();
      clearAudio();
      gameTitle = info.title || media.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
      frameNumber += 1;
      return { title: gameTitle, name: media.name, region: info.region || 'export', tv: info.tv || 'ntsc' };
    },
    setActive(value) {
      const next = value === true;
      if (active === next) return;
      active = next;
      lastFrameTime = 0;
      emulator?.resetTiming();
      if (active) {
        makeAudioOutput();
        if (audioContext?.sampleRate) emulator?.setAudioRate(audioContext.sampleRate);
        if (audioContext?.state === 'suspended') void audioContext.resume().catch(() => {});
        raf = requestAnimationFrame(runFrame);
      } else {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        clearAudio();
        aux.clearPhoneInput();
        heldKeys.clear();
        updateKeyboard();
      }
    },
    setPhoneInput(buttonNames, axes) {
      if (!emulator) return;
      emulator.machine.controllers.inputs[0].set('phone', { buttons: bitset(buttonNames, axes) });
    },
    clearPhoneInput() {
      emulator?.machine.controllers.inputs[0].clear('phone');
    },
    hasGame() { return Boolean(emulator?.canRun); },
    gameTitle() { return gameTitle; },
    get canvas() { return canvas; },
    get frameNumber() { return frameNumber; }
  };

  window.SaturdayGenesisAux = aux;
})();
