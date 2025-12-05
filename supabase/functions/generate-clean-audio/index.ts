import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Replicate from "https://esm.sh/replicate@0.25.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Chunked base64 encoding to prevent stack overflow on large files
function arrayBufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

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
    console.log("[GENERATE-CLEAN] Downloading vocals...");
    const { data: vocalsData, error: vocalsError } = await supabaseClient.storage
      .from("audio-files")
      .download(vocalsPath);

    if (vocalsError || !vocalsData) {
      console.error("[GENERATE-CLEAN] Vocals download failed:", vocalsError);
      throw new Error(`Failed to download vocals: ${vocalsError?.message}`);
    }
    console.log("[GENERATE-CLEAN] Vocals downloaded, size:", vocalsData.size);

    console.log("[GENERATE-CLEAN] Downloading instrumental...");
    const { data: instrumentalData, error: instrumentalError } = await supabaseClient.storage
      .from("audio-files")
      .download(instrumentalPath);

    if (instrumentalError || !instrumentalData) {
      console.error("[GENERATE-CLEAN] Instrumental download failed:", instrumentalError);
      throw new Error(`Failed to download instrumental: ${instrumentalError?.message}`);
    }
    console.log("[GENERATE-CLEAN] Instrumental downloaded, size:", instrumentalData.size);

    console.log("[GENERATE-CLEAN] Stems downloaded successfully");

    // Convert to base64 for Replicate using chunked encoding (prevents stack overflow)
    console.log("[GENERATE-CLEAN] Converting vocals to base64...");
    const vocalsBytes = new Uint8Array(await vocalsData.arrayBuffer());
    console.log("[GENERATE-CLEAN] Vocals bytes:", vocalsBytes.length);
    const vocalsBase64 = arrayBufferToBase64(vocalsBytes);
    console.log("[GENERATE-CLEAN] Vocals base64 length:", vocalsBase64.length);

    console.log("[GENERATE-CLEAN] Converting instrumental to base64...");
    const instrumentalBytes = new Uint8Array(await instrumentalData.arrayBuffer());
    console.log("[GENERATE-CLEAN] Instrumental bytes:", instrumentalBytes.length);
    const instrumentalBase64 = arrayBufferToBase64(instrumentalBytes);
    console.log("[GENERATE-CLEAN] Instrumental base64 length:", instrumentalBase64.length);
    
    const vocalsDataUri = `data:audio/mp3;base64,${vocalsBase64}`;
    const instrumentalDataUri = `data:audio/mp3;base64,${instrumentalBase64}`;

    console.log("[GENERATE-CLEAN] Base64 conversion complete");

    // Initialize Replicate
    const replicateKey = Deno.env.get("REPLICATE_API_KEY");
    if (!replicateKey) {
      throw new Error("REPLICATE_API_KEY not set");
    }

    const replicate = new Replicate({ auth: replicateKey });
    console.log("[GENERATE-CLEAN] Building mute segments with padding");

    // Build muting segments for each explicit word with padding
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

    // Build FFmpeg volume filter to mute explicit segments
    let volumeFilters = "volume=1.0";
    if (muteSegments.length > 0) {
      volumeFilters = muteSegments.map((seg: any) => 
        `volume=enable='between(t,${seg.muteStart},${seg.muteEnd})':volume=0`
      ).join(',');
    }

    console.log("[GENERATE-CLEAN] FFmpeg filter:", volumeFilters.substring(0, 300));

    // Step 1: Apply muting to vocals using FFmpeg
    console.log("[GENERATE-CLEAN] Step 1: Muting vocals with FFmpeg...");
    let mutedVocalsOutput: string;
    
    try {
      const ffmpegResult = await replicate.run(
        "chenxwh/ffmpeg:latest",
        {
          input: {
            audio: vocalsDataUri,
            audio_filter: volumeFilters,
            output_format: "mp3",
          }
        }
      );
      mutedVocalsOutput = ffmpegResult as string;
      console.log("[GENERATE-CLEAN] Muted vocals URL:", mutedVocalsOutput);
    } catch (ffmpegError) {
      console.error("[GENERATE-CLEAN] FFmpeg muting failed:", ffmpegError);
      throw new Error(`FFmpeg vocal muting failed: ${ffmpegError}`);
    }

    // Step 2: Merge muted vocals with instrumental
    console.log("[GENERATE-CLEAN] Step 2: Merging with instrumental...");
    let finalOutput: string;
    
    try {
      const mergeResult = await replicate.run(
        "chenxwh/ffmpeg:latest",
        {
          input: {
            audio: instrumentalDataUri,
            audio_overlay: mutedVocalsOutput,
            audio_filter: "amix=inputs=2:duration=first:dropout_transition=0",
            output_format: "mp3",
          }
        }
      );
      finalOutput = mergeResult as string;
      console.log("[GENERATE-CLEAN] Final clean audio URL:", finalOutput);
    } catch (mergeError) {
      console.error("[GENERATE-CLEAN] FFmpeg merge failed:", mergeError);
      throw new Error(`FFmpeg merge failed: ${mergeError}`);
    }

    // Download the final clean audio
    console.log("[GENERATE-CLEAN] Downloading final audio from Replicate...");
    const cleanAudioResponse = await fetch(finalOutput);
    if (!cleanAudioResponse.ok) {
      console.error("[GENERATE-CLEAN] Failed to download from Replicate:", cleanAudioResponse.status);
      throw new Error(`Failed to download clean audio from Replicate: ${cleanAudioResponse.status}`);
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
