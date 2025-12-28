
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppStatus } from './types';
import SnowGlass from './components/SnowGlass';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSymmetry, setIsSymmetry] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const startCamera = async () => {
    setStatus(AppStatus.LOADING);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setStatus(AppStatus.READY);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('无法访问摄像头，请检查权限。');
      setStatus(AppStatus.ERROR);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950 flex items-center justify-center text-white selection:bg-cyan-500/30">
      {/* Hidden Video for MediaPipe Source */}
      <video
        ref={videoRef}
        className="hidden"
        autoPlay
        playsInline
        muted
      />

      {status === AppStatus.IDLE && (
        <div className="flex flex-col items-center gap-8 z-50 animate-in fade-in zoom-in duration-1000">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-extralight tracking-[0.2em] mb-4 text-zinc-100">
              SNOW GLASS
            </h1>
            <p className="text-zinc-500 font-light tracking-widest text-sm">
              哈 气 雪 花 镜
            </p>
          </div>
          <button
            onClick={startCamera}
            className="group relative px-12 py-4 overflow-hidden border border-zinc-700 rounded-full hover:border-cyan-500/50 transition-all duration-500"
          >
            <div className="absolute inset-0 bg-white/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
            <span className="relative tracking-[0.5em] text-sm font-light">开启摄像头</span>
          </button>
        </div>
      )}

      {status === AppStatus.LOADING && (
        <div className="z-50 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-t border-cyan-500 rounded-full animate-spin mb-4" />
          <p className="text-zinc-500 tracking-widest text-xs animate-pulse">
            等待摄像头就绪...
          </p>
        </div>
      )}

      {status === AppStatus.ERROR && (
        <div className="z-50 text-center px-6">
          <p className="text-red-400 font-light tracking-widest mb-6">{errorMessage}</p>
          <button onClick={() => window.location.reload()} className="text-zinc-500 underline text-xs tracking-widest">
            刷新重试
          </button>
        </div>
      )}

      {status === AppStatus.READY && videoRef.current && (
        <SnowGlass 
          videoSource={videoRef.current} 
          isSymmetry={isSymmetry} 
          onToggleSymmetry={() => setIsSymmetry(!isSymmetry)}
        />
      )}

      {/* Footer Branding */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 opacity-30 select-none pointer-events-none">
        <p className="text-[10px] tracking-[0.8em] font-light text-white">INTERACTIVE INSTALLATION</p>
      </div>
    </div>
  );
};

export default App;
