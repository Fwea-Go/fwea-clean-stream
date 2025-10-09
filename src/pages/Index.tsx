import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Hero } from "@/components/Hero";
import { UploadZone } from "@/components/UploadZone";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { ResultsView } from "@/components/ResultsView";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

type AppState = "hero" | "upload" | "analyzing" | "results";

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

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    setAppState("analyzing");
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
    <main className="min-h-screen relative">
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
      
      {appState === "hero" && <Hero onGetStarted={handleGetStarted} />}
      {appState === "upload" && <UploadZone onFileUpload={handleFileUpload} />}
      {appState === "analyzing" && uploadedFile && (
        <AnalysisProgress onComplete={handleAnalysisComplete} audioFile={uploadedFile} />
      )}
      {appState === "results" && uploadedFile && <ResultsView fileName={uploadedFile.name} />}
    </main>
  );
};

export default Index;
