import { useRef, useEffect, useCallback } from 'react';
import type { TimerPhase, TimerState } from '../hooks/useTimer';

interface TimerCanvasProps {
  remainingMs: number;
  totalMs: number;
  progress: number;
  phase: TimerPhase;
  timerState: TimerState;
  phaseLabel: string;
  phaseColor: string;
  formatTime: (ms: number) => string;
}

const CANVAS_SIZE = 280;
const CX = 140;
const CY = 140;

export function TimerCanvas({
  remainingMs,
  progress,
  phase,
  timerState,
  phaseLabel,
  phaseColor,
  formatTime,
}: TimerCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== CANVAS_SIZE * dpr) {
      canvas.width = CANVAS_SIZE * dpr;
      canvas.height = CANVAS_SIZE * dpr;
      ctx.scale(dpr, dpr);
    }

    // Clear
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 1. Outer Shadow Ring
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(CX, CY, 130, 0, Math.PI * 2);
    ctx.fillStyle = '#a0a0a0';
    ctx.fill();
    ctx.restore();

    // 2. Main Body Ring
    ctx.beginPath();
    ctx.arc(CX, CY, 130, 0, Math.PI * 2);
    ctx.fillStyle = '#b8b8b8';
    ctx.fill();

    // 3. Brushed-Metal Texture Ring
    const metalGrad = ctx.createConicGradient(0, CX, CY);
    metalGrad.addColorStop(0, '#e0e0e0');
    metalGrad.addColorStop(0.15, '#c0c0c0');
    metalGrad.addColorStop(0.3, '#e8e8e8');
    metalGrad.addColorStop(0.5, '#b0b0b0');
    metalGrad.addColorStop(0.7, '#e0e0e0');
    metalGrad.addColorStop(0.85, '#d0d0d0');
    metalGrad.addColorStop(1, '#c0c0c0');

    ctx.beginPath();
    ctx.arc(CX, CY, 120, 0, Math.PI * 2);
    ctx.fillStyle = metalGrad;
    ctx.fill();

    // Brushed metal grooves
    ctx.strokeStyle = '#a0a0a0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 72; i++) {
      const angle = (i * 5 * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(angle) * 110, CY + Math.sin(angle) * 110);
      ctx.lineTo(CX + Math.cos(angle) * 120, CY + Math.sin(angle) * 120);
      ctx.stroke();
    }

    // 4. Inner Recess Ring
    ctx.beginPath();
    ctx.arc(CX, CY, 110, 0, Math.PI * 2);
    ctx.fillStyle = '#808080';
    ctx.fill();

    // 5. Clock Face
    ctx.beginPath();
    ctx.arc(CX, CY, 105, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f0e0';
    ctx.fill();

    // Face dome gradient overlay
    const faceGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, 105);
    faceGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
    faceGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.beginPath();
    ctx.arc(CX, CY, 105, 0, Math.PI * 2);
    ctx.fillStyle = faceGrad;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 6. Tick Marks
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6 - 90) * (Math.PI / 180);
      const isMajor = i % 5 === 0;
      const tickLen = isMajor ? 8 : 4;
      const tickWidth = isMajor ? 2 : 1;
      const tickColor = isMajor ? '#333333' : '#888888';

      ctx.strokeStyle = tickColor;
      ctx.lineWidth = tickWidth;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(angle) * 95, CY + Math.sin(angle) * 95);
      ctx.lineTo(CX + Math.cos(angle) * (95 - tickLen), CY + Math.sin(angle) * (95 - tickLen));
      ctx.stroke();
    }

    // 7. Progress Arc
    // Background track
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(CX, CY, 82, -Math.PI / 2, (Math.PI * 3) / 2);
    ctx.stroke();

    // Active arc
    const endAngle = -Math.PI / 2 + (Math.PI * 2 * progress);
    ctx.strokeStyle = phaseColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // Glow
    ctx.save();
    ctx.shadowColor = phaseColor;
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(CX, CY, 82, -Math.PI / 2, endAngle);
    ctx.stroke();
    ctx.restore();

    // Main arc
    ctx.beginPath();
    ctx.arc(CX, CY, 82, -Math.PI / 2, endAngle);
    ctx.stroke();

    // 8. Knob / Winder (top)
    ctx.save();
    ctx.translate(CX, CY - 10);
    // Knob shadow
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fillStyle = '#a0a0a0';
    ctx.fill();
    // Knob body
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    const knobGrad = ctx.createLinearGradient(-10, -10, 10, 10);
    knobGrad.addColorStop(0, '#ffffff');
    knobGrad.addColorStop(0.5, '#d0d0d0');
    knobGrad.addColorStop(1, '#808080');
    ctx.fillStyle = knobGrad;
    ctx.fill();
    // Knob center
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#909090';
    ctx.fill();
    ctx.restore();

    // 9. Digital Readout Panel
    ctx.save();
    // Inset LCD panel
    ctx.beginPath();
    ctx.arc(CX, CY, 40, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.fill();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // LCD panel inset effect
    const lcdGrad = ctx.createRadialGradient(CX - 5, CY - 5, 0, CX, CY, 40);
    lcdGrad.addColorStop(0, 'rgba(30,30,30,1)');
    lcdGrad.addColorStop(1, 'rgba(10,10,10,1)');
    ctx.beginPath();
    ctx.arc(CX, CY, 39, 0, Math.PI * 2);
    ctx.fillStyle = lcdGrad;
    ctx.fill();

    // Time text
    const timeStr = formatTime(remainingMs);

    // Paused pulse effect
    let textOpacity = 1;
    if (timerState === 'paused') {
      textOpacity = 0.7 + 0.3 * Math.sin((Date.now() / 1500) * Math.PI * 2);
    }

    ctx.globalAlpha = textOpacity;
    ctx.font = '32px VT323, monospace';
    ctx.fillStyle = phaseColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, CX, CY - 2);

    // MIN:SEC label
    ctx.font = '8px VT323, monospace';
    ctx.fillStyle = '#555555';
    ctx.fillText('MIN : SEC', CX, CY + 18);
    ctx.globalAlpha = 1;
    ctx.restore();

    // 10. Phase Label
    ctx.font = '9px Pixelify Sans, sans-serif';
    ctx.fillStyle = phaseColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(phaseLabel, CX, CY + 58);

  }, [remainingMs, progress, phase, timerState, phaseLabel, phaseColor, formatTime]);

  // Animation loop
  useEffect(() => {
    const loop = () => {
      draw();
      if (timerState === 'running' || timerState === 'paused') {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    loop();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw, timerState]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        imageRendering: 'auto',
      }}
    />
  );
}
