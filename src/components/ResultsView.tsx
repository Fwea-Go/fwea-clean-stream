import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PaywallModal } from "./PaywallModal";
import { AudioComparison } from "./AudioComparison";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { renderCleanAudio, sanitizeFilename, downloadBlob, RenderProgress } from "@/utils/cleanAudioRenderer";
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
  const [showPaywall, setShowPaywall] = useState(false);
  const [detectedWords, setDetectedWords] = useState<ExplicitWord[]>([]);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(180);
  const [isDemo, setIsDemo] = useState(false);
  const [isGeneratingClean, setIsGeneratingClean] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState("");
  const [vocalsUrl, setVocalsUrl] = useState("");
  const [instrumentalUrl, setInstrumentalUrl] = useState("");
  
  const { isAdmin } = useAuth();
  const adminBypass = sessionStorage.getItem('adminBypass') === 'true';

  const PREVIEW_LIMIT = 30; // 30 seconds free preview

  // Load real analysis data
  useEffect(() => {
    const analysisData = sessionStorage.getItem('audioAnalysis');
    const demoMode = sessionStorage.getItem('isDemo');
    const storedOriginalUrl = sessionStorage.getItem('originalAudioUrl');
    const storedVocalsUrl = sessionStorage.getItem('vocalsUrl');
    const storedInstrumentalUrl = sessionStorage.getItem('instrumentalUrl');
    
    if (demoMode === 'true') {
      setIsDemo(true);
    }

    if (storedOriginalUrl) setOriginalAudioUrl(storedOriginalUrl);
    if (storedVocalsUrl) setVocalsUrl(storedVocalsUrl);
    if (storedInstrumentalUrl) setInstrumentalUrl(storedInstrumentalUrl);
    
    if (analysisData) {
      try {
        const data = JSON.parse(analysisData);
        
        // Map the analysis data to our format
        const words: ExplicitWord[] = data.explicitWords?.map((w: any) => ({
          word: w.word,
          timestamp: Math.max(0, (w.start || 0) - 0.1),
          end: (w.end || (w.start + 0.8)) + 0.2,
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

    // Check if we should trigger clean generation after payment
    const triggerClean = sessionStorage.getItem('triggerCleanGeneration');
    if (triggerClean === 'true') {
      sessionStorage.removeItem('triggerCleanGeneration');
      handleGenerateClean();
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleGenerateClean = async () => {
    setIsGeneratingClean(true);
    setRenderProgress(null);
    
    try {
      // Use client-side rendering - no backend required!
      if (!vocalsUrl || !instrumentalUrl) {
        throw new Error("Missing audio stems");
      }

      toast({
        title: "Generating Clean Version",
        description: "Processing audio in your browser...",
      });

      // Convert explicit words to mute regions
      const muteRegions = detectedWords.map(word => ({
        start: word.timestamp,
        end: word.end,
      }));

      // Render clean audio client-side
      const mp3Blob = await renderCleanAudio(
        vocalsUrl,
        instrumentalUrl,
        muteRegions,
        (progress) => {
          setRenderProgress(progress);
        }
      );

      // Generate clean filename (WAV format for perfect quality)
      const cleanName = `${sanitizeFilename(fileName)}-clean.wav`;
      
      toast({
        title: "Clean Version Ready!",
        description: "Your download will start automatically.",
      });

      // Trigger download
      downloadBlob(mp3Blob, cleanName);
      
      console.log("Clean audio downloaded:", cleanName);
      
    } catch (error) {
      console.error("Clean generation error:", error);
      toast({
        title: "Generation Error",
        description: error instanceof Error ? error.message : "Failed to generate clean version. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingClean(false);
      setRenderProgress(null);
    }
  };

  const handlePurchaseComplete = () => {
    // After purchase, generate the clean audio
    handleGenerateClean();
  };

  const handleDownloadClick = () => {
    // Admin bypass - skip payment
    if (isAdmin || adminBypass) {
      handleGenerateClean();
    } else {
      setShowPaywall(true);
    }
  };

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
            {(isAdmin || adminBypass) && (
              <Badge variant="outline" className="text-secondary border-secondary">
                ADMIN
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

        {/* Audio Comparison Player */}
        {!isDemo && originalAudioUrl && vocalsUrl && instrumentalUrl ? (
          <AudioComparison
            originalAudioUrl={originalAudioUrl}
            vocalsUrl={vocalsUrl}
            instrumentalUrl={instrumentalUrl}
            explicitWords={detectedWords}
            duration={duration}
            previewLimit={PREVIEW_LIMIT}
          />
        ) : isDemo ? (
          <div className="glass-card rounded-2xl p-8 neon-border">
            <div className="text-center py-12">
              <Badge variant="outline" className="text-accent border-accent mb-4">
                DEMO MODE
              </Badge>
              <p className="text-muted-foreground">
                Upload your own audio to hear the comparison!
              </p>
            </div>
          </div>
        ) : null}

        {/* Download Button */}
        <div className="flex justify-center gap-4 mt-6">
          <Button
            size="lg"
            onClick={handleDownloadClick}
            disabled={isDemo || isGeneratingClean}
            className="bg-secondary hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingClean ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                {renderProgress ? renderProgress.message : "Generating..."}
              </>
            ) : (
              <>
                <Download className="h-5 w-5 mr-2" />
                {(isAdmin || adminBypass) ? "Download (Admin)" : "Download Full Clean Version"}
              </>
            )}
          </Button>
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
                        <div className="h-2 w-20 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all"
                            style={{ width: `${word.confidence * 100}%` }}
                          />
                        </div>
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

      <PaywallModal 
        open={showPaywall} 
        onOpenChange={setShowPaywall}
        onPurchaseComplete={handlePurchaseComplete}
      />
    </div>
  );
};
