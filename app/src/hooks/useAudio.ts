import { useRef, useCallback, useState } from 'react';
import * as Tone from 'tone';

export interface AudioSettings {
  volume: number;
  enableTimerSounds: boolean;
  enableUiSounds: boolean;
  enableNotificationSounds: boolean;
}

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  volume: 0.7,
  enableTimerSounds: true,
  enableUiSounds: true,
  enableNotificationSounds: true,
};

function loadAudioSettings(): AudioSettings {
  try {
    const saved = localStorage.getItem('retrofocus_audio');
    if (saved) {
      return { ...DEFAULT_AUDIO_SETTINGS, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_AUDIO_SETTINGS };
}

function saveAudioSettings(settings: AudioSettings) {
  try {
    localStorage.setItem('retrofocus_audio', JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function useAudio() {
  const [settings, setSettings] = useState<AudioSettings>(loadAudioSettings);
  const [initialized, setInitialized] = useState(false);
  const synthRef = useRef<Tone.Synth | null>(null);
  const polySynthRef = useRef<Tone.PolySynth | null>(null);

  const initAudio = useCallback(async () => {
    if (initialized) return;
    try {
      await Tone.start();
      synthRef.current = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.3 },
        volume: -10,
      }).toDestination();

      polySynthRef.current = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.5 },
        volume: -10,
      }).toDestination();

      setInitialized(true);
    } catch (e) {
      console.warn('Audio initialization failed:', e);
    }
  }, [initialized]);

  const setVolume = useCallback((vol: number) => {
    Tone.Destination.volume.rampTo(vol > 0 ? Tone.gainToDb(vol) : -Infinity, 0.1);
  }, []);

  const updateSettings = useCallback((newSettings: AudioSettings) => {
    setSettings(newSettings);
    saveAudioSettings(newSettings);
    setVolume(newSettings.volume);
  }, [setVolume]);

  const playClick = useCallback(() => {
    if (!initialized || !settings.enableUiSounds) return;
    const now = Tone.now();
    synthRef.current?.triggerAttackRelease('C6', '32n', now, settings.volume);
  }, [initialized, settings.enableUiSounds, settings.volume]);

  const playTimerComplete = useCallback(() => {
    if (!initialized || !settings.enableTimerSounds) return;
    const now = Tone.now();
    const vol = settings.volume;
    // Three ascending square-wave tones like Win98 chime
    synthRef.current?.triggerAttackRelease('C5', '8n', now, vol);
    synthRef.current?.triggerAttackRelease('E5', '8n', now + 0.25, vol);
    synthRef.current?.triggerAttackRelease('G5', '8n', now + 0.5, vol);
  }, [initialized, settings.enableTimerSounds, settings.volume]);

  const playBreakStart = useCallback(() => {
    if (!initialized || !settings.enableTimerSounds) return;
    const now = Tone.now();
    const vol = settings.volume;
    // Gentle sine wave for break start
    const breakSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.2, sustain: 0.4, release: 0.8 },
      volume: -10,
    }).toDestination();
    breakSynth.triggerAttackRelease('A4', '4n', now, vol);
    setTimeout(() => breakSynth.dispose(), 2000);
  }, [initialized, settings.enableTimerSounds, settings.volume]);

  const playError = useCallback(() => {
    if (!initialized || !settings.enableUiSounds) return;
    const now = Tone.now();
    const vol = settings.volume;
    // Low buzz like Win98 error
    const errorSynth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.05 },
      volume: -8,
    }).toDestination();
    errorSynth.triggerAttackRelease('G2', '16n', now, vol);
    errorSynth.triggerAttackRelease('G2', '16n', now + 0.08, vol);
    setTimeout(() => errorSynth.dispose(), 500);
  }, [initialized, settings.enableUiSounds, settings.volume]);

  const playNotification = useCallback(() => {
    if (!initialized || !settings.enableNotificationSounds) return;
    const now = Tone.now();
    const vol = settings.volume * 0.5;
    synthRef.current?.triggerAttackRelease('C5', '8n', now, vol);
    synthRef.current?.triggerAttackRelease('E5', '8n', now + 0.2, vol);
    synthRef.current?.triggerAttackRelease('G5', '8n', now + 0.4, vol);
  }, [initialized, settings.enableNotificationSounds, settings.volume]);

  const playTada = useCallback(() => {
    if (!initialized || !settings.enableNotificationSounds) return;
    const now = Tone.now();
    const vol = settings.volume;
    // Classic "tada" fanfare
    polySynthRef.current?.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '4n', now, vol);
    polySynthRef.current?.triggerAttackRelease(['D4', 'F4', 'A4', 'D5'], '4n', now + 0.3, vol);
    polySynthRef.current?.triggerAttackRelease(['E4', 'G4', 'B4', 'E5'], '2n', now + 0.6, vol);
  }, [initialized, settings.enableNotificationSounds, settings.volume]);

  return {
    settings,
    initialized,
    initAudio,
    updateSettings,
    playClick,
    playTimerComplete,
    playBreakStart,
    playError,
    playNotification,
    playTada,
  };
}
