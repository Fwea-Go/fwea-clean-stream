import { useCallback, useState } from "react";
import { Upload, FileAudio, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface UploadZoneProps {
  onFileUpload: (file: File, isVideo?: boolean) => void;
}

export const UploadZone = ({ onFileUpload }: UploadZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const isValidFileType = (file: File) => {
    const audioTypes = ["audio/mpeg", "audio/wav", "audio/flac", "audio/ogg", "audio/mp4", "audio/x-m4a", "audio/aac"];
    const videoTypes = ["video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"];

    return (
      file.type.startsWith("audio/") ||
      file.type.startsWith("video/") ||
      audioTypes.includes(file.type) ||
      videoTypes.includes(file.type) ||
      file.name.toLowerCase().endsWith(".m4a") ||
      file.name.toLowerCase().endsWith(".mp4") ||
      file.name.toLowerCase().endsWith(".mov") ||
      file.name.toLowerCase().endsWith(".webm")
    );
  };

  const isVideoFile = (file: File) => {
    return (
      file.type.startsWith("video/") ||
      file.name.toLowerCase().endsWith(".mp4") ||
      file.name.toLowerCase().endsWith(".mov") ||
      file.name.toLowerCase().endsWith(".webm")
    );
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (!isValidFileType(file)) {
        toast({
          title: "Invalid file type",
          description: "Please upload an audio file (MP3, WAV, M4A, etc.) or video file (MP4, MOV, WebM)",
          variant: "destructive",
        });
        return;
      }

      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > 100) {
        toast({
          title: "File too large",
          description: `File size is ${fileSizeMB.toFixed(1)}MB. Maximum is 25MB.`,
          variant: "destructive",
        });
        return;
      }

      // Warning for large files
      if (fileSizeMB > 50) {
        toast({
          title: "Large file detected",
          description:
            "Large files may take longer to process. Consider using a shorter clip (2-3 minutes) for best results.",
          variant: "default",
        });
      }

      // Show video conversion message
      if (isVideoFile(file)) {
        toast({
          title: "Video detected",
          description: "We'll extract the audio from your video automatically.",
        });
      }

      onFileUpload(file, isVideoFile(file));
    },
    [onFileUpload, toast],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        if (!isValidFileType(file)) {
          toast({
            title: "Invalid file type",
            description: "Please upload an audio file (MP3, WAV, M4A, etc.) or video file (MP4, MOV, WebM)",
            variant: "destructive",
          });
          return;
        }

        // Check file size (25MB limit as stated in UI)
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 100) {
          toast({
            title: "File too large",
            description: `File size is ${fileSizeMB.toFixed(1)}MB. Maximum is 25MB.`,
            variant: "destructive",
          });
          return;
        }

        // Warning for large files that might have issues
        if (fileSizeMB > 50) {
          toast({
            title: "Large file detected",
            description:
              "Large files may take longer to process and could exceed analysis limits. Consider using a shorter clip (2-3 minutes) for best results.",
            variant: "default",
          });
        }

        // Show video conversion message
        if (isVideoFile(file)) {
          toast({
            title: "Video detected",
            description: "We'll extract the audio from your video automatically.",
          });
        }

        onFileUpload(file, isVideoFile(file));
      }
    },
    [onFileUpload, toast],
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-20">
      <div className="text-center mb-8 animate-slide-up">
        <h2 className="text-4xl font-bold mb-4">
          Upload Your <span className="text-primary neon-text">Vocal Recording</span>
        </h2>
        <p className="text-muted-foreground text-lg mb-2">Drag and drop your audio or video file, or click to browse</p>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground mt-3">
          <span>🎤 Works best with:</span>
          <Badge variant="outline" className="border-primary/50">
            Acapellas
          </Badge>
          <Badge variant="outline" className="border-secondary/50">
            Vocal Stems
          </Badge>
          <Badge variant="outline" className="border-accent/50">
            Voice Recordings
          </Badge>
          <Badge variant="outline" className="border-primary/50">
            Spoken Word
          </Badge>
        </div>
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
          accept="audio/*,video/mp4,video/quicktime,video/webm,.m4a,.mp4,.mov,.webm"
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
            {isDragging ? "Drop it here!" : "Drag & Drop Audio or Video"}
          </p>
          <p className="text-muted-foreground mb-6">or</p>
          <div className="px-6 py-3 rounded-lg border-2 border-primary bg-primary/10 text-primary font-semibold group-hover:bg-primary/20 transition-colors">
            Browse Files
          </div>

          <div className="mt-8 text-sm text-muted-foreground space-y-1">
            <p className="flex items-center justify-center gap-2">
              <FileAudio className="h-4 w-4" />
              Audio: MP3, WAV, M4A, FLAC, OGG, AAC
            </p>
            <p className="flex items-center justify-center gap-2">
              <Video className="h-4 w-4" />
              Video: MP4, MOV, WebM (auto-converted to audio)
            </p>
            <p className="mt-2 text-xs">Max file size: 25MB • Recommended: 2-3 minute clips</p>
          </div>
        </div>
      </label>
    </div>
  );
};
