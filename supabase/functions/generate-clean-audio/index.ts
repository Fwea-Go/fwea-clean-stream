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

    // Get public URLs for the audio files
    const { data: vocalsUrlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(vocalsPath);
    
    const { data: instrumentalUrlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(instrumentalPath);

    const vocalsUrl = vocalsUrlData.publicUrl;
    const instrumentalUrl = instrumentalUrlData.publicUrl;

    console.log("[GENERATE-CLEAN] Vocals URL:", vocalsUrl);
    console.log("[GENERATE-CLEAN] Instrumental URL:", instrumentalUrl);

    // Build muting segments for each explicit word with padding
    console.log("[GENERATE-CLEAN] Building mute segments with padding");
    const muteSegments = explicitWords.map((word: any, idx: number) => {
      const start = word.timestamp || word.start || 0;
      const end = word.end || (start + 0.5);
      return {
        index: idx,
        word: word.word,
        start: parseFloat(start.toFixed(3)),
        end: parseFloat(end.toFixed(3)),
        muteStart: Math.max(0, parseFloat((start - 0.1).toFixed(3))),
        muteEnd: parseFloat((end + 0.2).toFixed(3)),
      };
    });

    console.log("[GENERATE-CLEAN] Will mute", muteSegments.length, "segments:", JSON.stringify(muteSegments.slice(0, 5)));

    // Call Hetzner audio processing API
    const hetznerApiUrl = Deno.env.get("HETZNER_API_URL");
    const hetznerApiKey = Deno.env.get("HETZNER_API_KEY");

    if (!hetznerApiUrl || !hetznerApiKey) {
      throw new Error("Hetzner API configuration missing");
    }

    console.log("[GENERATE-CLEAN] Calling Hetzner API:", hetznerApiUrl);

    const hetznerResponse = await fetch(hetznerApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": hetznerApiKey,
      },
      body: JSON.stringify({
        vocalsUrl,
        instrumentalUrl,
        muteSegments: muteSegments.map((seg: any) => ({
          start: seg.muteStart,
          end: seg.muteEnd,
        })),
        outputFormat: "mp3",
      }),
    });

    if (!hetznerResponse.ok) {
      const errorText = await hetznerResponse.text();
      console.error("[GENERATE-CLEAN] Hetzner API error:", hetznerResponse.status, errorText);
      throw new Error(`Hetzner API error: ${hetznerResponse.status} - ${errorText}`);
    }

    const hetznerResult = await hetznerResponse.json();
    console.log("[GENERATE-CLEAN] Hetzner result:", hetznerResult);

    if (!hetznerResult.cleanAudioUrl) {
      throw new Error("No clean audio URL returned from Hetzner");
    }

    // Download the final clean audio from Hetzner
    console.log("[GENERATE-CLEAN] Downloading clean audio from Hetzner...");
    const cleanAudioResponse = await fetch(hetznerResult.cleanAudioUrl);
    if (!cleanAudioResponse.ok) {
      console.error("[GENERATE-CLEAN] Failed to download from Hetzner:", cleanAudioResponse.status);
      throw new Error(`Failed to download clean audio: ${cleanAudioResponse.status}`);
    }

    const cleanAudioBlob = await cleanAudioResponse.blob();
    console.log("[GENERATE-CLEAN] Downloaded clean audio, size:", cleanAudioBlob.size);
    
    const cleanAudioBytes = new Uint8Array(await cleanAudioBlob.arrayBuffer());

    // Upload to Supabase Storage
    const cleanFileName = `${fileName.replace(/\.[^/.]+$/, "")}-clean.mp3`;
    const cleanPath = `${user.id}/clean/${cleanFileName}`;

    console.log("[GENERATE-CLEAN] Uploading to storage:", cleanPath);

    const { error: uploadError } = await supabaseClient.storage
      .from("audio-files")
      .upload(cleanPath, cleanAudioBytes, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[GENERATE-CLEAN] Upload error:", uploadError);
      throw new Error(`Failed to upload clean audio: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(cleanPath);

    console.log("[GENERATE-CLEAN] Clean audio uploaded:", urlData.publicUrl);

    // Create or update database record
    const { data: cleanRecord, error: dbError } = await supabaseClient
      .from("audio_analyses")
      .insert({
        user_id: user.id,
        file_name: cleanFileName,
        storage_path: cleanPath,
        status: "completed",
        transcript: `Clean version with ${explicitWords.length} words muted`,
        explicit_words: muteSegments,
      })
      .select()
      .single();

    if (dbError) {
      console.error("[GENERATE-CLEAN] DB error:", dbError);
      throw dbError;
    }

    console.log("[GENERATE-CLEAN] SUCCESS! Database record created:", cleanRecord.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Clean version generated with ${muteSegments.length} words muted`,
        analysisId: cleanRecord.id,
        cleanPath: cleanPath,
        downloadUrl: urlData.publicUrl,
        fileName: cleanFileName,
        mutedSegments: muteSegments,
        status: "completed",
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
