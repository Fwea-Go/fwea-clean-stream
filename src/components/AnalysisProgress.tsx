import { useEffect, useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AnalysisProgressProps {
  onComplete: () => void;
}

export const AnalysisProgress = ({ onComplete }: AnalysisProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    "Loading audio file...",
    "Analyzing waveform patterns...",
    "Detecting explicit content...",
    "Processing omnilingual detection...",
    "Generating clean version...",
    "Finalizing results...",
  ];

  useEffect(() => {
    const totalDuration = 5000; // 5 seconds
    const stepDuration = totalDuration / steps.length;
    const progressInterval = 50;
    const progressIncrement = (100 / totalDuration) * progressInterval;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setTimeout(onComplete, 500);
          return 100;
        }
        return Math.min(prev + progressIncrement, 100);
      });
    }, progressInterval);

    return () => clearInterval(timer);
  }, [onComplete, steps.length]);

  useEffect(() => {
    const stepIndex = Math.floor((progress / 100) * steps.length);
    setCurrentStep(Math.min(stepIndex, steps.length - 1));
  }, [progress, steps.length]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20">
      <div className="glass-card rounded-2xl p-8 md:p-12 animate-slide-up">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-3">
            Analyzing Your <span className="text-primary neon-text">Audio</span>
          </h2>
          <p className="text-muted-foreground">
            AI is detecting explicit content across all languages
          </p>
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

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300
                ${
                  index < currentStep
                    ? "bg-primary/20 text-foreground"
                    : index === currentStep
                    ? "bg-primary/30 text-foreground neon-border"
                    : "bg-muted/20 text-muted-foreground"
                }
              `}
            >
              {index < currentStep ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-current" />
              )}
              <span className="font-medium">{step}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
