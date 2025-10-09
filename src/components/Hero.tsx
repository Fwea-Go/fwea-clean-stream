import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

interface HeroProps {
  onGetStarted: () => void;
  onShowDemo: () => void;
}

export const Hero = ({ onGetStarted, onShowDemo }: HeroProps) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Animated background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-glow-pulse" />
        <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-3xl animate-glow-pulse" style={{ animationDelay: "1s" }} />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center animate-slide-up">
        <div className="mb-8">
          <h1 className="text-6xl md:text-8xl font-black mb-4 tracking-tight">
            <span className="text-foreground" style={{ textShadow: '0 0 10px hsl(189 100% 50%), 0 0 20px hsl(189 100% 50%), 0 0 30px hsl(189 100% 50%)' }}>Fwea-I</span>
          </h1>
          <p className="text-3xl md:text-4xl font-bold text-foreground mb-2">
            Omnilingual Clean Version Editor
          </p>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-primary to-transparent" />
            <p className="text-sm uppercase tracking-wider">AI-Powered Explicit Detection</p>
            <div className="h-px w-12 bg-gradient-to-r from-transparent via-primary to-transparent" />
          </div>
        </div>

        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
          Advanced AI technology that detects and removes explicit content in{" "}
          <span className="text-secondary font-semibold">any language</span>.
          Get clean versions of your tracks in seconds with professional-grade results.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
          <Button
            size="lg"
            onClick={onGetStarted}
            className="group relative px-8 py-6 text-lg font-bold bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all duration-300 glow-hover"
          >
            <Upload className="mr-2 h-5 w-5" />
            Upload & Analyze
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onShowDemo}
            className="px-8 py-6 text-lg font-semibold border-2 border-primary/50 hover:border-primary hover:bg-primary/10 transition-all duration-300"
          >
            See How It Works
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          <div className="glass-card p-6 rounded-xl border-primary/30 hover:border-primary/60 transition-all duration-300">
            <div className="text-primary text-4xl font-black mb-3">100+</div>
            <div className="text-foreground font-semibold mb-2">Languages Supported</div>
            <p className="text-sm text-muted-foreground">Omnilingual detection across all major languages</p>
          </div>
          <div className="glass-card p-6 rounded-xl border-secondary/30 hover:border-secondary/60 transition-all duration-300">
            <div className="text-secondary text-4xl font-black mb-3">99.8%</div>
            <div className="text-foreground font-semibold mb-2">Accuracy Rate</div>
            <p className="text-sm text-muted-foreground">Industry-leading explicit content detection</p>
          </div>
          <div className="glass-card p-6 rounded-xl border-accent/30 hover:border-accent/60 transition-all duration-300">
            <div className="text-accent text-4xl font-black mb-3">&lt;60s</div>
            <div className="text-foreground font-semibold mb-2">Processing Time</div>
            <p className="text-sm text-muted-foreground">Lightning-fast analysis and generation</p>
          </div>
        </div>
      </div>
    </section>
  );
};
