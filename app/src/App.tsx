import { useState, useCallback, useEffect, useRef } from 'react';
import { useTimer } from './hooks/useTimer';
import { useAudio } from './hooks/useAudio';
import { TimerCanvas } from './components/TimerCanvas';
import { Win98Window } from './components/Win98Window';
import { SettingsDialog } from './components/SettingsDialog';
import { AboutDialog } from './components/AboutDialog';
import { Taskbar } from './components/Taskbar';
import { DesktopIcons } from './components/DesktopIcons';
import { ToastNotification, type Toast } from './components/ToastNotification';
import './index.css';

let zIndexCounter = 100;

export default function App() {
  const timer = useTimer();
  const audio = useAudio();

  // Window visibility states
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [soundHint, setSoundHint] = useState(!audio.initialized);

  // Z-index management
  const [mainZIndex, setMainZIndex] = useState(100);
  const [settingsZIndex, setSettingsZIndex] = useState(101);
  const [aboutZIndex, setAboutZIndex] = useState(102);

  // Tooltips
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  // Session tracking for toasts
  const prevPhaseRef = useRef(timer.phase);

  const bringToFront = useCallback((setter: (z: number) => void) => {
    zIndexCounter += 1;
    setter(zIndexCounter);
  }, []);

  const showTooltip = useCallback((text: string, x: number, y: number) => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    tooltipTimeoutRef.current = setTimeout(() => {
      setTooltip({ text, x, y });
    }, 200);
  }, []);

  const hideTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) clearTimeout(tooltipTimeoutRef.current);
    setTooltip(null);
  }, []);

  const addToast = useCallback((message: string, phase: 'work' | 'shortBreak' | 'longBreak') => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, phase }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Timer completion → toast
  useEffect(() => {
    if (timer.timerState === 'complete') {
      audio.playTimerComplete();
      const phaseLabel = timer.phase === 'work' ? 'Work session complete! Time for a break.' :
        timer.phase === 'shortBreak' ? 'Break over! Back to work.' :
        'Long break over! Ready to focus.';
      addToast(phaseLabel, timer.phase);
    }
  }, [timer.timerState]);

  // Phase change → break start sound
  useEffect(() => {
    if (prevPhaseRef.current !== timer.phase) {
      if (timer.phase === 'shortBreak' || timer.phase === 'longBreak') {
        audio.playBreakStart();
      }
      prevPhaseRef.current = timer.phase;
    }
  }, [timer.phase, audio]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          timer.toggle();
          audio.playClick();
          break;
        case 'Escape':
          if (settingsOpen) {
            setSettingsOpen(false);
          } else if (aboutOpen) {
            setAboutOpen(false);
          } else {
            timer.stop();
            audio.playClick();
          }
          break;
        case 's':
        case 'S':
          if (!settingsOpen) {
            setSettingsOpen(true);
            bringToFront(setSettingsZIndex);
            audio.playClick();
          }
          break;
        case '1':
          timer.setPhaseManually('work');
          audio.playClick();
          break;
        case '2':
          timer.setPhaseManually('shortBreak');
          audio.playClick();
          break;
        case '3':
          timer.setPhaseManually('longBreak');
          audio.playClick();
          break;
        case '=':
        case '+':
          timer.addTime(1);
          audio.playClick();
          break;
        case '-':
          timer.addTime(-1);
          audio.playClick();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timer, audio, settingsOpen, aboutOpen, bringToFront]);

  // Initialize audio on first click
  const handleFirstClick = useCallback(() => {
    if (!audio.initialized) {
      audio.initAudio();
      setSoundHint(false);
    }
  }, [audio]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClick = () => {
      setMenuOpen(null);
      setStartMenuOpen(false);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const totalDuration = (() => {
    switch (timer.phase) {
      case 'work': return timer.settings.workDuration * 60 * 1000;
      case 'shortBreak': return timer.settings.shortBreakDuration * 60 * 1000;
      case 'longBreak': return timer.settings.longBreakDuration * 60 * 1000;
    }
  })();

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ cursor: 'default' }}
      onClick={handleFirstClick}
    >
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src="/assets/bg-workspace.jpg"
          alt=""
          className="w-full h-full object-cover"
          style={{ filter: 'brightness(0.85)' }}
          draggable={false}
        />
      </div>

      {/* Desktop Icons */}
      <DesktopIcons onError={audio.playError} />

      {/* Sound Hint */}
      {soundHint && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[55]">
          <div className="bg-[#ffffcc] border border-black px-3 py-1 font-pixel text-[10px] shadow-md">
            Click anywhere to enable sound
          </div>
        </div>
      )}

      {/* Main Timer Window */}
      <Win98Window
        title="RetroFocus"
        icon="/assets/icon-hourglass.png"
        width={400}
        height={520}
        zIndex={mainZIndex}
        onClose={() => { /* minimize behavior - just flash */ }}
        onFocus={() => bringToFront(setMainZIndex)}
        showResizeHandle
      >
        <div className="flex flex-col h-full bg-[#c0c0c0]">
          {/* Menu Bar */}
          <div className="win98-menubar">
            {['File', 'View', 'Timer', 'Help'].map((item) => (
              <div
                key={item}
                className="relative"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(menuOpen === item ? null : item);
                }}
              >
                <div className={`win98-menuitem ${menuOpen === item ? 'active' : ''}`}>
                  {item}
                </div>
                {menuOpen === item && (
                  <div className="win98-dropdown" onClick={(e) => e.stopPropagation()}>
                    {item === 'File' && (
                      <>
                        <div className="win98-dropdown-item" onClick={() => { timer.stop(); setMenuOpen(null); audio.playClick(); }}>
                          <span>Reset Timer</span>
                        </div>
                        <div className="win98-dropdown-separator" />
                        <div className="win98-dropdown-item" onClick={() => { setMenuOpen(null); audio.playClick(); }}>
                          <span>Exit</span>
                        </div>
                      </>
                    )}
                    {item === 'View' && (
                      <>
                        <div className="win98-dropdown-item">
                          <span>Toolbar</span>
                          <span>✓</span>
                        </div>
                        <div className="win98-dropdown-item">
                          <span>Status Bar</span>
                          <span>✓</span>
                        </div>
                      </>
                    )}
                    {item === 'Timer' && (
                      <>
                        <div className="win98-dropdown-item" onClick={() => { timer.start(); setMenuOpen(null); audio.playClick(); }}>
                          <span>Start</span>
                          <span>F5</span>
                        </div>
                        <div className="win98-dropdown-item" onClick={() => { timer.pause(); setMenuOpen(null); audio.playClick(); }}>
                          <span>Pause</span>
                          <span>F6</span>
                        </div>
                        <div className="win98-dropdown-item" onClick={() => { timer.stop(); setMenuOpen(null); audio.playClick(); }}>
                          <span>Reset</span>
                          <span>F7</span>
                        </div>
                        <div className="win98-dropdown-separator" />
                        <div
                          className="win98-dropdown-item"
                          onClick={() => {
                            setSettingsOpen(true);
                            bringToFront(setSettingsZIndex);
                            setMenuOpen(null);
                            audio.playClick();
                          }}
                        >
                          <span>Settings...</span>
                        </div>
                      </>
                    )}
                    {item === 'Help' && (
                      <>
                        <div
                          className="win98-dropdown-item"
                          onClick={() => {
                            setAboutOpen(true);
                            bringToFront(setAboutZIndex);
                            setMenuOpen(null);
                            audio.playClick();
                          }}
                        >
                          <span>About RetroFocus...</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Timer Display Area */}
          <div className="flex-1 flex flex-col items-center justify-center bg-[#d4d0c8] m-1 win98-inset p-3">
            <TimerCanvas
              remainingMs={timer.remainingMs}
              totalMs={totalDuration}
              progress={timer.progress}
              phase={timer.phase}
              timerState={timer.timerState}
              phaseLabel={timer.getPhaseLabel(timer.phase)}
              phaseColor={timer.getPhaseColor(timer.phase, timer.timerState)}
              formatTime={timer.formatTime}
            />

            {/* Status Label */}
            <div
              className="mt-2 font-pixel text-[11px] uppercase tracking-[0.15em] font-medium"
              style={{ color: timer.getPhaseColor(timer.phase, timer.timerState) }}
            >
              {timer.timerState === 'paused' ? 'PAUSED' : timer.getPhaseLabel(timer.phase)}
            </div>

            {/* Toolbar */}
            <div className="flex gap-2 mt-3">
              {/* Play Button */}
              <button
                className={`w-10 h-9 win98-outset flex items-center justify-center ${timer.timerState === 'running' ? 'pressed' : ''}`}
                onClick={() => { timer.start(); audio.playClick(); }}
                onMouseEnter={(e) => showTooltip('Start (Space)', e.currentTarget.offsetLeft, e.currentTarget.offsetTop - 24)}
                onMouseLeave={hideTooltip}
                aria-label="Start"
              >
                <img src="/assets/icon-play.png" alt="" className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />
              </button>

              {/* Pause Button */}
              <button
                className={`w-10 h-9 win98-outset flex items-center justify-center ${timer.timerState === 'paused' ? 'pressed' : ''}`}
                onClick={() => { timer.pause(); audio.playClick(); }}
                onMouseEnter={(e) => showTooltip('Pause (Space)', e.currentTarget.offsetLeft, e.currentTarget.offsetTop - 24)}
                onMouseLeave={hideTooltip}
                aria-label="Pause"
              >
                <img src="/assets/icon-pause.png" alt="" className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />
              </button>

              {/* Stop Button */}
              <button
                className="w-10 h-9 win98-outset flex items-center justify-center"
                onClick={() => { timer.stop(); audio.playClick(); }}
                onMouseEnter={(e) => showTooltip('Stop (Esc)', e.currentTarget.offsetLeft, e.currentTarget.offsetTop - 24)}
                onMouseLeave={hideTooltip}
                aria-label="Stop"
              >
                <img src="/assets/icon-stop.png" alt="" className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />
              </button>

              {/* Settings Button */}
              <button
                className="w-10 h-9 win98-outset flex items-center justify-center"
                onClick={() => { setSettingsOpen(true); bringToFront(setSettingsZIndex); audio.playClick(); }}
                onMouseEnter={(e) => showTooltip('Settings (S)', e.currentTarget.offsetLeft, e.currentTarget.offsetTop - 24)}
                onMouseLeave={hideTooltip}
                aria-label="Settings"
              >
                <img src="/assets/icon-settings.png" alt="" className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />
              </button>
            </div>
          </div>

          {/* Session Info Bar */}
          <div className="h-6 flex items-center justify-between px-2 bg-[#c0c0c0] border-t border-[#a0a0a0]">
            <span className="font-pixel text-[11px]">
              Session: {timer.sessionCount} / {timer.settings.sessionsBeforeLongBreak}
            </span>
            <div className="win98-inset w-20 h-3 bg-white">
              <div
                className="h-full bg-[#000080] transition-all duration-300"
                style={{
                  width: `${Math.min(100, (timer.totalSessionsToday / Math.max(1, timer.settings.sessionsBeforeLongBreak * 2)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </Win98Window>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        zIndex={settingsZIndex}
        onFocus={() => bringToFront(setSettingsZIndex)}
        timerSettings={timer.settings}
        audioSettings={audio.settings}
        onUpdateTimer={timer.updateSettings}
        onUpdateAudio={audio.updateSettings}
        onTestChime={() => { audio.playTimerComplete(); }}
      />

      {/* About Dialog */}
      <AboutDialog
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        zIndex={aboutZIndex}
        onFocus={() => bringToFront(setAboutZIndex)}
      />

      {/* Toast Notifications */}
      <ToastNotification toasts={toasts} onDismiss={dismissToast} zIndex={200} />

      {/* Tooltip */}
      {tooltip && (
        <div
          className="win98-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Taskbar */}
      <Taskbar
        startMenuOpen={startMenuOpen}
        onToggleStart={() => setStartMenuOpen(!startMenuOpen)}
        mainWindowActive
        onFocusMain={() => bringToFront(setMainZIndex)}
      />
    </div>
  );
}
