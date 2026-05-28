import { Win98Window } from './Win98Window';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  zIndex: number;
  onFocus: () => void;
}

export function AboutDialog({ open, onClose, zIndex, onFocus }: AboutDialogProps) {
  if (!open) return null;

  return (
    <Win98Window
      title="About RetroFocus"
      icon="/assets/icon-hourglass.png"
      width={280}
      height={200}
      zIndex={zIndex}
      onClose={onClose}
      onFocus={onFocus}
      x={typeof window !== 'undefined' ? (window.innerWidth - 280) / 2 : 0}
      y={typeof window !== 'undefined' ? (window.innerHeight - 200) / 2 : 0}
    >
      <div className="flex flex-col items-center justify-center h-full gap-3 bg-[#c0c0c0] p-4">
        <img
          src="/assets/icon-hourglass.png"
          alt="RetroFocus"
          className="w-10 h-10"
          style={{ imageRendering: 'pixelated' }}
        />
        <h2 className="font-pixel text-[13px] font-bold">RetroFocus &apos;98</h2>
        <p className="font-pixel text-[10px] text-[#404040]">Version 1.0</p>
        <p className="font-pixel text-[11px] text-[#404040] italic">
          &ldquo;Stay focused. Stay retro.&rdquo;
        </p>
        <button className="win98-btn mt-2" onClick={onClose}>
          OK
        </button>
      </div>
    </Win98Window>
  );
}
