import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
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
      let progressTimer: NodeJS.Timeout | null = null;
      
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

        // Sanitize filename to remove special characters that can cause storage issues
        const sanitizedFileName = audioFile.name
          .replace(/[^\w\s.-]/g, '') // Remove special chars except spaces, dots, dashes
          .replace(/\s+/g, '_'); // Replace spaces with underscores

        // Upload file directly to storage
        const storagePath = `${session.user.id}/uploads/${Date.now()}-${sanitizedFileName}`;
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
        setStatus("Separating vocals from instrumentals (this may take 2-5 minutes)...");

        // Start gradual progress simulation
        progressTimer = setInterval(() => {
          setProgress(prev => {
            if (prev < 38) return prev + 0.3;
            return prev;
          });
        }, 1500);

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
          if (progressTimer) clearInterval(progressTimer);
          console.error("[AnalysisProgress] Separation error:", separationError);
          const errorMsg = separationData?.error || separationError?.message || "Failed to separate audio";
          
          if (errorMsg.includes('timed out') || errorMsg.includes('longer than expected')) {
            throw new Error("Audio separation timed out. This usually happens with songs over 4 minutes. Please try with a shorter song or try again.");
          }
          
          if (errorMsg.includes('payment') || errorMsg.includes('credits')) {
            throw new Error("Audio separation service requires credits. Please contact support.");
          }
          
          throw new Error(errorMsg);
        }

        if (progressTimer) clearInterval(progressTimer);
        console.log("[AnalysisProgress] Audio separation complete");

        setProgress(40);
        setStatus("Analyzing vocals for explicit content (this may take 2-3 minutes)...");

        // Continue gradual progress simulation for analysis phase
        progressTimer = setInterval(() => {
          setProgress(prev => {
            if (prev < 92) return prev + 0.2;
            return prev;
          });
        }, 2000);

        // Step 2: Analyze with automatic retry for network timeouts
        let analyzeData = null;
        let analyzeError = null;
        const maxRetries = 5;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            console.log(`[AnalysisProgress] Calling analyze-audio (attempt ${attempt}/${maxRetries})...`);
            
            const response = await supabase.functions.invoke("analyze-audio", {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
              body: {
                storagePath: separationData.vocalsStoragePath,
                fileName: `${audioFile.name}-vocals`,
              },
            });
            
            analyzeData = response.data;
            analyzeError = response.error;
            
            if (!analyzeError && analyzeData?.success) {
              console.log("[AnalysisProgress] Analysis successful on attempt", attempt);
              break;
            }
            
            if (attempt < maxRetries) {
              console.log(`[AnalysisProgress] Retrying in 3 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (fetchError) {
            console.error(`[AnalysisProgress] Network error on attempt ${attempt}:`, fetchError);
            analyzeError = fetchError as any;
            
            if (attempt < maxRetries) {
              console.log(`[AnalysisProgress] Retrying after network error in 3 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }

        if (progressTimer) clearInterval(progressTimer);

        if (analyzeError) {
          console.error("[AnalysisProgress] Analysis error:", analyzeError);
          const errorMsg = analyzeError.message || "Failed to analyze audio";
          
          if (errorMsg.includes("Whisper API failed after")) {
            throw new Error("AI transcription service is temporarily unavailable. Please try again in a few moments.");
          }
          
          if (errorMsg.includes("too large")) {
            throw new Error(errorMsg + " Try using a shorter audio clip (under 3 minutes recommended).");
          }
          
          if (errorMsg.includes("Failed to fetch")) {
            throw new Error("Connection timeout. Please try again - the backend is processing but taking longer than expected.");
          }
          
          throw new Error(errorMsg);
        }

        if (!analyzeData || !analyzeData.success) {
          console.error("[AnalysisProgress] Analysis unsuccessful:", analyzeData);
          const errorMsg = analyzeData?.error || "Analysis failed";
          
          if (errorMsg.includes("Whisper API") || errorMsg.includes("server_error")) {
            throw new Error("AI transcription service is temporarily unavailable. Please try again in a few moments.");
          }
          
          if (errorMsg.includes("too large")) {
            throw new Error(errorMsg + " Try using a shorter audio clip (under 3 minutes recommended).");
          }
          
          throw new Error(errorMsg);
        }

        console.log("[AnalysisProgress] Analysis successful:", {
          explicitWordsCount: analyzeData.explicitWords?.length,
          language: analyzeData.language,
          duration: analyzeData.duration
        });

        setProgress(100);
        setStatus("Analysis complete!");

        // Store the results with separated stems
        sessionStorage.setItem('audioAnalysis', JSON.stringify(analyzeData));
        sessionStorage.setItem('vocalsUrl', separationData.vocalsUrl);
        sessionStorage.setItem('instrumentalUrl', separationData.instrumentalUrl);

        setTimeout(() => {
          onComplete();
        }, 1000);

      } catch (error) {
        if (progressTimer) clearInterval(progressTimer);
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

    return () => {
      clearTimeout(timer);
    };
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
              ? "Using AI to separate vocals from instrumentals (2-5 minutes for full songs)" 
              : "Analyzing vocals for explicit content in all languages (2-3 minutes)"}
          </p>
          {progress >= 10 && progress < 95 && (
            <p className="text-xs text-accent animate-pulse">
              Please wait... AI processing is in progress
            </p>
          )}
        </div>
      </div>
    </div>
  );
};