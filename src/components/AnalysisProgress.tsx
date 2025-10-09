import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AnalysisProgressProps {
  onComplete: () => void;
  audioFile: File | null;
}

export const AnalysisProgress = ({ onComplete, audioFile }: AnalysisProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Uploading audio file...");

  useEffect(() => {
    if (!audioFile) {
      toast({
        title: "Error",
        description: "No audio file provided",
        variant: "destructive",
      });
      return;
    }

    const analyzeAudio = async () => {
      try {
        console.log("[AnalysisProgress] Starting analysis for file:", audioFile.name, "Size:", audioFile.size);
        
        // Convert file to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioFile);
        
        await new Promise((resolve) => {
          reader.onloadend = resolve;
        });

        const base64Audio = reader.result?.toString().split(',')[1];
        
        if (!base64Audio) {
          throw new Error("Failed to read audio file");
        }

        console.log("[AnalysisProgress] File converted to base64, length:", base64Audio.length);

        setProgress(25);
        setStatus("Processing audio...");

        // Get auth session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("You must be logged in to analyze audio");
        }

        console.log("[AnalysisProgress] Auth session found, calling edge function");

        setProgress(50);
        setStatus("Transcribing audio with AI...");

        // Call analyze-audio function with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

        try {
          const { data, error } = await supabase.functions.invoke("analyze-audio", {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            body: {
              audioBase64: base64Audio,
              fileName: audioFile.name,
            },
          });

          clearTimeout(timeoutId);

          console.log("[AnalysisProgress] Edge function response:", { data, error });

          if (error) {
            console.error("[AnalysisProgress] Edge function error:", error);
            throw new Error(error.message || "Failed to analyze audio");
          }

          if (!data || !data.success) {
            console.error("[AnalysisProgress] Analysis unsuccessful:", data);
            throw new Error(data?.error || "Analysis failed");
          }

          console.log("[AnalysisProgress] Analysis successful:", {
            explicitWordsCount: data.explicitWords?.length,
            language: data.language,
            duration: data.duration
          });

          setProgress(75);
          setStatus("Detecting explicit content...");

          // Store the result and audio file for the ResultsView
          const audioUrl = URL.createObjectURL(audioFile);
          console.log("[AnalysisProgress] Storing audio URL:", audioUrl);
          sessionStorage.setItem('audioAnalysis', JSON.stringify(data));
          sessionStorage.setItem('audioUrl', audioUrl);

          setProgress(100);
          setStatus("Analysis complete!");

          setTimeout(() => {
            onComplete();
          }, 1000);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error("Analysis timed out. Please try with a shorter audio file.");
          }
          throw fetchError;
        }

      } catch (error) {
        console.error("[AnalysisProgress] Error analyzing audio:", error);
        toast({
          title: "Analysis Error",
          description: error instanceof Error ? error.message : "Failed to analyze audio",
          variant: "destructive",
        });
        setStatus("Analysis failed. Please try again.");
      }
    };

    // Start analysis after brief delay
    const timer = setTimeout(() => {
      analyzeAudio();
    }, 500);

    return () => clearTimeout(timer);
  }, [audioFile, onComplete]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <div className="glass-card rounded-2xl p-8 md:p-12 animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">
            Analyzing Your <span className="text-primary neon-text">Audio</span>
          </h2>
          <p className="text-muted-foreground">{status}</p>
        </div>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-32 w-32 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
          </div>
          <div className="relative flex items-center justify-center mb-6">
            <div className="relative">
              <Loader2 className="h-24 w-24 text-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">{Math.round(progress)}%</span>
              </div>
            </div>
          </div>
        </div>

        <Progress value={progress} className="mb-8 h-2" />

        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            Using AI to transcribe and detect explicit content in all languages
          </p>
        </div>
      </div>
    </div>
  );
};
