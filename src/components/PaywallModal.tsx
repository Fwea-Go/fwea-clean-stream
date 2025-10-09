import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Crown, Zap } from "lucide-react";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PaywallModal = ({ open, onOpenChange }: PaywallModalProps) => {
  const features = [
    "Download full clean version",
    "Unlimited audio processing",
    "Priority processing speed",
    "Advanced language detection",
    "Batch processing support",
    "Commercial use license",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl glass-card border-primary/30">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-glow-pulse" />
              <div className="relative bg-gradient-to-br from-primary to-accent p-4 rounded-full">
                <Crown className="h-12 w-12 text-background" />
              </div>
            </div>
          </div>
          <DialogTitle className="text-center text-3xl">
            Unlock <span className="text-primary neon-text">Premium</span>
          </DialogTitle>
          <DialogDescription className="text-center text-lg">
            Get unlimited access to clean versions and advanced features
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-6">
          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="glass-card p-6 rounded-xl border-border hover:border-primary/50 transition-all duration-300">
              <div className="text-center mb-4">
                <div className="text-3xl font-bold mb-2">$9.99</div>
                <div className="text-muted-foreground">Single Track</div>
              </div>
              <Button className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90">
                Purchase Now
              </Button>
            </div>

            <div className="glass-card p-6 rounded-xl border-primary neon-border relative overflow-hidden">
              <div className="absolute top-2 right-2">
                <Badge className="bg-secondary text-background border-0">
                  <Zap className="h-3 w-3 mr-1" />
                  Best Value
                </Badge>
              </div>
              <div className="text-center mb-4">
                <div className="text-3xl font-bold mb-2">$29.99</div>
                <div className="text-muted-foreground">Monthly Unlimited</div>
              </div>
              <Button className="w-full bg-gradient-to-r from-secondary to-accent hover:opacity-90">
                Subscribe Now
              </Button>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-3">
            <h4 className="font-semibold text-lg mb-4">Premium Features:</h4>
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="bg-primary/20 p-1 rounded-full">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span className="text-foreground">{feature}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-border">
            <p className="text-sm text-muted-foreground text-center">
              Secure payment powered by Stripe • Cancel anytime • 30-day money-back guarantee
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Mock Badge component if needed
const Badge = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${className}`}>
    {children}
  </span>
);
