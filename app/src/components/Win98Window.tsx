import { useRef, useState, useCallback, useEffect } from 'react';

interface Win98WindowProps {
  title: string;
  icon?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  onClose?: () => void;
  onFocus?: () => void;
  zIndex: number;
  active?: boolean;
  showResizeHandle?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Win98Window({
  title,
  icon,
  width,
  height,
  x: initialX,
  y: initialY,
  onClose,
  onFocus,
  zIndex,
  active = true,
  showResizeHandle = false,
  children,
  className = '',
}: Win98WindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: initialX ?? Math.max(0, (window.innerWidth - width) / 2),
    y: initialY ?? Math.max(0, (window.innerHeight - height) / 2),
  });
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    setDragging(true);
    onFocus?.();
  }, [onFocus]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging) return;
    const newX = e.clientX - dragOffsetRef.current.x;
    const newY = e.clientY - dragOffsetRef.current.y;
    const clampedX = Math.max(-width + 40, Math.min(newX, window.innerWidth - 40));
    const clampedY = Math.max(0, Math.min(newY, window.innerHeight - 20));
    setPos({ x: clampedX, y: clampedY });
  }, [dragging, width]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Touch support
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = windowRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragOffsetRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    };
    setDragging(true);
    onFocus?.();
  }, [onFocus]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const newX = touch.clientX - dragOffsetRef.current.x;
    const newY = touch.clientY - dragOffsetRef.current.y;
    const clampedX = Math.max(-width + 40, Math.min(newX, window.innerWidth - 40));
    const clampedY = Math.max(0, Math.min(newY, window.innerHeight - 20));
    setPos({ x: clampedX, y: clampedY });
  }, [dragging, width]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [dragging, handleTouchMove, handleTouchEnd]);

  return (
    <div
      ref={windowRef}
      className={`win98-window absolute ${className}`}
      style={{
        width,
        height,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        zIndex,
      }}
      onMouseDown={onFocus}
    >
      {/* Title Bar */}
      <div
        className={`win98-titlebar ${!active ? 'inactive' : ''}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {icon && (
            <img src={icon} alt="" className="w-4 h-4 flex-shrink-0" style={{ imageRendering: 'pixelated' }} />
          )}
          <span className="win98-title-text">{title}</span>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button className="win98-sysbtn" aria-label="Minimize" onClick={onClose}>
            <span style={{ marginTop: '-3px' }}>_</span>
          </button>
          <button className="win98-sysbtn" aria-label="Maximize">
            <span style={{ fontSize: '8px' }}>□</span>
          </button>
          <button className="win98-sysbtn" aria-label="Close" onClick={onClose}>
            <span>×</span>
          </button>
        </div>
      </div>

      {/* Window Body */}
      <div className="flex flex-col" style={{ height: `calc(100% - ${22}px)` }}>
        {children}
      </div>

      {/* Resize Handle */}
      {showResizeHandle && <div className="resize-handle" />}
    </div>
  );
}
