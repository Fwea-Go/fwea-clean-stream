import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface CleanEdit {
  id: string;
  file_name: string;
  created_at: string;
  status: string;
  storage_path: string;
  explicit_words: any;
}

const History = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [cleanEdits, setCleanEdits] = useState<CleanEdit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchCleanEdits();
    }
  }, [user]);

  const fetchCleanEdits = async () => {
    try {
      const { data, error } = await supabase
        .from("audio_analyses")
        .select("*")
        .eq("user_id", user?.id)
        .ilike("file_name", "%-clean.mp3")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCleanEdits(data || []);
    } catch (error) {
      console.error("Error fetching history:", error);
      toast({
        title: "Error",
        description: "Failed to load your history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (edit: CleanEdit) => {
    try {
      const { data } = supabase.storage
        .from("audio-files")
        .getPublicUrl(edit.storage_path);

      const link = document.createElement("a");
      link.href = data.publicUrl;
      link.download = edit.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download Started",
        description: `Downloading ${edit.file_name}`,
      });
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Download Error",
        description: "Failed to download file",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/")}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold">
              My <span className="text-primary neon-text">Clean Edits</span>
            </h1>
            <p className="text-muted-foreground mt-2">
              Access and download your previous clean versions
            </p>
          </div>
        </div>

        {cleanEdits.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <p className="text-muted-foreground text-lg mb-4">
              No clean edits yet
            </p>
            <Button onClick={() => navigate("/")}>
              Upload Your First Track
            </Button>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8">
            <div className="space-y-4">
              {cleanEdits.map((edit) => (
                <div
                  key={edit.id}
                  className="flex items-center justify-between p-6 rounded-xl border border-border hover:border-primary/50 transition-all"
                >
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">
                      {edit.file_name}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        {new Date(edit.created_at).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>
                        {Array.isArray(edit.explicit_words)
                          ? edit.explicit_words.length
                          : 0}{" "}
                        words removed
                      </span>
                      <span>•</span>
                      <Badge
                        variant={
                          edit.status === "completed" ? "default" : "secondary"
                        }
                      >
                        {edit.status}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleDownload(edit)}
                    disabled={edit.status !== "completed"}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
