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

        // Step 1: Separate audio into vocals and instrumental with retry logic
        // Note: This can take 2-5 minutes for full-length songs
        let separationData, separationError;
        let separationRetryCount = 0;
        const maxSeparationRetries = 1;
        
        // Simulate progress during separation
        const separationProgressInterval = setInterval(() => {
          setProgress(prev => Math.min(prev + 2, 38));
        }, 8000);
        
        while (separationRetryCount <= maxSeparationRetries) {
          try {
            console.log(`[AnalysisProgress] Calling separate-audio (attempt ${separationRetryCount + 1}/${maxSeparationRetries + 1})...`);
            
            const result = await supabase.functions.invoke("separate-audio", {
              body: {
                storagePath: storagePath,
                fileName: audioFile.name,
              },
            });
            
            clearInterval(separationProgressInterval);
            separationData = result.data;
            separationError = result.error;
            
            // If successful, break out of retry loop
            if (!separationError && separationData?.success) {
              break;
            }
            
            // If we got an error, check if it's worth retrying
            if (separationError) {
              const errorMsg = separationError.message || "";
              
              // Don't retry on certain errors
              if (errorMsg.includes('payment') || errorMsg.includes('credits')) {
                break;
              }
            }
            
            separationRetryCount++;
            
            if (separationRetryCount <= maxSeparationRetries) {
              console.log(`[AnalysisProgress] Retrying separation in 5 seconds...`);
              setStatus(`Separation taking longer than expected, retrying... (attempt ${separationRetryCount + 1}/${maxSeparationRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              setStatus("Separating vocals from instrumentals (this may take 2-5 minutes)...");
            }
          } catch (fetchError) {
            clearInterval(separationProgressInterval);
            console.error(`[AnalysisProgress] Separation fetch error on attempt ${separationRetryCount + 1}:`, fetchError);
            separationError = fetchError as any;
            separationRetryCount++;
            
            if (separationRetryCount <= maxSeparationRetries) {
              console.log(`[AnalysisProgress] Retrying after fetch error...`);
              setStatus(`Connection issue during separation, retrying... (attempt ${separationRetryCount + 1}/${maxSeparationRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, 5000));
              setStatus("Separating vocals from instrumentals (this may take 2-5 minutes)...");
            }
          }
        }

        if (separationError || !separationData?.success) {
          console.error("[AnalysisProgress] Separation error after retries:", separationError);
          const errorMsg = separationData?.error || separationError?.message || "Failed to separate audio";
          
          // Provide helpful error messages
          if (errorMsg.includes('timed out') || errorMsg.includes('longer than expected')) {
            throw new Error("Audio separation timed out. This usually happens with very long songs. Please try with a shorter song or try again.");
          }
          
          if (errorMsg.includes('payment') || errorMsg.includes('credits')) {
            throw new Error("Audio separation service requires credits. Please contact support.");
          }
          
          if (errorMsg.includes("Failed to fetch") || errorMsg.includes("send a request")) {
            throw new Error("The separation is taking longer than expected. The Replicate service might be under heavy load. Please try again in a few moments.");
          }
          
          throw new Error(errorMsg);
        }

        console.log("[AnalysisProgress] Audio separation complete");

        setProgress(40);
        setStatus("Analyzing vocals for explicit content (this may take 2-3 minutes)...");

        // Simulate progress during analysis
        const analysisProgressInterval = setInterval(() => {
          setProgress(prev => Math.min(prev + 3, 95));
        }, 10000);

        // Step 2: Analyze only the vocal stem for explicit content with retry logic
        let data, error;
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            console.log(`[AnalysisProgress] Calling analyze-audio (attempt ${retryCount + 1}/${maxRetries + 1})...`);
            
            const result = await supabase.functions.invoke("analyze-audio", {
              body: {
                storagePath: separationData.vocalsStoragePath,
                fileName: `${audioFile.name}-vocals`,
              },
            });
            
            data = result.data;
            error = result.error;
            
            // If successful, break out of retry loop
            if (!error && data?.success) {
              clearInterval(analysisProgressInterval);
              break;
            }
            
            // If we got an error, check if it's worth retrying
            if (error) {
              const errorMsg = error.message || "";
              
              // Don't retry on certain errors
              if (errorMsg.includes("Whisper API failed after") || 
                  errorMsg.includes("too large") ||
                  errorMsg.includes("payment") ||
                  errorMsg.includes("credits")) {
                break;
              }
            }
            
            retryCount++;
            
            if (retryCount <= maxRetries) {
              console.log(`[AnalysisProgress] Retrying in 3 seconds...`);
              setStatus(`Connection issue, retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              setStatus("Analyzing vocals for explicit content (this may take 2-3 minutes)...");
            }
          } catch (fetchError) {
            console.error(`[AnalysisProgress] Fetch error on attempt ${retryCount + 1}:`, fetchError);
            error = fetchError as any;
            retryCount++;
            
            if (retryCount <= maxRetries) {
              console.log(`[AnalysisProgress] Retrying after fetch error...`);
              setStatus(`Connection issue, retrying... (attempt ${retryCount + 1}/${maxRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, 3000));
              setStatus("Analyzing vocals for explicit content (this may take 2-3 minutes)...");
            }
          }
        }

        if (error) {
          clearInterval(analysisProgressInterval);
          console.error("[AnalysisProgress] Analysis error after retries:", error);
          const errorMsg = error.message || "Failed to analyze audio";
          
          // Check for specific error types
          if (errorMsg.includes("Whisper API failed after")) {
            throw new Error("OpenAI Whisper is temporarily unavailable. This is an OpenAI server issue - please try again in a few moments.");
          }
          
          if (errorMsg.includes("too large")) {
            throw new Error(errorMsg + " Try using a shorter audio clip (under 3 minutes recommended).");
          }
          
          if (errorMsg.includes("Failed to fetch") || errorMsg.includes("send a request")) {
            throw new Error("The analysis is taking longer than expected. The Hetzner server might be under heavy load. Please try again in a few moments.");
          }
          
          throw new Error(errorMsg);
        }

        if (!data || !data.success) {
          clearInterval(analysisProgressInterval);
          console.error("[AnalysisProgress] Analysis unsuccessful:", data);
          const errorMsg = data?.error || "Analysis failed";
          
          if (errorMsg.includes("Whisper API") || errorMsg.includes("server_error")) {
            throw new Error("OpenAI Whisper is temporarily unavailable. This is an OpenAI server issue - please try again in a few moments.");
          }
          
          if (errorMsg.includes("too large")) {
            throw new Error(errorMsg + " Try using a shorter audio clip (under 3 minutes recommended).");
          }
          
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
              ? "Using AI to separate vocals from instrumentals (2-5 minutes for full songs)" 
              : "Analyzing vocals for explicit content in all languages"}
          </p>
          {progress >= 10 && progress < 40 && (
            <p className="text-xs text-accent animate-pulse">
              Please wait... Processing can take several minutes for longer songs
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
