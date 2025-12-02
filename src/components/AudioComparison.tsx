import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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
  const [crossfade, setCrossfade] = useState(50); // 0 = Original, 100 = Clean
  
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const { isProtected } = useAudioProtection(true);

  // Check if current time is in an explicit segment
  const isInExplicitSegment = useCallback((time: number) => {
    return explicitWords.some(word => time >= word.timestamp && time <= word.end);
  }, [explicitWords]);

  // Initialize audio elements
  useEffect(() => {
    const originalAudio = new Audio(originalAudioUrl);
    const vocalsAudio = new Audio(vocalsUrl);
    const instrumentalAudio = new Audio(instrumentalUrl);

    originalAudio.preload = 'auto';
    vocalsAudio.preload = 'auto';
    instrumentalAudio.preload = 'auto';

    originalAudioRef.current = originalAudio;
    vocalsRef.current = vocalsAudio;
    instrumentalRef.current = instrumentalAudio;

    return () => {
      originalAudio.pause();
      vocalsAudio.pause();
      instrumentalAudio.pause();
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [originalAudioUrl, vocalsUrl, instrumentalUrl]);

  // Time update loop
  useEffect(() => {
    const updateTime = () => {
      if (originalAudioRef.current && isPlaying) {
        const time = originalAudioRef.current.currentTime;
        setCurrentTime(time);

        // Sync all audio elements
        if (vocalsRef.current && Math.abs(vocalsRef.current.currentTime - time) > 0.15) {
          vocalsRef.current.currentTime = time;
        }
        if (instrumentalRef.current && Math.abs(instrumentalRef.current.currentTime - time) > 0.15) {
          instrumentalRef.current.currentTime = time;
        }

        // Preview limit check
        if (time >= previewLimit) {
          originalAudioRef.current.pause();
          vocalsRef.current?.pause();
          instrumentalRef.current?.pause();
          setIsPlaying(false);
          return;
        }

        animationFrameRef.current = requestAnimationFrame(updateTime);
      }
    };

    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, previewLimit]);

  // Handle volume based on crossfade and muting
  useEffect(() => {
    if (!originalAudioRef.current || !vocalsRef.current || !instrumentalRef.current) return;

    const originalVolume = (100 - crossfade) / 100;
    const cleanVolume = crossfade / 100;

    // Original audio volume
    originalAudioRef.current.volume = originalVolume;

    // Clean audio: mute vocals during explicit segments
    const inExplicit = isInExplicitSegment(currentTime);
    vocalsRef.current.volume = inExplicit ? 0 : cleanVolume;
    instrumentalRef.current.volume = cleanVolume;
  }, [crossfade, currentTime, isInExplicitSegment]);

  // Play/pause control
  useEffect(() => {
    if (!originalAudioRef.current || !vocalsRef.current || !instrumentalRef.current) return;

    if (isPlaying) {
      originalAudioRef.current.play().catch(console.error);
      vocalsRef.current.play().catch(console.error);
      instrumentalRef.current.play().catch(console.error);
    } else {
      originalAudioRef.current.pause();
      vocalsRef.current.pause();
      instrumentalRef.current.pause();
    }
  }, [isPlaying]);

  const togglePlayPause = () => {
    if (currentTime >= previewLimit) {
      resetPlayback();
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

  const progressPercentage = Math.min((currentTime / previewLimit) * 100, 100);

  // Generate waveform bars (memoized via useMemo would be better but keeping simple)
  const waveformBars = Array.from({ length: 60 }, (_, i) => {
    const position = (i / 60) * previewLimit;
    const isExplicit = explicitWords.some(w => 
      position >= w.timestamp && position <= w.end
    );
    return { height: 20 + Math.sin(i * 0.5) * 30 + Math.cos(i * 0.3) * 20, isExplicit };
  });

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8 neon-border audio-protected space-y-6">
      {isProtected && (
        <div className="text-center">
          <Badge variant="outline" className="border-accent text-accent">
            🔒 Protected Preview
          </Badge>
        </div>
      )}

      {/* Original Waveform */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">Original</span>
          <span className="text-xs text-muted-foreground opacity-60">
            {crossfade < 50 ? "Playing" : ""}
          </span>
        </div>
        <div className="relative h-20 bg-muted/10 rounded-lg overflow-hidden border border-border/30">
          <div className="absolute inset-0 flex items-end justify-around px-1">
            {waveformBars.map((bar, i) => {
              const isPlayed = i < (currentTime / previewLimit) * 60;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-t transition-all duration-75 ${
                    bar.isExplicit
                      ? "bg-destructive"
                      : isPlayed && crossfade < 50
                      ? "bg-secondary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{ height: `${bar.height}%` }}
                />
              );
            })}
          </div>
          {/* Explicit markers */}
          {explicitWords.map((word, idx) => {
            const startPos = (word.timestamp / previewLimit) * 100;
            const width = ((word.end - word.timestamp) / previewLimit) * 100;
            if (startPos <= 100) {
              return (
                <div
                  key={idx}
                  className="absolute top-0 h-full bg-destructive/20 border-l border-r border-destructive/50"
                  style={{ left: `${Math.min(startPos, 100)}%`, width: `${Math.min(width, 100 - startPos)}%` }}
                />
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* Crossfader */}
      <div className="py-4 space-y-3">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className={crossfade < 50 ? "text-secondary" : "text-muted-foreground"}>
            ORIGINAL
          </span>
          <span className={crossfade > 50 ? "text-primary" : "text-muted-foreground"}>
            CLEAN
          </span>
        </div>
        <Slider
          value={[crossfade]}
          onValueChange={(v) => setCrossfade(v[0])}
          max={100}
          step={1}
          className="cursor-pointer"
        />
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            {crossfade === 0 ? "100% Original" : 
             crossfade === 100 ? "100% Clean" : 
             crossfade === 50 ? "50/50 Mix" :
             crossfade < 50 ? `${100 - crossfade}% Original` : `${crossfade}% Clean`}
          </span>
        </div>
      </div>

      {/* Clean Waveform */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">Clean</span>
          <span className="text-xs text-muted-foreground opacity-60">
            {crossfade > 50 ? "Playing" : ""}
          </span>
        </div>
        <div className="relative h-20 bg-muted/10 rounded-lg overflow-hidden border border-border/30">
          <div className="absolute inset-0 flex items-end justify-around px-1">
            {waveformBars.map((bar, i) => {
              const isPlayed = i < (currentTime / previewLimit) * 60;
              return (
                <div
                  key={i}
                  className={`w-1 rounded-t transition-all duration-75 ${
                    bar.isExplicit
                      ? "bg-accent/50"
                      : isPlayed && crossfade > 50
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{ height: bar.isExplicit ? "10%" : `${bar.height}%` }}
                />
              );
            })}
          </div>
          {/* Muted segment markers */}
          {explicitWords.map((word, idx) => {
            const startPos = (word.timestamp / previewLimit) * 100;
            const width = ((word.end - word.timestamp) / previewLimit) * 100;
            if (startPos <= 100) {
              return (
                <div
                  key={idx}
                  className="absolute top-0 h-full bg-accent/10 border-l border-r border-accent/30 flex items-center justify-center"
                  style={{ left: `${Math.min(startPos, 100)}%`, width: `${Math.min(width, 100 - startPos)}%` }}
                >
                  <span className="text-[8px] text-accent/60 font-medium">MUTED</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <Progress value={progressPercentage} className="h-1.5" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span className="text-primary">Preview: {formatTime(previewLimit)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="flex gap-3 justify-center">
        <Button
          size="lg"
          onClick={togglePlayPause}
          className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all duration-300 min-w-32"
        >
          {isPlaying ? (
            <>
              <Pause className="h-5 w-5 mr-2" />
              Pause
            </>
          ) : currentTime >= previewLimit ? (
            <>
              <RotateCcw className="h-5 w-5 mr-2" />
              Replay
            </>
          ) : (
            <>
              <Play className="h-5 w-5 mr-2" />
              Play
            </>
          )}
        </Button>
        <Button size="lg" variant="outline" onClick={resetPlayback}>
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>

      <div className="text-center text-xs text-muted-foreground space-y-1">
        <p>🎚️ Use the crossfader to blend between original and clean versions</p>
        <p className="text-destructive/80">Red = Explicit content • <span className="text-accent">Blue = Muted in clean</span></p>
      </div>
    </div>
  );
};