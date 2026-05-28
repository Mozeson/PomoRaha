import { useState, useCallback, useRef, useEffect } from 'react';

export type TimerPhase = 'work' | 'shortBreak' | 'longBreak';
export type TimerState = 'idle' | 'running' | 'paused' | 'complete';

export interface TimerSettings {
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
}

const DEFAULT_SETTINGS: TimerSettings = {
  workDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  sessionsBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartWork: false,
};

const PHASE_CYCLE: TimerPhase[] = [
  'work', 'shortBreak', 'work', 'shortBreak',
  'work', 'shortBreak', 'work', 'longBreak',
];

function loadSettings(): TimerSettings {
  try {
    const saved = localStorage.getItem('retrofocus_settings');
    if (saved) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: TimerSettings) {
  try {
    localStorage.setItem('retrofocus_settings', JSON.stringify(settings));
  } catch { /* ignore */ }
}

export function useTimer() {
  const [settings, setSettingsState] = useState<TimerSettings>(loadSettings);
  const [phase, setPhase] = useState<TimerPhase>('work');
  const [timerState, setTimerState] = useState<TimerState>('idle');
  const [sessionCount, setSessionCount] = useState(1);
  const [totalSessionsToday, setTotalSessionsToday] = useState(0);
  const [remainingMs, setRemainingMs] = useState(settings.workDuration * 60 * 1000);

  const startTimeRef = useRef<number>(0);
  const pausedRemainingRef = useRef<number>(settings.workDuration * 60 * 1000);
  const rafRef = useRef<number>(0);
  const totalDurationRef = useRef<number>(settings.workDuration * 60 * 1000);

  const getDurationForPhase = useCallback((p: TimerPhase): number => {
    switch (p) {
      case 'work': return settings.workDuration * 60 * 1000;
      case 'shortBreak': return settings.shortBreakDuration * 60 * 1000;
      case 'longBreak': return settings.longBreakDuration * 60 * 1000;
    }
  }, [settings]);

  const getPhaseLabel = useCallback((p: TimerPhase): string => {
    switch (p) {
      case 'work': return 'WORK TIME';
      case 'shortBreak': return 'SHORT BREAK';
      case 'longBreak': return 'LONG BREAK';
    }
  }, []);

  const getPhaseColor = useCallback((p: TimerPhase, state: TimerState): string => {
    if (state === 'paused') return '#ffaa00';
    switch (p) {
      case 'work': return '#ff4444';
      case 'shortBreak': return '#44aa44';
      case 'longBreak': return '#4488ff';
    }
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, pausedRemainingRef.current - elapsed);
    setRemainingMs(remaining);

    if (remaining <= 0) {
      setTimerState('complete');
      cancelAnimationFrame(rafRef.current);
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = useCallback(() => {
    if (timerState === 'running') return;
    startTimeRef.current = Date.now();
    setTimerState('running');
    rafRef.current = requestAnimationFrame(tick);
  }, [timerState, tick]);

  const pause = useCallback(() => {
    if (timerState !== 'running') return;
    cancelAnimationFrame(rafRef.current);
    pausedRemainingRef.current = remainingMs;
    setTimerState('paused');
  }, [timerState, remainingMs]);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const duration = getDurationForPhase(phase);
    pausedRemainingRef.current = duration;
    totalDurationRef.current = duration;
    setRemainingMs(duration);
    setTimerState('idle');
  }, [phase, getDurationForPhase]);

  const toggle = useCallback(() => {
    if (timerState === 'running') {
      pause();
    } else {
      start();
    }
  }, [timerState, start, pause]);

  const advancePhase = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setSessionCount(prev => {
      const currentPhaseIndex = PHASE_CYCLE.indexOf(phase);
      const nextPhaseIndex = (currentPhaseIndex + 1) % PHASE_CYCLE.length;
      const nextPhase = PHASE_CYCLE[nextPhaseIndex];
      setPhase(nextPhase);

      const newCount = nextPhase === 'work' ? prev + 1 : prev;
      if (nextPhase === 'work') {
        setTotalSessionsToday(t => t + 1);
      }

      const duration = getDurationForPhase(nextPhase);
      pausedRemainingRef.current = duration;
      totalDurationRef.current = duration;
      setRemainingMs(duration);

      if (nextPhase === 'work' && settings.autoStartWork) {
        setTimeout(() => {
          startTimeRef.current = Date.now();
          setTimerState('running');
          rafRef.current = requestAnimationFrame(tick);
        }, 100);
      } else if ((nextPhase === 'shortBreak' || nextPhase === 'longBreak') && settings.autoStartBreaks) {
        setTimeout(() => {
          startTimeRef.current = Date.now();
          setTimerState('running');
          rafRef.current = requestAnimationFrame(tick);
        }, 100);
      } else {
        setTimerState('idle');
      }

      return newCount;
    });
  }, [phase, getDurationForPhase, settings, tick]);

  const setPhaseManually = useCallback((newPhase: TimerPhase) => {
    cancelAnimationFrame(rafRef.current);
    setPhase(newPhase);
    const duration = getDurationForPhase(newPhase);
    pausedRemainingRef.current = duration;
    totalDurationRef.current = duration;
    setRemainingMs(duration);
    setTimerState('idle');
  }, [getDurationForPhase]);

  const addTime = useCallback((minutes: number) => {
    const newRemaining = Math.max(0, remainingMs + minutes * 60 * 1000);
    pausedRemainingRef.current = newRemaining;
    setRemainingMs(newRemaining);
  }, [remainingMs]);

  const updateSettings = useCallback((newSettings: TimerSettings) => {
    setSettingsState(newSettings);
    saveSettings(newSettings);
  }, []);

  // Update refs when settings change
  useEffect(() => {
    totalDurationRef.current = getDurationForPhase(phase);
  }, [settings, phase, getDurationForPhase]);

  // Reset to idle when phase changes while not running
  useEffect(() => {
    if (timerState === 'idle') {
      const duration = getDurationForPhase(phase);
      pausedRemainingRef.current = duration;
      totalDurationRef.current = duration;
      setRemainingMs(duration);
    }
  }, [phase, timerState, getDurationForPhase]);

  const progress = totalDurationRef.current > 0 ? remainingMs / totalDurationRef.current : 1;

  // When timer completes, auto-advance
  useEffect(() => {
    if (timerState === 'complete') {
      const timeout = setTimeout(() => {
        advancePhase();
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [timerState, advancePhase]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const formatTime = useCallback((ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    phase,
    timerState,
    remainingMs,
    progress,
    sessionCount,
    totalSessionsToday,
    settings,
    start,
    pause,
    stop,
    toggle,
    advancePhase,
    setPhaseManually,
    addTime,
    updateSettings,
    formatTime,
    getPhaseLabel,
    getPhaseColor,
  };
}
