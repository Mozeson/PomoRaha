import { useState } from 'react';
import { Win98Window } from './Win98Window';
import type { TimerSettings } from '../hooks/useTimer';
import type { AudioSettings } from '../hooks/useAudio';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  zIndex: number;
  onFocus: () => void;
  timerSettings: TimerSettings;
  audioSettings: AudioSettings;
  onUpdateTimer: (s: TimerSettings) => void;
  onUpdateAudio: (s: AudioSettings) => void;
  onTestChime: () => void;
}

type TabId = 'timer' | 'sound' | 'about';

export function SettingsDialog({
  open,
  onClose,
  zIndex,
  onFocus,
  timerSettings,
  audioSettings,
  onUpdateTimer,
  onUpdateAudio,
  onTestChime,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('timer');
  const [localTimer, setLocalTimer] = useState(timerSettings);
  const [localAudio, setLocalAudio] = useState(audioSettings);

  if (!open) return null;

  const handleOk = () => {
    onUpdateTimer(localTimer);
    onUpdateAudio(localAudio);
    onClose();
  };

  const handleCancel = () => {
    setLocalTimer(timerSettings);
    setLocalAudio(audioSettings);
    onClose();
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'timer', label: 'Timer' },
    { id: 'sound', label: 'Sound' },
    { id: 'about', label: 'About' },
  ];

  return (
    <Win98Window
      title="Settings"
      icon="/assets/icon-hourglass.png"
      width={300}
      height={380}
      zIndex={zIndex}
      onClose={handleCancel}
      onFocus={onFocus}
      x={typeof window !== 'undefined' ? Math.max(0, (window.innerWidth - 300) / 2 + 20) : 20}
      y={typeof window !== 'undefined' ? Math.max(0, (window.innerHeight - 380) / 2 + 20) : 20}
    >
      <div className="flex flex-col h-full bg-[#c0c0c0]">
        {/* Tab Bar */}
        <div className="flex px-2 pt-1 gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`win98-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="win98-tab-content flex-1 overflow-auto">
          {activeTab === 'timer' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="font-pixel text-[11px]">Work Duration (min)</label>
                <input
                  type="number"
                  className="win98-input w-20 text-right"
                  min={1}
                  max={60}
                  value={localTimer.workDuration}
                  onChange={(e) => setLocalTimer({ ...localTimer, workDuration: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="font-pixel text-[11px]">Short Break (min)</label>
                <input
                  type="number"
                  className="win98-input w-20 text-right"
                  min={1}
                  max={30}
                  value={localTimer.shortBreakDuration}
                  onChange={(e) => setLocalTimer({ ...localTimer, shortBreakDuration: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="font-pixel text-[11px]">Long Break (min)</label>
                <input
                  type="number"
                  className="win98-input w-20 text-right"
                  min={1}
                  max={60}
                  value={localTimer.longBreakDuration}
                  onChange={(e) => setLocalTimer({ ...localTimer, longBreakDuration: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="font-pixel text-[11px]">Sessions Before Long Break</label>
                <input
                  type="number"
                  className="win98-input w-20 text-right"
                  min={2}
                  max={10}
                  value={localTimer.sessionsBeforeLongBreak}
                  onChange={(e) => setLocalTimer({ ...localTimer, sessionsBeforeLongBreak: Math.max(2, Math.min(10, parseInt(e.target.value) || 4)) })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="win98-checkbox"
                  checked={localTimer.autoStartBreaks}
                  onChange={(e) => setLocalTimer({ ...localTimer, autoStartBreaks: e.target.checked })}
                  id="autostart-breaks"
                />
                <label htmlFor="autostart-breaks" className="font-pixel text-[11px] cursor-pointer">Auto-start Breaks</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="win98-checkbox"
                  checked={localTimer.autoStartWork}
                  onChange={(e) => setLocalTimer({ ...localTimer, autoStartWork: e.target.checked })}
                  id="autostart-work"
                />
                <label htmlFor="autostart-work" className="font-pixel text-[11px] cursor-pointer">Auto-start Work</label>
              </div>
            </div>
          )}

          {activeTab === 'sound' && (
            <div className="flex flex-col gap-3">
              <div className="win98-groupbox">
                <span className="win98-groupbox-label">Volume</span>
                <input
                  type="range"
                  className="win98-slider w-full"
                  min={0}
                  max={100}
                  value={localAudio.volume * 100}
                  onChange={(e) => setLocalAudio({ ...localAudio, volume: parseInt(e.target.value) / 100 })}
                />
              </div>
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="win98-checkbox"
                    checked={localAudio.enableTimerSounds}
                    onChange={(e) => setLocalAudio({ ...localAudio, enableTimerSounds: e.target.checked })}
                    id="enable-timer"
                  />
                  <label htmlFor="enable-timer" className="font-pixel text-[11px] cursor-pointer">Enable Timer Sounds</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="win98-checkbox"
                    checked={localAudio.enableUiSounds}
                    onChange={(e) => setLocalAudio({ ...localAudio, enableUiSounds: e.target.checked })}
                    id="enable-ui"
                  />
                  <label htmlFor="enable-ui" className="font-pixel text-[11px] cursor-pointer">Enable UI Click Sounds</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="win98-checkbox"
                    checked={localAudio.enableNotificationSounds}
                    onChange={(e) => setLocalAudio({ ...localAudio, enableNotificationSounds: e.target.checked })}
                    id="enable-notif"
                  />
                  <label htmlFor="enable-notif" className="font-pixel text-[11px] cursor-pointer">Enable Notification Sounds</label>
                </div>
              </div>
              <div className="mt-2">
                <button className="win98-btn" onClick={onTestChime}>
                  Test Chime
                </button>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div className="flex flex-col items-center gap-2 text-center">
              <img
                src="/assets/icon-hourglass.png"
                alt="RetroFocus"
                className="w-12 h-12"
                style={{ imageRendering: 'pixelated' }}
              />
              <h2 className="font-pixel text-[14px] font-bold">RetroFocus &apos;98</h2>
              <p className="font-pixel text-[10px] text-[#404040]">Version 1.0</p>
              <p className="font-inter text-[11px] text-[#404040] mt-1 leading-relaxed">
                A pomodoro timer for focused work sessions.<br />
                Styled after Windows 98.
              </p>
              <div className="mt-2 font-pixel text-[10px] text-[#808080] space-y-1">
                <p>Running on: ReactOS 4.0</p>
                <p>Memory: 64MB RAM</p>
              </div>
              <p className="font-pixel text-[10px] text-[#808080] mt-2 italic">
                &ldquo;Stay focused. Stay retro.&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 p-3 bg-[#c0c0c0]">
          <button className="win98-btn" onClick={handleOk}>
            OK
          </button>
          <button className="win98-btn" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </Win98Window>
  );
}
