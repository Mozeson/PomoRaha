import { useState, useCallback } from 'react';

interface DesktopIconData {
  id: string;
  label: string;
  icon: string;
}

const ICONS: DesktopIconData[] = [
  { id: 'mycomputer', label: 'My Computer', icon: '/assets/icon-mycomputer.png' },
  { id: 'recycle', label: 'Recycle Bin', icon: '/assets/icon-recycle.png' },
  { id: 'network', label: 'Network', icon: '/assets/icon-network.png' },
];

interface DesktopIconsProps {
  onError: () => void;
}

export function DesktopIcons({ onError }: DesktopIconsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = useCallback((id: string) => {
    setSelected(id);
    onError();
    setTimeout(() => setSelected(null), 200);
  }, [onError]);

  return (
    <div className="absolute top-6 left-6 flex flex-col gap-6 z-10">
      {ICONS.map((icon) => (
        <div
          key={icon.id}
          className={`desktop-icon ${selected === icon.id ? 'selected' : ''}`}
          onClick={() => handleClick(icon.id)}
        >
          <img
            src={icon.icon}
            alt={icon.label}
            className="w-8 h-8"
            style={{ imageRendering: 'pixelated' }}
            draggable={false}
          />
          <span className="desktop-icon-label">{icon.label}</span>
        </div>
      ))}
    </div>
  );
}
