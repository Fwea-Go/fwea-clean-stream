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

    console.log("[GENERATE-CLEAN] Building mute segments with padding");

    // Build muting segments for each explicit word with padding
    const muteSegments = explicitWords.map((word: any, idx: number) => ({
      index: idx,
      word: word.word,
      start: parseFloat(word.start.toFixed(3)),
      end: parseFloat(word.end.toFixed(3)),
      // Add padding before and after to ensure complete muting
      muteStart: Math.max(0, parseFloat((word.start - 0.1).toFixed(3))),
      muteEnd: parseFloat((word.end + 0.1).toFixed(3)),
    }));

    console.log("[GENERATE-CLEAN] Will mute", muteSegments.length, "segments:", JSON.stringify(muteSegments.slice(0, 5)));

    // For now, create a processing record
    // Full audio processing with muting will be implemented in next iteration
    const cleanFileName = `${fileName.replace(/\.[^/.]+$/, "")}-clean.mp3`;
    const cleanPath = `${user.id}/clean/${cleanFileName}`;

    const { data: cleanRecord, error: insertError } = await supabaseClient
      .from("audio_analyses")
      .insert({
        user_id: user.id,
        file_name: cleanFileName,
        storage_path: cleanPath,
        status: "processing",
        transcript: `Clean version with ${explicitWords.length} words to be muted`,
        explicit_words: muteSegments,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[GENERATE-CLEAN] DB error:", insertError);
      throw insertError;
    }

    console.log("[GENERATE-CLEAN] Processing record created:", cleanRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processing started to mute ${muteSegments.length} explicit segments`,
        analysisId: cleanRecord.id,
        cleanPath: cleanPath,
        mutedSegments: muteSegments,
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
