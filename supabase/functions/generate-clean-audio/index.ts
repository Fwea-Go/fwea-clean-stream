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
    
    const vocalsBase64 = btoa(String.fromCharCode(...vocalsBytes));
    const instrumentalBase64 = btoa(String.fromCharCode(...instrumentalBytes));
    
    const vocalsDataUri = `data:audio/wav;base64,${vocalsBase64}`;
    const instrumentalDataUri = `data:audio/wav;base64,${instrumentalBase64}`;

    // Initialize Replicate
    const replicateKey = Deno.env.get("REPLICATE_API_KEY");
    if (!replicateKey) {
      throw new Error("REPLICATE_API_KEY not set");
    }

    const replicate = new Replicate({ auth: replicateKey });
    console.log("[GENERATE-CLEAN] Building mute segments with padding");

    // Build muting segments for each explicit word with padding
    const muteSegments = explicitWords.map((word: any, idx: number) => ({
      index: idx,
      word: word.word,
      start: parseFloat(word.timestamp?.toFixed(3) || word.start?.toFixed(3) || "0"),
      end: parseFloat(word.end?.toFixed(3) || "0"),
      muteStart: Math.max(0, parseFloat((word.timestamp || word.start || 0).toFixed(3))),
      muteEnd: parseFloat((word.end || 0).toFixed(3)),
    }));

    console.log("[GENERATE-CLEAN] Will mute", muteSegments.length, "segments:", JSON.stringify(muteSegments.slice(0, 5)));

    // Build FFmpeg volume filter to mute explicit segments
    const volumeFilters = muteSegments.map((seg: any) => 
      `volume=enable='between(t,${seg.muteStart},${seg.muteEnd})':volume=0`
    ).join(',');

    console.log("[GENERATE-CLEAN] FFmpeg filter:", volumeFilters.substring(0, 200) + "...");

    // Step 1: Apply muting to vocals
    console.log("[GENERATE-CLEAN] Step 1: Muting vocals...");
    const mutedVocalsOutput = await replicate.run(
      "chenxwh/ffmpeg:latest",
      {
        input: {
          audio: vocalsDataUri,
          audio_filter: volumeFilters || "volume=1.0",
          output_format: "mp3",
        }
      }
    ) as string;

    console.log("[GENERATE-CLEAN] Muted vocals URL:", mutedVocalsOutput);

    // Step 2: Merge muted vocals with instrumental
    console.log("[GENERATE-CLEAN] Step 2: Merging with instrumental...");
    const finalOutput = await replicate.run(
      "chenxwh/ffmpeg:latest",
      {
        input: {
          audio: instrumentalDataUri,
          audio_overlay: mutedVocalsOutput,
          audio_filter: "amix=inputs=2:duration=first",
          output_format: "mp3",
        }
      }
    ) as string;

    console.log("[GENERATE-CLEAN] Final clean audio URL:", finalOutput);

    // Download the final clean audio
    const cleanAudioResponse = await fetch(finalOutput);
    if (!cleanAudioResponse.ok) {
      throw new Error("Failed to download clean audio from Replicate");
    }

    const cleanAudioBlob = await cleanAudioResponse.blob();
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

    console.log("[GENERATE-CLEAN] Database record created:", cleanRecord.id);

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
