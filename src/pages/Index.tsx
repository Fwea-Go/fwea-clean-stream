import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/Hero";
import { UploadZone } from "@/components/UploadZone";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { DemoProgress } from "@/components/DemoProgress";
import { ResultsView } from "@/components/ResultsView";
import { LanguageBanner } from "@/components/LanguageBanner";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type AppState = "hero" | "upload" | "analyzing" | "demo" | "results";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("hero");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if we need to show results after analysis
    const analysis = sessionStorage.getItem('audioAnalysis');
    if (analysis && uploadedFile) {
      setAppState("results");
    }
  }, [uploadedFile]);

  const handleGetStarted = () => {
    if (!user) {
      navigate("/auth");
      return;
    }
    setAppState("upload");
  };

  const handleShowDemo = () => {
    sessionStorage.removeItem('audioAnalysis');
    sessionStorage.removeItem('vocalsUrl');
    sessionStorage.removeItem('instrumentalUrl');
    sessionStorage.removeItem('isDemo');
    setAppState("demo");
  };

  const handleDemoComplete = () => {
    setAppState("results");
  };

  const handleFileUpload = (file: File) => {
    // Clear previous analysis data
    sessionStorage.removeItem('audioAnalysis');
    sessionStorage.removeItem('vocalsUrl');
    sessionStorage.removeItem('instrumentalUrl');
    setUploadedFile(file);
    setAppState("analyzing");
  };

  const handleAnalyzeAnother = () => {
    // Clear all data and go back to upload
    sessionStorage.removeItem('audioAnalysis');
    sessionStorage.removeItem('vocalsUrl');
    sessionStorage.removeItem('instrumentalUrl');
    setUploadedFile(null);
    setAppState("upload");
  };

  const handleAnalysisComplete = () => {
    setAppState("results");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen relative pb-16">
      {user && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </Button>
        </div>
      )}
      
      {appState === "hero" && <Hero onGetStarted={handleGetStarted} onShowDemo={handleShowDemo} />}
      {appState === "upload" && <UploadZone onFileUpload={handleFileUpload} />}
      {appState === "analyzing" && uploadedFile && (
        <AnalysisProgress onComplete={handleAnalysisComplete} audioFile={uploadedFile} />
      )}
      {appState === "demo" && <DemoProgress onComplete={handleDemoComplete} />}
      {appState === "results" && (
        <ResultsView 
          fileName={uploadedFile?.name || "Demo Song"} 
          onAnalyzeAnother={handleAnalyzeAnother} 
        />
      )}
      
      <LanguageBanner />
    </main>
  );
};

export default Index;
