import { useEffect, useState } from 'react';

interface Toast {
  id: number;
  message: string;
  phase: 'work' | 'shortBreak' | 'longBreak';
}

interface ToastNotificationProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  zIndex: number;
}

export function ToastNotification({ toasts, onDismiss, zIndex }: ToastNotificationProps) {
  return (
    <div className="fixed bottom-10 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast, index) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          zIndex={zIndex + index}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  zIndex,
  onDismiss,
}: {
  toast: Toast;
  zIndex: number;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showTimeout = setTimeout(() => setVisible(true), 50);
    const dismissTimeout = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 400);
    }, 5000);

    return () => {
      clearTimeout(showTimeout);
      clearTimeout(dismissTimeout);
    };
  }, [toast.id, onDismiss]);

  const phaseColor = toast.phase === 'work' ? '#ff4444' : toast.phase === 'shortBreak' ? '#44aa44' : '#4488ff';

  return (
    <div
      className="pointer-events-auto"
      style={{
        width: 220,
        transform: visible ? 'translateY(0)' : 'translateY(80px)',
        opacity: visible ? 1 : 0,
        transition: 'all 400ms ease-out',
        zIndex,
      }}
    >
      <div className="win98-window" style={{ boxShadow: '2px 2px 8px rgba(0,0,0,0.3)' }}>
        {/* Mini title bar */}
        <div className="h-[18px] bg-[#000080] flex items-center justify-between px-1">
          <span className="font-pixel text-[10px] text-white font-semibold">Notification</span>
          <button
            className="w-3 h-3 flex items-center justify-center text-white text-[8px] font-bold leading-none"
            onClick={() => {
              setVisible(false);
              setTimeout(() => onDismiss(toast.id), 400);
            }}
          >
            ×
          </button>
        </div>
        <div className="flex items-center gap-2 p-2 bg-[#c0c0c0]">
          <div
            className="w-4 h-4 rounded-full flex-shrink-0"
            style={{ backgroundColor: phaseColor }}
          />
          <p className="font-pixel text-[10px] text-black leading-tight">{toast.message}</p>
        </div>
      </div>
    </div>
  );
}

export type { Toast };
