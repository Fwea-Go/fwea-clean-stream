import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DemoProgressProps {
  onComplete: () => void;
}

export const DemoProgress = ({ onComplete }: DemoProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Uploading demo audio file...");

  useEffect(() => {
    // Clear any previous real analysis data
    sessionStorage.removeItem('audioAnalysis');
    sessionStorage.removeItem('vocalsUrl');
    sessionStorage.removeItem('instrumentalUrl');
    
    const demoSteps = [
      { progress: 5, status: "Uploading demo audio file...", delay: 500 },
      { progress: 10, status: "Separating vocals from instrumentals...", delay: 2000 },
      { progress: 40, status: "Analyzing vocals for explicit content...", delay: 3000 },
      { progress: 70, status: "Detecting explicit words across languages...", delay: 2000 },
      { progress: 90, status: "Finalizing clean version...", delay: 1500 },
      { progress: 100, status: "Demo complete!", delay: 1000 },
    ];

    let currentStep = 0;

    const runDemoStep = () => {
      if (currentStep < demoSteps.length) {
        const step = demoSteps[currentStep];
        setProgress(step.progress);
        setStatus(step.status);
        
        setTimeout(() => {
          currentStep++;
          runDemoStep();
        }, step.delay);
      } else {
        // Create demo data
        const demoData = {
          success: true,
          transcript: "This is a demo song with some explicit words. Fuck this shit, I'm gonna make it big. Yeah, we're living life to the fullest.",
          explicitWords: [
            { word: "Fuck", start: 2.5, end: 2.8, language: "en", confidence: 0.95 },
            { word: "shit", start: 3.2, end: 3.5, language: "en", confidence: 0.93 }
          ],
          language: "en",
          duration: 180
        };

        sessionStorage.setItem('audioAnalysis', JSON.stringify(demoData));
        sessionStorage.setItem('vocalsUrl', 'demo');
        sessionStorage.setItem('instrumentalUrl', 'demo');
        sessionStorage.setItem('isDemo', 'true');

        setTimeout(() => {
          onComplete();
        }, 1000);
      }
    };

    runDemoStep();
  }, [onComplete]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <div className="glass-card rounded-2xl p-8 md:p-12 animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">
            Demo: Analyzing <span className="text-primary neon-text">Audio</span>
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
          <p className="text-xs text-muted-foreground italic">
            This is a demo showing how the process works
          </p>
        </div>
      </div>
    </div>
  );
};
