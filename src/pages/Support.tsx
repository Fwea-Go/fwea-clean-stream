import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Home, Loader2, Send, Bug, Lightbulb, CreditCard, HelpCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function Support() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");

  const categoryIcons: Record<string, React.ReactNode> = {
    bug: <Bug className="h-4 w-4" />,
    feature: <Lightbulb className="h-4 w-4" />,
    billing: <CreditCard className="h-4 w-4" />,
    other: <HelpCircle className="h-4 w-4" />,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: user?.id || null,
        email,
        subject,
        description,
        category,
      });

      if (error) throw error;

      toast({
        title: "Ticket Submitted!",
        description: "We'll get back to you as soon as possible.",
      });

      // Reset form
      setSubject("");
      setDescription("");
      setCategory("bug");
    } catch (error: any) {
      console.error("Support ticket error:", error);
      toast({
        title: "Error",
        description: "Failed to submit ticket. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-12">
      {/* Home Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/")}
        className="absolute top-4 left-4 gap-2 text-primary hover:text-primary/80"
      >
        <Home className="h-4 w-4" />
        Home
      </Button>

      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">
            <span className="text-primary neon-text">Support</span> Center
          </h1>
          <p className="text-muted-foreground text-lg">
            Need help? We're here for you.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* FAQ Section */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="item-1" className="border-border/30">
                <AccordionTrigger className="text-left">
                  What audio formats are supported?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  We support MP3, WAV, M4A, FLAC, and most common audio formats. 
                  For best results, use high-quality vocal recordings or acapellas.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2" className="border-border/30">
                <AccordionTrigger className="text-left">
                  How does the profanity detection work?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Our AI-powered system transcribes your audio and analyzes it for 
                  explicit content in 100+ languages. It then mutes the detected 
                  segments while preserving the original timing.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3" className="border-border/30">
                <AccordionTrigger className="text-left">
                  What's included in the free preview?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  Free users can preview the first 30 seconds of the cleaned audio 
                  with real-time muting. To download the full clean version, you'll 
                  need to purchase or subscribe.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-4" className="border-border/30">
                <AccordionTrigger className="text-left">
                  Can I get a refund?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  If you're not satisfied with the quality of your clean version, 
                  contact us within 7 days and we'll work with you to resolve the 
                  issue or process a refund.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Support Ticket Form */}
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-2xl font-bold mb-6">Submit a Ticket</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug">
                      <div className="flex items-center gap-2">
                        <Bug className="h-4 w-4" />
                        Bug Report
                      </div>
                    </SelectItem>
                    <SelectItem value="feature">
                      <div className="flex items-center gap-2">
                        <Lightbulb className="h-4 w-4" />
                        Feature Request
                      </div>
                    </SelectItem>
                    <SelectItem value="billing">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Billing
                      </div>
                    </SelectItem>
                    <SelectItem value="other">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4" />
                        Other
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  type="text"
                  placeholder="Brief description of your issue"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe your issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  disabled={loading}
                  rows={5}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Ticket
                  </>
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">
            For urgent matters, email us at{" "}
            <a href="mailto:support@fwea-i.com" className="text-primary hover:underline">
              support@fwea-i.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
