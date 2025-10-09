import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Replicate from "https://esm.sh/replicate@0.25.2";

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
    console.log("[SEPARATE-AUDIO] Starting audio separation");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[SEPARATE-AUDIO] No authorization header");
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      console.error("[SEPARATE-AUDIO] Auth error:", userError);
      throw userError;
    }
    
    const user = userData.user;
    if (!user) {
      console.error("[SEPARATE-AUDIO] User not authenticated");
      throw new Error("User not authenticated");
    }

    console.log("[SEPARATE-AUDIO] User authenticated:", user.id);

    const { audioBase64, fileName } = await req.json();
    if (!audioBase64 || !fileName) {
      console.error("[SEPARATE-AUDIO] Missing data");
      throw new Error("Missing audio data or file name");
    }

    console.log("[SEPARATE-AUDIO] Received file:", fileName);

    // Upload audio to storage temporarily
    const audioBuffer = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));
    const storagePath = `${user.id}/temp/${fileName}`;
    
    console.log("[SEPARATE-AUDIO] Uploading to storage:", storagePath);
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from("audio-files")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[SEPARATE-AUDIO] Upload error:", uploadError);
      throw uploadError;
    }

    // Get public URL for Replicate
    const { data: urlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(storagePath);

    console.log("[SEPARATE-AUDIO] Public URL:", urlData.publicUrl);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY not configured");
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    console.log("[SEPARATE-AUDIO] Starting Demucs separation...");
    
    // Use Demucs for high-quality source separation
    const output = await replicate.run(
      "cjwbw/music-source-separation:d957219d8b50894fb2691443df0e17f2b2dfc09e4a78996b1d5caf04d3ecb1f9",
      {
        input: {
          audio: urlData.publicUrl,
          stem: "vocals", // Separate vocals from everything else
        }
      }
    ) as any;

    console.log("[SEPARATE-AUDIO] Separation complete:", output);

    // Download separated stems
    const vocalsUrl = output.vocals;
    const instrumentalUrl = output.no_vocals || output.other;

    console.log("[SEPARATE-AUDIO] Downloading vocals:", vocalsUrl);
    const vocalsResponse = await fetch(vocalsUrl);
    const vocalsBuffer = new Uint8Array(await vocalsResponse.arrayBuffer());

    console.log("[SEPARATE-AUDIO] Downloading instrumental:", instrumentalUrl);
    const instrumentalResponse = await fetch(instrumentalUrl);
    const instrumentalBuffer = new Uint8Array(await instrumentalResponse.arrayBuffer());

    // Store separated stems
    const vocalsPath = `${user.id}/stems/${fileName}-vocals.mp3`;
    const instrumentalPath = `${user.id}/stems/${fileName}-instrumental.mp3`;

    console.log("[SEPARATE-AUDIO] Storing vocals stem");
    await supabaseClient.storage
      .from("audio-files")
      .upload(vocalsPath, vocalsBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    console.log("[SEPARATE-AUDIO] Storing instrumental stem");
    await supabaseClient.storage
      .from("audio-files")
      .upload(instrumentalPath, instrumentalBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    // Get URLs for separated stems
    const { data: vocalsUrlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(vocalsPath);

    const { data: instrumentalUrlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(instrumentalPath);

    // Convert vocals to base64 for analysis
    const vocalsBase64 = btoa(String.fromCharCode(...vocalsBuffer));

    // Clean up temp file
    await supabaseClient.storage
      .from("audio-files")
      .remove([storagePath]);

    console.log("[SEPARATE-AUDIO] Separation successful");

    return new Response(
      JSON.stringify({
        success: true,
        vocalsBase64: vocalsBase64,
        vocalsUrl: vocalsUrlData.publicUrl,
        instrumentalUrl: instrumentalUrlData.publicUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[SEPARATE-AUDIO] Error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
