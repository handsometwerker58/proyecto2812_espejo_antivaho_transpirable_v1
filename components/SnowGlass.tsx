
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Point, Snowflake } from '../types';

interface SnowGlassProps {
  videoSource: HTMLVideoElement;
  isSymmetry: boolean;
  onToggleSymmetry: () => void;
}

const SnowGlass: React.FC<SnowGlassProps> = ({ videoSource, isSymmetry, onToggleSymmetry }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const requestRef = useRef<number>();
  
  // States for UI
  const [breathIntensity, setBreathIntensity] = useState<number>(0);
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [peaceDetected, setPeaceDetected] = useState<boolean>(false);
  
  // Tracking refs
  const mouthPos = useRef<Point>({ x: 0.5, y: 0.5 });
  const indexTipPos = useRef<Point | null>(null);
  const smoothedIndexTip = useRef<Point | null>(null);
  const handPresenceTime = useRef<number>(0);
  const snowflakes = useRef<Snowflake[]>([]);
  const lastTime = useRef<number>(0);
  const isBreathingManual = useRef<boolean>(false);

  // Constants
  const FOG_OPACITY_LIMIT = 0.85;
  const SMOOTHING_FACTOR = 0.15;
  const WIPE_DELAY_MS = 1000;
  const SNOW_COUNT = 60;

  // Init Snow
  useEffect(() => {
    const arr: Snowflake[] = [];
    for (let i = 0; i < SNOW_COUNT; i++) {
      arr.push({
        x: Math.random() * 1920,
        y: Math.random() * 1080,
        size: 1 + Math.random() * 3,
        speed: 0.5 + Math.random() * 1.5,
        opacity: 0.2 + Math.random() * 0.5,
        wind: (Math.random() - 0.5) * 0.5
      });
    }
    snowflakes.current = arr;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') isBreathingManual.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') isBreathingManual.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // MediaPipe Setup
  useEffect(() => {
    const hands = new window.Hands({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    const faceMesh = new window.FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results: any) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandDetected(true);
        const landmarks = results.multiHandLandmarks[0];
        indexTipPos.current = { x: landmarks[8].x, y: landmarks[8].y };
        
        // Gesture check: Peace Sign (✌️)
        // Check if index(8) and middle(12) are up, and others are down
        const isIndexUp = landmarks[8].y < landmarks[6].y;
        const isMiddleUp = landmarks[12].y < landmarks[10].y;
        const isRingDown = landmarks[16].y > landmarks[14].y;
        const isPinkyDown = landmarks[20].y > landmarks[18].y;
        setPeaceDetected(isIndexUp && isMiddleUp && isRingDown && isPinkyDown);
      } else {
        setHandDetected(false);
        setPeaceDetected(false);
        indexTipPos.current = null;
        handPresenceTime.current = 0;
      }
    });

    faceMesh.onResults((results: any) => {
      if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        // Landmarks 13 and 14 are upper and lower inner lips
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const dist = Math.sqrt(Math.pow(upperLip.x - lowerLip.x, 2) + Math.pow(upperLip.y - lowerLip.y, 2));
        
        // Map distance to intensity (typical open mouth is ~0.05 - 0.1)
        const intensity = Math.min(Math.max((dist - 0.01) * 15, 0), 1);
        setBreathIntensity(intensity);
        
        // Average mouth center
        mouthPos.current = {
          x: (landmarks[13].x + landmarks[14].x) / 2,
          y: (landmarks[13].y + landmarks[14].y) / 2,
        };
      } else {
        setBreathIntensity(0);
      }
    });

    const camera = new window.Camera(videoSource, {
      onFrame: async () => {
        await hands.send({ image: videoSource });
        await faceMesh.send({ image: videoSource });
      },
      width: 1280,
      height: 720
    });
    camera.start();

    return () => {
      camera.stop();
      hands.close();
      faceMesh.close();
    };
  }, [videoSource]);

  // Main Animation Loop
  const animate = useCallback((time: number) => {
    if (!canvasRef.current || !videoSource) return;
    const ctx = canvasRef.current.getContext('2d');
    const fCtx = fogCanvasRef.current.getContext('2d');
    if (!ctx || !fCtx) return;

    const { width, height } = canvasRef.current;

    // 1. Draw Background (Video)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-width, 0);
    ctx.filter = 'blur(3px) brightness(0.65) contrast(1.1)';
    ctx.drawImage(videoSource, 0, 0, width, height);
    ctx.restore();

    // 2. Draw Glass Shine Overlay
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 3. Handle Fog Accumulation (Breath)
    const effectiveIntensity = Math.max(breathIntensity, isBreathingManual.current ? 0.8 : 0);
    if (effectiveIntensity > 0.1) {
      const x = (1 - mouthPos.current.x) * width; // Mirrored
      const y = mouthPos.current.y * height;
      const radius = 100 + effectiveIntensity * 150;
      
      const fogGrad = fCtx.createRadialGradient(x, y, 0, x, y, radius);
      const alpha = effectiveIntensity * 0.04;
      fogGrad.addColorStop(0, `rgba(200, 220, 240, ${alpha})`);
      fogGrad.addColorStop(0.6, `rgba(200, 220, 240, ${alpha * 0.4})`);
      fogGrad.addColorStop(1, 'rgba(200, 220, 240, 0)');
      
      fCtx.globalCompositeOperation = 'source-over';
      fCtx.fillStyle = fogGrad;
      fCtx.beginPath();
      fCtx.arc(x, y, radius, 0, Math.PI * 2);
      fCtx.fill();
    }

    // 4. Handle Hand Wiping
    if (indexTipPos.current) {
      if (handPresenceTime.current === 0) handPresenceTime.current = performance.now();
      
      const elapsed = performance.now() - handPresenceTime.current;
      if (elapsed > WIPE_DELAY_MS) {
        // Smoothing
        const targetX = (1 - indexTipPos.current.x) * width;
        const targetY = indexTipPos.current.y * height;
        
        if (!smoothedIndexTip.current) {
          smoothedIndexTip.current = { x: targetX, y: targetY };
        } else {
          smoothedIndexTip.current.x += (targetX - smoothedIndexTip.current.x) * SMOOTHING_FACTOR;
          smoothedIndexTip.current.y += (targetY - smoothedIndexTip.current.y) * SMOOTHING_FACTOR;
        }

        const wipe = (wx: number, wy: number) => {
          fCtx.globalCompositeOperation = 'destination-out';
          const wipeRadius = 45;
          const wipeGrad = fCtx.createRadialGradient(wx, wy, wipeRadius * 0.2, wx, wy, wipeRadius);
          wipeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
          wipeGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.4)');
          wipeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          fCtx.fillStyle = wipeGrad;
          fCtx.beginPath();
          fCtx.arc(wx, wy, wipeRadius, 0, Math.PI * 2);
          fCtx.fill();
        };

        wipe(smoothedIndexTip.current.x, smoothedIndexTip.current.y);
        if (isSymmetry) {
          wipe(width - smoothedIndexTip.current.x, smoothedIndexTip.current.y);
        }
      }
    } else {
      smoothedIndexTip.current = null;
    }

    // 5. Draw the Fog Layer onto Main Canvas
    ctx.save();
    ctx.globalAlpha = FOG_OPACITY_LIMIT;
    ctx.drawImage(fogCanvasRef.current, 0, 0);
    ctx.restore();

    // 6. Draw Falling Snow
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    snowflakes.current.forEach(s => {
      ctx.globalAlpha = s.opacity;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      
      s.y += s.speed;
      s.x += s.wind;
      if (s.y > height) {
        s.y = -10;
        s.x = Math.random() * width;
      }
    });

    // 7. Peace Sign Easter Egg
    if (peaceDetected) {
        ctx.save();
        ctx.font = 'light 200px serif';
        ctx.textAlign = 'center';
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = 'white';
        ctx.fillText('✌️', width/2, height/2 + 70);
        ctx.restore();
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [videoSource, breathIntensity, isSymmetry, peaceDetected]);

  useEffect(() => {
    const resize = () => {
      if (!canvasRef.current) return;
      canvasRef.current.width = window.innerWidth;
      canvasRef.current.height = window.innerHeight;
      fogCanvasRef.current.width = window.innerWidth;
      fogCanvasRef.current.height = window.innerHeight;
      
      // Re-fill fog slightly on resize if it's empty, or keep state
      const fCtx = fogCanvasRef.current.getContext('2d');
      if (fCtx) {
          fCtx.fillStyle = 'rgba(200, 220, 240, 0.15)';
          fCtx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', resize);
    resize();
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener('resize', resize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  return (
    <div className="relative w-full h-full cursor-none overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* UI Overlay */}
      <div className="absolute top-8 left-8 flex flex-col gap-4 z-50">
        <div className="glass-ui px-6 py-4 rounded-2xl flex flex-col gap-1 min-w-[160px]">
          <span className="text-[10px] text-zinc-500 tracking-widest uppercase font-medium">Breath Status</span>
          <div className="flex items-end gap-2 h-8">
            <span className="text-2xl font-light tracking-tighter text-cyan-100">
              {Math.round(breathIntensity * 100)}%
            </span>
            <div className="flex-1 h-[2px] bg-white/10 mb-2 overflow-hidden rounded-full">
              <div 
                className="h-full bg-cyan-400 transition-all duration-300" 
                style={{ width: `${breathIntensity * 100}%` }} 
              />
            </div>
          </div>
        </div>

        <button 
          onClick={onToggleSymmetry}
          className={`glass-ui px-6 py-3 rounded-2xl text-[10px] tracking-[0.2em] uppercase font-light transition-all duration-500 ${isSymmetry ? 'text-cyan-400 border-cyan-500/30' : 'text-zinc-400'}`}
        >
          {isSymmetry ? 'Symmetry: ON' : 'Symmetry: OFF'}
        </button>
      </div>

      <div className="absolute top-8 right-8 z-50 glass-ui px-4 py-2 rounded-full text-[10px] text-zinc-500 tracking-widest font-light">
        {handDetected ? (
           <span className="text-cyan-400 animate-pulse">● TRACKING HAND</span>
        ) : (
           <span>○ WAITING FOR HAND</span>
        )}
      </div>

      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        <p className="text-[10px] text-zinc-500 tracking-[0.3em] font-light animate-bounce">
          {handDetected ? 'WIPE GLASS WITH INDEX FINGER' : 'OPEN MOUTH TO BREATHE ON GLASS'}
        </p>
        <p className="text-[9px] text-zinc-600 tracking-[0.1em] font-light">
            PRESS [SPACE] TO MANUAL BREATHE
        </p>
      </div>
    </div>
  );
};

export default SnowGlass;
