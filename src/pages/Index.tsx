import { useState } from "react";
import { Hero } from "@/components/Hero";
import { UploadZone } from "@/components/UploadZone";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { ResultsView } from "@/components/ResultsView";

type AppState = "hero" | "upload" | "analyzing" | "results";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("hero");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleGetStarted = () => {
    setAppState("upload");
  };

  const handleFileUpload = (file: File) => {
    setUploadedFile(file);
    setAppState("analyzing");
  };

  const handleAnalysisComplete = () => {
    setAppState("results");
  };

  return (
    <main className="min-h-screen">
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
