import { useCallback, useState } from "react";
import { Upload, FileAudio } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UploadZoneProps {
  onFileUpload: (file: File) => void;
}

export const UploadZone = ({ onFileUpload }: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        onFileUpload(file);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload an audio file (MP3, WAV, etc.)",
          variant: "destructive",
        });
      }
    },
    [onFileUpload, toast]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-20">
      <div className="text-center mb-8 animate-slide-up">
        <h2 className="text-4xl font-bold mb-4">
          Upload Your <span className="text-primary neon-text">Dirty Version</span>
        </h2>
        <p className="text-muted-foreground text-lg">
          Drag and drop your audio file, or click to browse
        </p>
      </div>

      <label
        className={`
          relative block w-full min-h-[300px] rounded-2xl border-4 border-dashed
          transition-all duration-300 cursor-pointer group
          ${
            isDragging
              ? "border-primary bg-primary/10 neon-border"
              : "border-border hover:border-primary/50 hover:bg-card/50"
          }
          glass-card
        `}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileInput}
          className="hidden"
        />

        <div className="flex flex-col items-center justify-center h-full py-16 px-8">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-glow-pulse" />
            <div className="relative bg-gradient-to-br from-primary to-accent p-6 rounded-full group-hover:scale-110 transition-transform duration-300">
              {isDragging ? (
                <FileAudio className="h-16 w-16 text-background" />
              ) : (
                <Upload className="h-16 w-16 text-background" />
              )}
            </div>
          </div>

          <p className="text-2xl font-bold mb-3 text-foreground">
            {isDragging ? "Drop it here!" : "Drag & Drop Audio File"}
          </p>
          <p className="text-muted-foreground mb-6">or</p>
          <div className="px-6 py-3 rounded-lg border-2 border-primary bg-primary/10 text-primary font-semibold group-hover:bg-primary/20 transition-colors">
            Browse Files
          </div>

          <div className="mt-8 text-sm text-muted-foreground">
            <p>Supported formats: MP3, WAV, FLAC, OGG</p>
            <p className="mt-1">Maximum file size: 100MB</p>
          </div>
        </div>
      </label>
    </div>
  );
};
