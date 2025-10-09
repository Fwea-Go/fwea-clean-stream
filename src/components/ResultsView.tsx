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
  const intervalRef = useRef<NodeJS.Timeout>();

  const PREVIEW_LIMIT = 30; // 30 seconds
  const TOTAL_DURATION = 180; // 3 minutes mock duration

  // Mock detected explicit words
  const detectedWords: ExplicitWord[] = [
    { word: "f***", timestamp: 12.5, language: "English", confidence: 0.98 },
    { word: "s***", timestamp: 45.2, language: "English", confidence: 0.95 },
    { word: "m*****", timestamp: 78.8, language: "Spanish", confidence: 0.97 },
    { word: "b****", timestamp: 102.3, language: "English", confidence: 0.94 },
    { word: "d***", timestamp: 156.7, language: "French", confidence: 0.96 },
  ];

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          const newTime = prev + 0.1;
          if (newTime >= PREVIEW_LIMIT && !hasReachedLimit) {
            setIsPlaying(false);
            setHasReachedLimit(true);
            setShowPaywall(true);
            return PREVIEW_LIMIT;
          }
          return newTime;
        });
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, hasReachedLimit]);

  const togglePlayPause = () => {
    if (currentTime >= PREVIEW_LIMIT) {
      setShowPaywall(true);
    } else {
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
            <div className="text-3xl font-bold text-secondary mb-2">3</div>
            <div className="text-sm text-muted-foreground">Languages Detected</div>
          </div>
          <div className="glass-card p-6 rounded-xl border-accent/30">
            <div className="text-3xl font-bold text-accent mb-2">96.4%</div>
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
              const position = (word.timestamp / TOTAL_DURATION) * 100;
              if (position <= (PREVIEW_LIMIT / TOTAL_DURATION) * 100) {
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
