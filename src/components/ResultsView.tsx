import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PaywallModal } from "./PaywallModal";

interface ExplicitWord {
  word: string;
  timestamp: number;
  language: string;
  confidence: number;
}

interface ResultsViewProps {
  fileName: string;
}

export const ResultsView = ({ fileName }: ResultsViewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);
  const [detectedWords, setDetectedWords] = useState<ExplicitWord[]>([]);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(180);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const PREVIEW_LIMIT = 30; // 30 seconds

  // Load real analysis data and audio
  useEffect(() => {
    const analysisData = sessionStorage.getItem('audioAnalysis');
    const audioUrl = sessionStorage.getItem('audioUrl');
    
    if (analysisData) {
      try {
        const data = JSON.parse(analysisData);
        
        // Map the analysis data to our format
        const words: ExplicitWord[] = data.explicitWords?.map((w: any) => ({
          word: w.word,
          timestamp: w.start || 0,
          language: w.language || data.language || "unknown",
          confidence: w.confidence || 0.9,
        })) || [];
        
        setDetectedWords(words);
        setTranscript(data.transcript || "");
        setDuration(data.duration || 180);
      } catch (error) {
        console.error("Error loading analysis:", error);
      }
    }

    // Initialize audio element
    if (audioUrl && !audioRef.current) {
      const audio = new Audio(audioUrl);
      audio.addEventListener('loadedmetadata', () => {
        console.log('Audio loaded, duration:', audio.duration);
      });
      audio.addEventListener('timeupdate', () => {
        setCurrentTime(audio.currentTime);
        
        // Check if we've reached preview limit
        if (audio.currentTime >= PREVIEW_LIMIT && !hasReachedLimit) {
          audio.pause();
          setIsPlaying(false);
          setHasReachedLimit(true);
          setShowPaywall(true);
        }

        // Check if any explicit words should be muted at current time
        const shouldMute = detectedWords.some(word => 
          audio.currentTime >= word.timestamp && 
          audio.currentTime <= word.timestamp + 0.5 // Mute for 0.5 seconds
        );
        
        audio.volume = shouldMute ? 0 : 1;
      });
      audio.addEventListener('ended', () => {
        setIsPlaying(false);
      });
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [detectedWords]);

  // Handle play/pause with actual audio
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(err => {
          console.error('Error playing audio:', err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  const togglePlayPause = () => {
    if (currentTime >= PREVIEW_LIMIT) {
      setShowPaywall(true);
      return;
    }
    
    if (audioRef.current) {
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercentage = (currentTime / PREVIEW_LIMIT) * 100;

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="animate-slide-up space-y-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">
            Analysis <span className="text-primary neon-text">Complete</span>
          </h2>
          <p className="text-muted-foreground text-lg">{fileName}</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-6 rounded-xl border-primary/30">
            <div className="text-3xl font-bold text-primary mb-2">{detectedWords.length}</div>
            <div className="text-sm text-muted-foreground">Explicit Words Detected</div>
          </div>
          <div className="glass-card p-6 rounded-xl border-secondary/30">
            <div className="text-3xl font-bold text-secondary mb-2">
              {new Set(detectedWords.map(w => w.language)).size}
            </div>
            <div className="text-sm text-muted-foreground">Languages Detected</div>
          </div>
          <div className="glass-card p-6 rounded-xl border-accent/30">
            <div className="text-3xl font-bold text-accent mb-2">
              {detectedWords.length > 0 
                ? `${Math.round((detectedWords.reduce((sum, w) => sum + w.confidence, 0) / detectedWords.length) * 100)}%`
                : "N/A"
              }
            </div>
            <div className="text-sm text-muted-foreground">Average Confidence</div>
          </div>
        </div>

        {/* Audio Player */}
        <div className="glass-card rounded-2xl p-8 neon-border">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Clean Version Preview</h3>
            <Badge variant="outline" className="border-primary text-primary">
              30s Free Preview
            </Badge>
          </div>

          {/* Waveform visualization mockup */}
          <div className="relative h-24 mb-6 bg-muted/20 rounded-lg overflow-hidden">
            <div className="absolute inset-0 flex items-center">
              {Array.from({ length: 100 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 mx-px transition-all duration-300 ${
                    i < (currentTime / PREVIEW_LIMIT) * 100
                      ? "bg-primary"
                      : "bg-muted-foreground/30"
                  }`}
                  style={{
                    height: `${Math.random() * 100}%`,
                  }}
                />
              ))}
            </div>
            {/* Explicit markers */}
            {detectedWords.map((word, idx) => {
              const position = (word.timestamp / duration) * 100;
              if (position <= (PREVIEW_LIMIT / duration) * 100) {
                return (
                  <div
                    key={idx}
                    className="absolute top-0 bottom-0 w-1 bg-secondary"
                    style={{ left: `${position}%` }}
                  />
                );
              }
              return null;
            })}
          </div>

          <div className="space-y-4">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(PREVIEW_LIMIT)}</span>
            </div>

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
                {currentTime >= PREVIEW_LIMIT ? "Preview Ended" : isPlaying ? "Pause" : "Play Preview"}
              </Button>
              <Button
                size="lg"
                onClick={() => setShowPaywall(true)}
                className="bg-secondary hover:bg-secondary/90"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Full Version
              </Button>
            </div>

            {hasReachedLimit && (
              <div className="flex items-center gap-2 justify-center text-secondary text-sm animate-fade-in">
                <AlertCircle className="h-4 w-4" />
                <span>Preview limit reached. Upgrade to download the full clean version.</span>
              </div>
            )}
          </div>
        </div>

        {/* Detected Words Table */}
        <div className="glass-card rounded-2xl p-8">
          <h3 className="text-2xl font-bold mb-6">Detected Explicit Content</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-muted-foreground font-semibold">Timestamp</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-semibold">Word</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-semibold">Language</th>
                  <th className="text-left py-3 px-4 text-muted-foreground font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {detectedWords.map((word, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-border/50 hover:bg-primary/5 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-primary">{formatTime(word.timestamp)}</td>
                    <td className="py-3 px-4 font-semibold">{word.word}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline">{word.language}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Progress value={word.confidence * 100} className="h-2 w-20" />
                        <span className="text-sm text-muted-foreground">{(word.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PaywallModal open={showPaywall} onOpenChange={setShowPaywall} />
    </div>
  );
};
