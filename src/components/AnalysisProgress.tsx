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
        
        // Clear any previous demo or analysis data
        sessionStorage.removeItem('isDemo');
        sessionStorage.removeItem('audioAnalysis');
        sessionStorage.removeItem('vocalsUrl');
        sessionStorage.removeItem('instrumentalUrl');
        
        // Get auth session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error("You must be logged in to analyze audio");
        }

        console.log("[AnalysisProgress] Auth session found, uploading to storage");

        setProgress(5);
        setStatus("Uploading audio file...");

        // Upload file directly to storage
        const storagePath = `${session.user.id}/uploads/${Date.now()}-${audioFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("audio-files")
          .upload(storagePath, audioFile, {
            contentType: audioFile.type,
            upsert: true,
          });

        if (uploadError) {
          console.error("[AnalysisProgress] Upload error:", uploadError);
          throw new Error(`Failed to upload file: ${uploadError.message}`);
        }

        console.log("[AnalysisProgress] File uploaded to:", storagePath);

        setProgress(10);
        setStatus("Separating vocals from instrumentals...");

        // Step 1: Separate audio into vocals and instrumental
        const { data: separationData, error: separationError } = await supabase.functions.invoke("separate-audio", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            storagePath: storagePath,
            fileName: audioFile.name,
          },
        });

        if (separationError || !separationData?.success) {
          console.error("[AnalysisProgress] Separation error:", separationError);
          const errorMsg = separationData?.error || separationError?.message || "Failed to separate audio";
          throw new Error(errorMsg);
        }

        console.log("[AnalysisProgress] Audio separation complete");

        setProgress(40);
        setStatus("Analyzing vocals for explicit content...");

        // Step 2: Analyze only the vocal stem for explicit content
        const { data, error } = await supabase.functions.invoke("analyze-audio", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            storagePath: separationData.vocalsStoragePath,
            fileName: `${audioFile.name}-vocals`,
          },
        });

        if (error) {
          console.error("[AnalysisProgress] Analysis error:", error);
          // Extract the actual error message from the backend
          const errorMsg = error.message || "Failed to analyze audio";
          throw new Error(errorMsg);
        }

        if (!data || !data.success) {
          console.error("[AnalysisProgress] Analysis unsuccessful:", data);
          // Extract the actual error message from the backend response
          const errorMsg = data?.error || "Analysis failed";
          throw new Error(errorMsg);
        }

        console.log("[AnalysisProgress] Analysis successful:", {
          explicitWordsCount: data.explicitWords?.length,
          language: data.language,
          duration: data.duration
        });

        setProgress(100);
        setStatus("Analysis complete!");

        // Store the results with separated stems
        sessionStorage.setItem('audioAnalysis', JSON.stringify(data));
        sessionStorage.setItem('vocalsUrl', separationData.vocalsUrl);
        sessionStorage.setItem('instrumentalUrl', separationData.instrumentalUrl);

        setTimeout(() => {
          onComplete();
        }, 1000);

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
            {progress < 40 
              ? "Using AI to separate vocals from instrumentals" 
              : "Analyzing vocals for explicit content in all languages"}
          </p>
        </div>
      </div>
    </div>
  );
};
