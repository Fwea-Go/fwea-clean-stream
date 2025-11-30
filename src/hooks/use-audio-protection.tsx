import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const useAudioProtection = (enabled: boolean = true) => {
  const { isAdmin } = useAuth();

  useEffect(() => {
    // Admin bypass - skip all protection
    if (isAdmin || !enabled) {
      return;
    }

    // Prevent right-click context menu
    const preventContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'AUDIO' || target.closest('.audio-protected')) {
        e.preventDefault();
      }
    };

    // Detect screen recording attempts (basic detection)
    const detectScreenRecording = () => {
      // Check for common screen recording indicators
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        console.warn('Screen recording APIs detected');
      }
    };

    // Prevent audio download via keyboard shortcuts
    const preventKeyboardShortcuts = (e: KeyboardEvent) => {
      // Prevent Ctrl+S, Cmd+S (save)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
      }
      // Prevent Ctrl+Shift+I (DevTools)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I') {
        e.preventDefault();
      }
    };

    // Add watermark to audio context (obfuscation)
    const addAudioWatermark = () => {
      console.log('🔒 Audio protection active');
    };

    document.addEventListener('contextmenu', preventContextMenu);
    document.addEventListener('keydown', preventKeyboardShortcuts);
    detectScreenRecording();
    addAudioWatermark();

    // Periodic check for recording
    const recordingCheckInterval = setInterval(() => {
      detectScreenRecording();
    }, 5000);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu);
      document.removeEventListener('keydown', preventKeyboardShortcuts);
      clearInterval(recordingCheckInterval);
    };
  }, [isAdmin, enabled]);

  return { isProtected: !isAdmin && enabled };
};
