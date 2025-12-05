import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Home, Shield } from "lucide-react";

// Secret admin emails - only these can access admin mode
const ADMIN_EMAILS = ["admin@fweai.com", "creator@fweai.com"];
const ADMIN_SECRET_PARAM = "fweai2024";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const [showAdminToggle, setShowAdminToggle] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Check if admin toggle should be visible
  useEffect(() => {
    const adminParam = searchParams.get('admin');
    if (adminParam === ADMIN_SECRET_PARAM) {
      setShowAdminToggle(true);
    }
  }, [searchParams]);

  // Also show admin toggle when admin email is typed
  useEffect(() => {
    const isAdminEmail = ADMIN_EMAILS.some(adminEmail => 
      email.toLowerCase() === adminEmail.toLowerCase()
    );
    if (isAdminEmail) {
      setShowAdminToggle(true);
    }
  }, [email]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // If admin mode is enabled, verify user has admin role before granting bypass
        if (adminMode) {
          const { data: roleData, error: roleError } = await supabase
            .rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
          
          if (roleError || !roleData) {
            console.warn("Admin mode requested but user lacks admin role");
            toast({
              title: "Admin access denied",
              description: "You don't have admin privileges",
              variant: "destructive",
            });
          } else {
            sessionStorage.setItem('adminBypass', 'true');
            toast({
              title: "Welcome back, Admin!",
              description: "Signed in with admin bypass enabled",
            });
          }
        } else {
          toast({
            title: "Welcome back!",
            description: "Successfully signed in",
          });
        }
        
        navigate("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

        if (error) throw error;

        toast({
          title: "Account created!",
          description: "You can now start analyzing audio",
        });
        
        navigate("/");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Authentication Error",
        description: error.message || "Failed to authenticate",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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

      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl p-8 animate-slide-up">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">
              <span className="text-primary neon-text">Fwea-I</span> Audio Cleaner
            </h1>
            <p className="text-muted-foreground">
              {isLogin ? "Welcome back" : "Create your account"}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
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
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
              />
            </div>

            {/* Admin Mode Toggle - Only show for authorized access */}
            {isLogin && showAdminToggle && (
              <>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-accent" />
                    <span className="text-sm text-muted-foreground">Admin Mode</span>
                  </div>
                  <Switch
                    checked={adminMode}
                    onCheckedChange={setAdminMode}
                    disabled={loading}
                  />
                </div>
                {adminMode && (
                  <p className="text-xs text-accent text-center">
                    Admin mode bypasses payment for testing purposes
                  </p>
                )}
              </>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>{isLogin ? "Sign In" : "Sign Up"}</>
              )}
            </Button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-sm text-primary hover:underline"
                disabled={loading}
              >
                {isLogin
                  ? "Don't have an account? Sign up"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
