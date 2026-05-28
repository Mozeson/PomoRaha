import { useState, useEffect } from 'react';

interface TaskbarProps {
  startMenuOpen: boolean;
  onToggleStart: () => void;
  mainWindowActive: boolean;
  onFocusMain: () => void;
}

export function Taskbar({ startMenuOpen, onToggleStart, mainWindowActive, onFocusMain }: TaskbarProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div className="taskbar">
      {/* Start Button */}
      <button
        className={`start-btn ${startMenuOpen ? 'pressed' : ''}`}
        onClick={onToggleStart}
      >
        <img
          src="/assets/icon-windows-flag.png"
          alt=""
          className="w-4 h-4"
          style={{ imageRendering: 'pixelated' }}
        />
        <span>Start</span>
      </button>

      {/* Divider */}
      <div className="taskbar-divider" />

      {/* Quick Launch */}
      <div className="hidden sm:flex items-center gap-[2px]">
        <button className="w-[22px] h-[22px] win98-outset flex items-center justify-center p-[1px]">
          <svg width="14" height="14" viewBox="0 0 16 16">
            <rect x="1" y="1" width="6" height="6" fill="#808080" />
            <rect x="9" y="1" width="6" height="6" fill="#808080" />
            <rect x="1" y="9" width="6" height="6" fill="#808080" />
            <rect x="9" y="9" width="6" height="6" fill="#808080" />
          </svg>
        </button>
        <button className="w-[22px] h-[22px] win98-outset flex items-center justify-center p-[1px]">
          <svg width="14" height="14" viewBox="0 0 16 16">
            <polygon points="4,2 14,8 4,14" fill="#000080" />
          </svg>
        </button>
        <button className="w-[22px] h-[22px] win98-outset flex items-center justify-center p-[1px]">
          <svg width="14" height="14" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#0000ff" strokeWidth="2" />
            <ellipse cx="8" cy="8" rx="8" ry="3" fill="none" stroke="#0000ff" strokeWidth="1" transform="rotate(-20 8 8)" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div className="taskbar-divider hidden sm:block" />

      {/* Task Buttons */}
      <button
        className={`taskbar-btn hidden sm:flex ${mainWindowActive ? 'active' : ''}`}
        onClick={onFocusMain}
      >
        <img
          src="/assets/icon-hourglass.png"
          alt=""
          className="w-4 h-4"
          style={{ imageRendering: 'pixelated' }}
        />
        <span className="truncate">RetroFocus</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* System Tray */}
      <div className="system-tray">
        {/* Speaker Icon */}
        <svg width="14" height="14" viewBox="0 0 16 16">
          <polygon points="3,5 7,5 11,2 11,14 7,11 3,11" fill="#404040" />
          <line x1="13" y1="5" x2="13" y2="11" stroke="#404040" strokeWidth="1.5" />
        </svg>
        {/* Clock */}
        <span className="font-vt323 text-[13px] text-black tabular-nums">{timeStr}</span>
      </div>

      {/* Start Menu Dropdown */}
      {startMenuOpen && (
        <div className="absolute bottom-[28px] left-0 w-48 bg-[#c0c0c0] win98-outset z-[100]">
          {/* Sidebar */}
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-[#000080] flex items-center justify-center">
            <span
              className="text-white font-pixel text-[14px] font-bold tracking-widest"
              style={{
                writingMode: 'vertical-rl',
                transform: 'rotate(180deg)',
                textOrientation: 'mixed',
              }}
            >
              Windows 98
            </span>
          </div>
          <div className="ml-6 py-1">
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Programs</span>
              <span className="ml-auto">▸</span>
            </div>
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Documents</span>
              <span className="ml-auto">▸</span>
            </div>
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Settings</span>
              <span className="ml-auto">▸</span>
            </div>
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Find</span>
              <span className="ml-auto">▸</span>
            </div>
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Help</span>
            </div>
            <div className="mx-2 my-1 border-t border-[#808080] border-b border-white" />
            <div className="px-3 py-1 font-pixel text-[11px] cursor-default hover:bg-[#000080] hover:text-white flex items-center gap-2">
              <span>Shut Down...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
