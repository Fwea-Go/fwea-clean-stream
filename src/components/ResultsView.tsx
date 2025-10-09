import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { PaywallModal } from "./PaywallModal";

interface ExplicitWord {
  word: string;
  timestamp: number;
  end: number;
  language: string;
  confidence: number;
}

interface ResultsViewProps {
  fileName: string;
  onAnalyzeAnother: () => void;
}

export const ResultsView = ({ fileName, onAnalyzeAnother }: ResultsViewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [detectedWords, setDetectedWords] = useState<ExplicitWord[]>([]);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(180);
  const [isDemo, setIsDemo] = useState(false);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);
  const instrumentalRef = useRef<HTMLAudioElement | null>(null);

  const PREVIEW_LIMIT = 30; // 30 seconds free preview

  // Load real analysis data
  useEffect(() => {
    const analysisData = sessionStorage.getItem('audioAnalysis');
    const demoMode = sessionStorage.getItem('isDemo');
    
    if (demoMode === 'true') {
      setIsDemo(true);
    }
    
    if (analysisData) {
      try {
        const data = JSON.parse(analysisData);
        
        // Map the analysis data to our format
        const words: ExplicitWord[] = data.explicitWords?.map((w: any) => ({
          word: w.word,
          timestamp: w.start || 0,
          end: w.end || (w.start + 0.4) || 0, // Mute for 0.4s
          language: w.language || data.language || "unknown",
          confidence: w.confidence || 0.95,
        })) || [];
        
        setDetectedWords(words);
        setTranscript(data.transcript || "");
        setDuration(data.duration || 180);
      } catch (error) {
        console.error("Error loading analysis:", error);
      }
    }
  }, []);

  // Initialize audio elements with separated stems
  useEffect(() => {
    const vocalsUrl = sessionStorage.getItem('vocalsUrl');
    const instrumentalUrl = sessionStorage.getItem('instrumentalUrl');
    
    console.log('[ResultsView] Loading separated stems:', { vocalsUrl, instrumentalUrl });
    
    // Skip audio loading in demo mode
    if (isDemo) {
      console.log('[ResultsView] Demo mode - skipping audio initialization');
      return;
    }
    
    if (vocalsUrl && instrumentalUrl && !vocalsRef.current && !instrumentalRef.current) {
      // Initialize vocals audio
      const vocalsAudio = new Audio(vocalsUrl);
      vocalsAudio.addEventListener('loadedmetadata', () => {
        console.log('[ResultsView] Vocals loaded, duration:', vocalsAudio.duration);
      });
      
      vocalsAudio.addEventListener('error', (e) => {
        console.error('[ResultsView] Vocals error:', e);
      });
      
      // Initialize instrumental audio
      const instrumentalAudio = new Audio(instrumentalUrl);
      instrumentalAudio.addEventListener('loadedmetadata', () => {
        console.log('[ResultsView] Instrumental loaded, duration:', instrumentalAudio.duration);
      });
      
      instrumentalAudio.addEventListener('error', (e) => {
        console.error('[ResultsView] Instrumental error:', e);
      });
      
      // Sync time updates from instrumental (which plays continuously)
      instrumentalAudio.addEventListener('timeupdate', () => {
        setCurrentTime(instrumentalAudio.currentTime);
        
        // Sync vocals to same time
        if (vocalsAudio && Math.abs(vocalsAudio.currentTime - instrumentalAudio.currentTime) > 0.1) {
          vocalsAudio.currentTime = instrumentalAudio.currentTime;
        }
        
        // Check if we've reached preview limit (but allow replay)
        if (instrumentalAudio.currentTime >= PREVIEW_LIMIT) {
          instrumentalAudio.pause();
          vocalsAudio.pause();
          setIsPlaying(false);
          setShowPaywall(true);
        }
      });
      
      instrumentalAudio.addEventListener('ended', () => {
        vocalsAudio.pause();
        setIsPlaying(false);
      });
      
      vocalsRef.current = vocalsAudio;
      instrumentalRef.current = instrumentalAudio;
      
      console.log('[ResultsView] Audio elements initialized with separated stems');
    } else if (!vocalsUrl || !instrumentalUrl) {
      console.error('[ResultsView] Missing separated stem URLs');
    }

    return () => {
      if (vocalsRef.current) {
        vocalsRef.current.pause();
        vocalsRef.current.src = '';
        vocalsRef.current = null;
      }
      if (instrumentalRef.current) {
        instrumentalRef.current.pause();
        instrumentalRef.current.src = '';
        instrumentalRef.current = null;
      }
    };
  }, []);

  // Handle muting vocals during explicit words (instrumental keeps playing)
  useEffect(() => {
    if (vocalsRef.current && detectedWords.length > 0) {
      // Check if we're currently on an explicit word
      const currentWord = detectedWords.find(word => {
        return currentTime >= word.timestamp && currentTime <= word.end;
      });
      
      // Mute vocals during explicit words, unmute otherwise
      vocalsRef.current.volume = currentWord ? 0 : 1;
      
      if (currentWord && vocalsRef.current.volume === 0) {
        console.log('[ResultsView] Muting vocals:', currentWord.word, 'at', currentTime.toFixed(2));
      }
    }
  }, [currentTime, detectedWords]);

  // Handle play/pause for both stems
  useEffect(() => {
    if (vocalsRef.current && instrumentalRef.current) {
      if (isPlaying) {
        console.log('Playing both stems...');
        
        // Start both at the same time
        const playVocals = vocalsRef.current.play();
        const playInstrumental = instrumentalRef.current.play();
        
        Promise.all([playVocals, playInstrumental])
          .then(() => {
            console.log('Both stems playing successfully');
          })
          .catch(err => {
            console.error('Error playing stems:', err);
            setIsPlaying(false);
          });
      } else {
        vocalsRef.current.pause();
        instrumentalRef.current.pause();
        console.log('Both stems paused');
      }
    }
  }, [isPlaying]);

  const togglePlayPause = () => {
    if (!vocalsRef.current || !instrumentalRef.current) {
      console.error('Audio elements not initialized');
      return;
    }
    
    // If at end of preview, reset to beginning
    if (currentTime >= PREVIEW_LIMIT) {
      vocalsRef.current.currentTime = 0;
      instrumentalRef.current.currentTime = 0;
      setCurrentTime(0);
    }
    
    console.log('Toggle play/pause, current state:', isPlaying);
    setIsPlaying(!isPlaying);
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
          <div className="flex items-center justify-center gap-3 mb-3">
            <h2 className="text-4xl font-bold">
              Analysis <span className="text-primary neon-text">Complete</span>
            </h2>
            {isDemo && (
              <Badge variant="outline" className="text-accent border-accent">
                DEMO
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-lg mb-4">{fileName}</p>
          {isDemo && (
            <p className="text-sm text-muted-foreground mb-4 italic">
              This is a demo showing example results. Upload your own audio to analyze!
            </p>
          )}
          <Button
            variant="outline"
            onClick={onAnalyzeAnother}
            className="border-primary text-primary hover:bg-primary/10"
          >
            {isDemo ? "Try With Your Own Audio" : "Clean Another Song"}
          </Button>
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
                disabled={isDemo}
                className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all duration-300 glow-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 mr-2" />
                ) : (
                  <Play className="h-5 w-5 mr-2" />
                )}
                {isDemo ? "Demo Mode - No Audio" : currentTime >= PREVIEW_LIMIT ? "Replay Preview" : isPlaying ? "Pause" : "Play Preview"}
              </Button>
              <Button
                size="lg"
                onClick={() => setShowPaywall(true)}
                disabled={isDemo}
                className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-5 w-5 mr-2" />
                Download Full Version
              </Button>
            </div>

            {currentTime >= PREVIEW_LIMIT && (
            <div className="flex items-center gap-2 justify-center text-accent text-sm animate-fade-in">
              <AlertCircle className="h-4 w-4" />
              <span>30s preview complete. Click play to listen again or upgrade to download the full version.</span>
            </div>
          )}
          
          <div className="text-center text-xs text-muted-foreground mt-4 space-y-1">
            <p>✨ Vocals separated and analyzed independently</p>
            <p className="text-primary">🎵 Instrumental keeps playing while vocals are muted during explicit words</p>
          </div>
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
