import { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Maximize, Minimize, Camera, CameraOff, Mic, MicOff, BarChart2, X } from 'lucide-react';
import Webcam from 'react-webcam';
import { useTimer } from './hooks/useTimer';
import { useIdle } from './hooks/useIdle';
import { useActivityDetection } from './hooks/useActivityDetection';
import { useAudioDetection } from './hooks/useAudioDetection';
import { formatTime } from './utils/formatTime';
import './App.css';

type AppState = 'FOCUSED' | 'PAUSED' | 'DISTRACTED';

export interface DistractionEvent {
  timestamp: number;
  duration: number;
  reason: string;
}

function App() {
  const { seconds, start, pause, reset } = useTimer();
  const { isIdle, resetIdleTimer } = useIdle(60000); // 1 minute idle timeout
  
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  
  const { isNoisy, audioDistraction, isAudioModelLoaded, isSpeechDetected } = useAudioDetection(isMicEnabled, 15);
  const { webcamRef, isModelLoaded: isCamLoaded, isDistracted: isCamDistracted, distractionReason: camReason } = useActivityDetection(isCameraEnabled, isNoisy, isSpeechDetected, 8000);
  
  const [appState, setAppState] = useState<AppState>('PAUSED');
  const [dailyTotal, setDailyTotal] = useState(0);
  const [distractions, setDistractions] = useState<DistractionEvent[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const distractionStartRef = useRef<number | null>(null);
  const distractionReasonRef = useRef<string | null>(null);

  // Load daily total on mount
  useEffect(() => {
    const today = new Date().toDateString();
    const storedData = localStorage.getItem('studyTimerData');
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        if (parsed.date === today) {
          setDailyTotal(parsed.total);
          setDistractions(parsed.distractions || []);
        } else {
          localStorage.setItem('studyTimerData', JSON.stringify({ date: today, total: 0, distractions: [] }));
        }
      } catch (e) {
        localStorage.setItem('studyTimerData', JSON.stringify({ date: today, total: 0, distractions: [] }));
      }
    } else {
      localStorage.setItem('studyTimerData', JSON.stringify({ date: today, total: 0, distractions: [] }));
    }
  }, []);

  // Update total daily time periodically when focused
  useEffect(() => {
    let interval: number;
    if (appState === 'FOCUSED') {
      interval = window.setInterval(() => {
        setDailyTotal(prev => {
          const newTotal = prev + 1;
          const today = new Date().toDateString();
          // Keep existing distractions when updating total
          const currentDistractions = JSON.parse(localStorage.getItem('studyTimerData') || '{}').distractions || [];
          localStorage.setItem('studyTimerData', JSON.stringify({ date: today, total: newTotal, distractions: currentDistractions }));
          return newTotal;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [appState]);

  const recordDistraction = () => {
    if (distractionStartRef.current && distractionReasonRef.current) {
      const duration = Math.floor((Date.now() - distractionStartRef.current) / 1000);
      if (duration > 0) {
        const newEvent: DistractionEvent = {
          timestamp: distractionStartRef.current,
          duration,
          reason: distractionReasonRef.current
        };
        const today = new Date().toDateString();
        const stored = localStorage.getItem('studyTimerData');
        let currentDistractions: DistractionEvent[] = [];
        let currentTotal = dailyTotal;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.date === today) {
              currentDistractions = parsed.distractions || [];
              currentTotal = parsed.total || dailyTotal;
            }
          } catch(e) {}
        }
        currentDistractions.push(newEvent);
        setDistractions(currentDistractions);
        localStorage.setItem('studyTimerData', JSON.stringify({ date: today, total: currentTotal, distractions: currentDistractions }));
      }
      distractionStartRef.current = null;
      distractionReasonRef.current = null;
    }
  };

  // Handle auto-pause on idle and auto-resume on focus
  useEffect(() => {
    let isCurrentlyDistracted = false;
    let currentReason: string | null = null;

    // 1. Audio distractions (Phone ringing, speaker playing) override everything
    if (isMicEnabled && audioDistraction) {
      isCurrentlyDistracted = true;
      currentReason = audioDistraction;
    } 
    // 2. If camera is ON, it is the ultimate source of truth. Ignore computer idle timer.
    else if (isCameraEnabled) {
      if (isCamDistracted) {
        isCurrentlyDistracted = true;
        currentReason = camReason || 'Distracted';
      }
    } 
    // 3. Only if camera is OFF do we fall back to mouse/keyboard idle detection
    else if (isIdle) {
      isCurrentlyDistracted = true;
      currentReason = 'Away from Desk/Idle';
    }

    if (isCurrentlyDistracted && appState === 'FOCUSED') {
      pause();
      setAppState('DISTRACTED');
      distractionStartRef.current = Date.now();
      distractionReasonRef.current = currentReason;
    } else if (!isCurrentlyDistracted && appState === 'DISTRACTED') {
      start();
      setAppState('FOCUSED');
      recordDistraction();
    }
  }, [isIdle, isCameraEnabled, isMicEnabled, isCamDistracted, audioDistraction, camReason, appState, pause, start]);

  const handleStart = () => {
    resetIdleTimer();
    if (appState === 'DISTRACTED') recordDistraction();
    start();
    setAppState('FOCUSED');
  };

  const handlePause = () => {
    if (appState === 'DISTRACTED') recordDistraction();
    pause();
    setAppState('PAUSED');
  };

  const handleReset = () => {
    if (appState === 'DISTRACTED') recordDistraction();
    pause();
    reset();
    setAppState('PAUSED');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const getStatusClass = () => {
    switch (appState) {
      case 'FOCUSED': return 'status-focused';
      case 'PAUSED': return 'status-paused';
      case 'DISTRACTED': return 'status-distracted';
      default: return '';
    }
  };

  const totalDistractionTime = distractions.reduce((acc, curr) => acc + curr.duration, 0);

  return (
    <>
      <div className="top-controls">
        <button 
          className={`camera-toggle ${isCameraEnabled ? 'active' : ''}`} 
          onClick={() => setIsCameraEnabled(!isCameraEnabled)} 
          title="Toggle Webcam Focus Detection"
        >
          {isCameraEnabled ? <Camera size={24} /> : <CameraOff size={24} />}
        </button>

        <button 
          className={`camera-toggle ${isMicEnabled ? 'active' : ''}`} 
          onClick={() => setIsMicEnabled(!isMicEnabled)} 
          title="Toggle Microphone Activity Detection"
        >
          {isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button className="fullscreen-toggle" onClick={() => setShowAnalytics(true)} title="View Distraction Analytics">
          <BarChart2 size={24} />
        </button>

        <button className="fullscreen-toggle" onClick={toggleFullscreen} title="Toggle Fullscreen">
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      </div>

      {isCameraEnabled && (
        <div className={`webcam-container ${isCamDistracted ? 'missing-face' : ''}`}>
          <Webcam
            ref={webcamRef}
            audio={false}
            width={160}
            height={120}
            className="webcam-preview"
          />
          <div className="webcam-info">
            {!isCamLoaded && <div className="webcam-status">Loading Model...</div>}
            {isCamLoaded && isCamDistracted && <div className="webcam-status error">{camReason}</div>}
            {isCamLoaded && !isCamDistracted && <div className="webcam-status">Watching ●</div>}
          </div>
        </div>
      )}

      {isMicEnabled && (
        <div className={`mic-container ${audioDistraction ? 'missing-face' : ''}`}>
          {!isAudioModelLoaded && <div className="webcam-status">Loading Mic Model...</div>}
          {isAudioModelLoaded && audioDistraction && <div className="webcam-status error">{audioDistraction}</div>}
          {isAudioModelLoaded && !audioDistraction && isNoisy && <div className="webcam-status" style={{color: '#00f0ff'}}>Studying Noise</div>}
        </div>
      )}

      <div className="app-container">
        <div className={`status-label ${getStatusClass()}`}>
          {appState}
        </div>

        <div className={`timer-display ${getStatusClass()}`}>
          {formatTime(seconds)}
        </div>

        <div className="controls">
          {appState !== 'FOCUSED' ? (
            <button className="primary" onClick={handleStart}>
              <Play size={20} /> Start / Resume Focus
            </button>
          ) : (
            <button onClick={handlePause}>
              <Pause size={20} /> Pause
            </button>
          )}
          <button className="danger" onClick={handleReset}>
            <RotateCcw size={20} /> Reset Session
          </button>
        </div>
      </div>

      <div className="daily-stats">
        <div className="daily-stats-label">Today's Focus Time</div>
        <div className="daily-stats-value">{formatTime(dailyTotal)}</div>
      </div>

      {showAnalytics && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowAnalytics(false)}><X size={24}/></button>
            <h2>Distraction Analytics</h2>
            
            <div className="analytics-summary">
              <div className="stat-box">
                <span className="stat-label">Distractions</span>
                <span className="stat-value">{distractions.length}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Time Hallucinated</span>
                <span className="stat-value error">{formatTime(totalDistractionTime)}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Time Focused</span>
                <span className="stat-value success">{formatTime(dailyTotal)}</span>
              </div>
            </div>

            <div className="history-list">
              <h3>History Log</h3>
              {distractions.length === 0 ? (
                <p className="no-data">No distractions recorded today. Great focus!</p>
              ) : (
                <ul>
                  {distractions.slice().reverse().map((d, i) => (
                    <li key={i}>
                      <span className="history-time">{new Date(d.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <span className="history-reason">{d.reason}</span>
                      <span className="history-duration">{formatTime(d.duration)} lost</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
