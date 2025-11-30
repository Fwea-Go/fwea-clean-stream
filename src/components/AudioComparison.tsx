import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAudioProtection } from "@/hooks/use-audio-protection";

interface AudioComparisonProps {
  originalAudioUrl: string;
  vocalsUrl: string;
  instrumentalUrl: string;
  explicitWords: Array<{ timestamp: number; end: number }>;
  duration: number;
  previewLimit: number;
}

export const AudioComparison = ({
  originalAudioUrl,
  vocalsUrl,
  instrumentalUrl,
  explicitWords,
  duration,
  previewLimit,
}: AudioComparisonProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeVersion, setActiveVersion] = useState<"original" | "clean" | "both">("both");
  
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);

  const { isProtected } = useAudioProtection(true);

  // Initialize audio elements
  useEffect(() => {
    // Original audio
    const originalAudio = new Audio(originalAudioUrl);
    originalAudio.addEventListener('loadedmetadata', () => {
      console.log('[AudioComparison] Original audio loaded');
    });

    // Vocals audio
    const vocalsAudio = new Audio(vocalsUrl);
    vocalsAudio.addEventListener('loadedmetadata', () => {
      console.log('[AudioComparison] Vocals loaded');
    });

    // Instrumental audio
    const instrumentalAudio = new Audio(instrumentalUrl);
    instrumentalAudio.addEventListener('loadedmetadata', () => {
      console.log('[AudioComparison] Instrumental loaded');
    });

    // Sync time updates
    const handleTimeUpdate = () => {
      const time = originalAudio.currentTime;
      setCurrentTime(time);

      // Sync all audio elements
      if (vocalsAudio && Math.abs(vocalsAudio.currentTime - time) > 0.1) {
        vocalsAudio.currentTime = time;
      }
      if (instrumentalAudio && Math.abs(instrumentalAudio.currentTime - time) > 0.1) {
        instrumentalAudio.currentTime = time;
      }

      // Preview limit check
      if (time >= previewLimit) {
        originalAudio.pause();
        vocalsAudio.pause();
        instrumentalAudio.pause();
        setIsPlaying(false);
      }
    };

    originalAudio.addEventListener('timeupdate', handleTimeUpdate);

    originalAudioRef.current = originalAudio;
    vocalsRef.current = vocalsAudio;
    instrumentalRef.current = instrumentalAudio;

    return () => {
      originalAudio.pause();
      vocalsAudio.pause();
      instrumentalAudio.pause();
      originalAudioRef.current = null;
      vocalsRef.current = null;
      instrumentalRef.current = null;
    };
  }, [originalAudioUrl, vocalsUrl, instrumentalUrl, previewLimit]);

  // Handle muting vocals during explicit words
  useEffect(() => {
    if (vocalsRef.current && explicitWords.length > 0) {
      const currentWord = explicitWords.find(word => {
        return currentTime >= word.timestamp && currentTime <= word.end;
      });
      
      vocalsRef.current.volume = currentWord ? 0 : 1;
    }
  }, [currentTime, explicitWords]);

  // Handle play/pause with version switching
  useEffect(() => {
    if (!originalAudioRef.current || !vocalsRef.current || !instrumentalRef.current) return;

    if (isPlaying) {
      if (activeVersion === "original") {
        originalAudioRef.current.play();
        vocalsRef.current.pause();
        instrumentalRef.current.pause();
      } else if (activeVersion === "clean") {
        originalAudioRef.current.pause();
        vocalsRef.current.play();
        instrumentalRef.current.play();
      } else {
        // Both - play original on left, clean on right (user can toggle)
        originalAudioRef.current.play();
        vocalsRef.current.play();
        instrumentalRef.current.play();
      }
    } else {
      originalAudioRef.current.pause();
      vocalsRef.current.pause();
      instrumentalRef.current.pause();
    }
  }, [isPlaying, activeVersion]);

  const togglePlayPause = () => {
    if (currentTime >= previewLimit) {
      // Reset to beginning
      if (originalAudioRef.current) originalAudioRef.current.currentTime = 0;
      if (vocalsRef.current) vocalsRef.current.currentTime = 0;
      if (instrumentalRef.current) instrumentalRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    setIsPlaying(!isPlaying);
  };

  const resetPlayback = () => {
    if (originalAudioRef.current) originalAudioRef.current.currentTime = 0;
    if (vocalsRef.current) vocalsRef.current.currentTime = 0;
    if (instrumentalRef.current) instrumentalRef.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercentage = (currentTime / previewLimit) * 100;

  return (
    <div className="glass-card rounded-2xl p-8 neon-border audio-protected">
      {isProtected && (
        <div className="mb-4 text-center">
          <Badge variant="outline" className="border-accent text-accent">
            🔒 Protected Preview
          </Badge>
        </div>
      )}

      {/* Version Selector */}
      <div className="flex justify-center gap-2 mb-6">
        <Button
          size="sm"
          variant={activeVersion === "original" ? "default" : "outline"}
          onClick={() => setActiveVersion("original")}
        >
          Original
        </Button>
        <Button
          size="sm"
          variant={activeVersion === "clean" ? "default" : "outline"}
          onClick={() => setActiveVersion("clean")}
        >
          Clean
        </Button>
        <Button
          size="sm"
          variant={activeVersion === "both" ? "default" : "outline"}
          onClick={() => setActiveVersion("both")}
        >
          Compare
        </Button>
      </div>

      {/* Waveform Visualization */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Original Waveform */}
        <div className="relative">
          <div className="text-sm font-semibold mb-2 text-center">Original Audio</div>
          <div className="relative h-24 bg-muted/20 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              {Array.from({ length: 50 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 mx-px transition-all duration-300 ${
                    i < (currentTime / previewLimit) * 50 && activeVersion !== "clean"
                      ? "bg-secondary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{
                    height: `${Math.random() * 100}%`,
                  }}
                />
              ))}
            </div>
            {/* Explicit markers on original */}
            {explicitWords.map((word, idx) => {
              const position = (word.timestamp / duration) * 100;
              if (position <= (previewLimit / duration) * 100) {
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-1 bg-destructive opacity-70"
                    style={{ left: `${position}%` }}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>

        {/* Clean Waveform */}
        <div className="relative">
          <div className="text-sm font-semibold mb-2 text-center">Clean Audio</div>
          <div className="relative h-24 bg-muted/20 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              {Array.from({ length: 50 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 mx-px transition-all duration-300 ${
                    i < (currentTime / previewLimit) * 50 && activeVersion !== "original"
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{
                    height: `${Math.random() * 100}%`,
                  }}
                />
              ))}
            </div>
            {/* Muted segments on clean */}
            {explicitWords.map((word, idx) => {
              const position = (word.timestamp / duration) * 100;
              if (position <= (previewLimit / duration) * 100) {
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-1 bg-accent"
                    style={{ left: `${position}%` }}
                  />
                );
              }
              return null;
            })}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-4">
        <Progress value={progressPercentage} className="h-2" />
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(previewLimit)}</span>
        </div>

        {/* Playback Controls */}
        <div className="flex gap-4 justify-center">
          <Button
            size="lg"
            onClick={togglePlayPause}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all duration-300 glow-hover"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 mr-2" />
            ) : (
              <Play className="h-5 w-5 mr-2" />
            )}
            {currentTime >= previewLimit ? "Replay" : isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={resetPlayback}
          >
            <RotateCcw className="h-5 w-5 mr-2" />
            Reset
          </Button>
        </div>

        <div className="text-center text-xs text-muted-foreground mt-4 space-y-1">
          <p>✨ Compare original vs cleaned audio side-by-side</p>
          <p className="text-primary">🎵 Red markers = explicit words, Blue markers = muted segments</p>
        </div>
      </div>
    </div>
  );
};
