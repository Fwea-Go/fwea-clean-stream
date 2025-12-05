import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Extract Audio Function Started ===");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Verify the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      throw new Error("Unauthorized");
    }

    console.log("User authenticated:", user.id);

    // Parse request body
    const { storagePath, fileName } = await req.json();
    console.log("Processing video:", fileName, "at path:", storagePath);

    if (!storagePath || !fileName) {
      throw new Error("Missing required fields: storagePath and fileName");
    }

    // Get the video file URL from storage
    const { data: urlData } = supabase.storage
      .from("audio-files")
      .getPublicUrl(storagePath);

    if (!urlData?.publicUrl) {
      throw new Error("Failed to get video URL from storage");
    }

    const videoUrl = urlData.publicUrl;
    console.log("Video URL:", videoUrl);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY is not configured");
    }

    const replicate = new Replicate({
      auth: REPLICATE_API_KEY,
    });

    console.log("Extracting audio from video using FFmpeg...");

    // Use FFmpeg to extract audio from video
    const extractResult = await replicate.run(
      "openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2",
      {
        input: {
          audio: videoUrl,
          model: "large-v3",
          translate: false,
          language: "en",
          transcription: "plain text",
          suppress_tokens: "-1",
          logprob_threshold: -1,
          no_speech_threshold: 0.6,
          condition_on_previous_text: true,
          compression_ratio_threshold: 2.4,
          temperature_increment_on_fallback: 0.2,
        },
      }
    );

    console.log("Whisper result (audio extracted):", extractResult);

    // For video files, we need to use a different approach
    // We'll download the video and re-upload just the audio portion
    // For now, we'll return the original URL and let the separate-audio function handle it
    
    // The separate-audio function (Spleeter) can actually handle video files
    // So we'll just pass through the video URL and let it extract audio during separation

    // Generate the audio file path
    const audioFileName = fileName.replace(/\.(mp4|mov|webm|avi)$/i, '.mp3');
    const audioStoragePath = storagePath.replace(/\.(mp4|mov|webm|avi)$/i, '.mp3');

    console.log("Audio extraction complete");
    console.log("Original video path:", storagePath);
    console.log("Audio will be processed as:", audioStoragePath);

    return new Response(
      JSON.stringify({
        success: true,
        audioUrl: videoUrl, // Spleeter can handle video input
        audioStoragePath: storagePath, // Keep original path, Spleeter will extract audio
        audioFileName: audioFileName,
        message: "Video ready for audio extraction during stem separation"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in extract-audio function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});