import { useState, useEffect, useCallback } from 'react';

// Returns whether the user is currently considered "idle" (distracted)
export function useIdle(timeoutMs = 120000) {
  const [isIdle, setIsIdle] = useState(false);

  const resetIdleTimer = useCallback(() => {
    setIsIdle(false);
  }, []);

  useEffect(() => {
    let timeoutId: number;

    const handleActivity = () => {
      if (isIdle) {
        setIsIdle(false);
      }
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setIsIdle(true), timeoutMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsIdle(true);
      } else {
        handleActivity();
      }
    };

    // Initial setup
    timeoutId = window.setTimeout(() => setIsIdle(true), timeoutMs);

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);
    window.addEventListener('scroll', handleActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [timeoutMs, isIdle]);

  return { isIdle, resetIdleTimer };
}
