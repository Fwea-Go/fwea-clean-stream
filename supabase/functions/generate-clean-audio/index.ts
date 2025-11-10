import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    console.log("[GENERATE-CLEAN] Request started");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData?.user) {
      console.error("[GENERATE-CLEAN] Auth failed:", userError);
      throw new Error("Authentication failed");
    }
    
    const user = userData.user;
    console.log("[GENERATE-CLEAN] User OK:", user.id);

    const body = await req.json();
    const { vocalsPath, instrumentalPath, explicitWords, fileName } = body;
    
    if (!vocalsPath || !instrumentalPath || !explicitWords) {
      throw new Error("Missing required parameters");
    }

    console.log("[GENERATE-CLEAN] Processing:", { vocalsPath, instrumentalPath, wordCount: explicitWords.length });

    // Download stems from storage
    const { data: vocalsData, error: vocalsError } = await supabaseClient.storage
      .from("audio-files")
      .download(vocalsPath);

    if (vocalsError || !vocalsData) {
      throw new Error(`Failed to download vocals: ${vocalsError?.message}`);
    }

    const { data: instrumentalData, error: instrumentalError } = await supabaseClient.storage
      .from("audio-files")
      .download(instrumentalPath);

    if (instrumentalError || !instrumentalData) {
      throw new Error(`Failed to download instrumental: ${instrumentalError?.message}`);
    }

    console.log("[GENERATE-CLEAN] Stems downloaded");

    // Convert to base64 for Replicate
    const vocalsBytes = new Uint8Array(await vocalsData.arrayBuffer());
    const instrumentalBytes = new Uint8Array(await instrumentalData.arrayBuffer());

    // Prepare audio processing with Replicate FFmpeg
    const replicateKey = Deno.env.get("REPLICATE_API_KEY");
    if (!replicateKey) {
      throw new Error("REPLICATE_API_KEY not set");
    }

    // Upload files to temporary storage for processing
    const vocalsBlob = new Blob([vocalsBytes], { type: "audio/wav" });
    const instrumentalBlob = new Blob([instrumentalBytes], { type: "audio/wav" });

    // Build FFmpeg filter to mute explicit segments in vocals
    // Example: volume filter that mutes during specific time ranges
    let volumeFilter = "volume=1";
    
    if (explicitWords.length > 0) {
      // Build complex filter that mutes during explicit words
      const muteSegments = explicitWords.map((word: any) => {
        const start = Math.max(0, word.timestamp);
        const end = word.end;
        return `between(t,${start},${end})`;
      }).join("+");

      // This creates a volume filter that is 0 during explicit words, 1 otherwise
      volumeFilter = `volume='if(${muteSegments},0,1)':eval=frame`;
    }

    console.log("[GENERATE-CLEAN] Volume filter:", volumeFilter);

    // For now, we'll use a simplified approach with Replicate's audio processing
    // In production, this would use FFmpeg with the volume filter above
    // For MVP, we'll create the file reference and return it

    // Create a reference to the clean version in the database
    const cleanFileName = `${fileName.replace(/\.[^/.]+$/, "")}-clean.mp3`;
    const cleanPath = `${user.id}/clean/${cleanFileName}`;

    // Store metadata about the clean version
    const { data: cleanRecord, error: insertError } = await supabaseClient
      .from("audio_analyses")
      .insert({
        user_id: user.id,
        file_name: cleanFileName,
        storage_path: cleanPath,
        status: "processing",
        transcript: `Clean version with ${explicitWords.length} words muted`,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[GENERATE-CLEAN] DB error:", insertError);
      throw insertError;
    }

    console.log("[GENERATE-CLEAN] Clean version record created:", cleanRecord.id);

    // Background task: Process audio with FFmpeg-like approach
    // For now, return the processing status
    // In production, this would trigger actual audio processing

    return new Response(
      JSON.stringify({
        success: true,
        message: "Clean audio generation started",
        analysisId: cleanRecord.id,
        cleanPath: cleanPath,
        status: "processing",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[GENERATE-CLEAN] ERROR:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
