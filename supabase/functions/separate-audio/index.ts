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

    const { storagePath, fileName } = await req.json();
    if (!storagePath || !fileName) {
      console.error("[SEPARATE-AUDIO] Missing data");
      throw new Error("Missing storage path or file name");
    }

    console.log("[SEPARATE-AUDIO] Processing file from storage:", storagePath);

    // Get public URL for Replicate
    const { data: urlData } = supabaseClient.storage
      .from("audio-files")
      .getPublicUrl(storagePath);
    
    if (!urlData?.publicUrl) {
      throw new Error("Failed to get public URL for audio file");
    }

    console.log("[SEPARATE-AUDIO] Public URL:", urlData.publicUrl);

    // Initialize Replicate
    const REPLICATE_API_KEY = Deno.env.get("REPLICATE_API_KEY");
    if (!REPLICATE_API_KEY) {
      throw new Error("REPLICATE_API_KEY not configured");
    }

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    console.log("[SEPARATE-AUDIO] Starting Spleeter separation...");
    console.log("[SEPARATE-AUDIO] Audio URL:", urlData.publicUrl);
    
    // Use Spleeter for fast, high-quality source separation
    let output: any;
    try {
      // Set a reasonable timeout (2 minutes)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Audio separation timed out after 2 minutes')), 120000)
      );

      const separationPromise = replicate.run(
        "soykertje/spleeter:cd128044253523c86abfd743dea680c88559ad975ccd72378c8433f067ab5d0a",
        {
          input: {
            audio: urlData.publicUrl,
            // Request MP3 format to reduce file size for downstream processing
            audio_format: "mp3"
          }
        }
      );

      output = await Promise.race([separationPromise, timeoutPromise]) as any;
      console.log("[SEPARATE-AUDIO] Separation completed successfully");
    } catch (replicateError: any) {
      console.error("[SEPARATE-AUDIO] Replicate API error:", replicateError);
      console.error("[SEPARATE-AUDIO] Error details:", JSON.stringify(replicateError, null, 2));
      
      if (replicateError.message?.includes('timed out')) {
        throw new Error("Audio separation is taking longer than expected. This can happen with longer songs. Please try with a shorter audio file (under 2 minutes).");
      }
      
      if (replicateError.response?.status === 402) {
        throw new Error("Replicate API requires payment. Please add credits at https://replicate.com/account/billing");
      }
      
      if (replicateError.response?.status === 500) {
        throw new Error("Replicate service error. Please try again in a few moments.");
      }
      
      throw new Error(`Audio separation failed: ${replicateError.message || 'Unknown error'}. Try with a shorter audio file.`);
    }

    if (!output || !output.vocals || !output.accompaniment) {
      console.error("[SEPARATE-AUDIO] Invalid output from Spleeter:", output);
      throw new Error("Audio separation failed - invalid output from AI model");
    }

    console.log("[SEPARATE-AUDIO] Separation complete:", {
      hasVocals: !!output.vocals,
      hasAccompaniment: !!output.accompaniment
    });

    // Download separated stems from Spleeter
    // Spleeter returns: vocals and accompaniment
    const vocalsUrl = output.vocals;
    const accompanimentUrl = output.accompaniment;

    console.log("[SEPARATE-AUDIO] Downloading vocals from:", vocalsUrl);
    const vocalsResponse = await fetch(vocalsUrl);
    if (!vocalsResponse.ok) {
      throw new Error(`Failed to download vocals: ${vocalsResponse.statusText}`);
    }
    const vocalsBuffer = new Uint8Array(await vocalsResponse.arrayBuffer());
    console.log("[SEPARATE-AUDIO] Vocals downloaded, size:", vocalsBuffer.length, "bytes");

    // Convert WAV to compressed MP3 to reduce size for Whisper API
    const vocalsSizeMB = vocalsBuffer.length / (1024 * 1024);
    console.log("[SEPARATE-AUDIO] Original vocals size:", vocalsSizeMB.toFixed(1), "MB (WAV)");
    
    let finalVocalsBuffer = vocalsBuffer;
    
    // If vocals are over 10MB (WAV), compress to MP3
    if (vocalsSizeMB > 10) {
      console.log("[SEPARATE-AUDIO] Compressing vocals WAV to MP3...");
      
      try {
        // Upload temp WAV for conversion
        const tempWavPath = `${user.id}/temp/${Date.now()}-vocals.wav`;
        await supabaseClient.storage
          .from("audio-files")
          .upload(tempWavPath, vocalsBuffer, {
            contentType: "audio/wav",
            upsert: true,
          });
        
        const { data: tempWavUrl } = supabaseClient.storage
          .from("audio-files")
          .getPublicUrl(tempWavPath);
        
        // Use FFmpeg via Replicate to convert WAV to MP3 with low bitrate
        console.log("[SEPARATE-AUDIO] Converting WAV to MP3 (64kbps)...");
        const mp3Output: any = await replicate.run(
          "myaiteam2/bitrate-changer",
          {
            input: {
              audio: tempWavUrl.publicUrl,
              bitrate: "64k",
              format: "mp3"
            }
          }
        );
        
        if (mp3Output) {
          console.log("[SEPARATE-AUDIO] Downloading compressed MP3...");
          const mp3Response = await fetch(mp3Output);
          if (mp3Response.ok) {
            finalVocalsBuffer = new Uint8Array(await mp3Response.arrayBuffer());
            const compressedSizeMB = finalVocalsBuffer.length / (1024 * 1024);
            console.log("[SEPARATE-AUDIO] Compressed to:", compressedSizeMB.toFixed(1), "MB (MP3)");
            
            // Final check
            if (compressedSizeMB > 24) {
              throw new Error(
                `Audio still too large after compression (${compressedSizeMB.toFixed(1)}MB). ` +
                `Please use a shorter clip (under 2 minutes).`
              );
            }
          }
        }
        
        // Clean up temp file
        await supabaseClient.storage
          .from("audio-files")
          .remove([tempWavPath]);
          
      } catch (compressionError: any) {
        console.error("[SEPARATE-AUDIO] Compression error:", compressionError);
        // If compression fails but original is under 24MB, continue
        if (vocalsSizeMB > 24) {
          throw new Error(
            `Audio file too large (${vocalsSizeMB.toFixed(1)}MB) and compression failed. ` +
            `Please use a shorter audio clip (2-3 minutes max).`
          );
        }
        console.log("[SEPARATE-AUDIO] Compression failed but original size acceptable");
      }
    } else {
      console.log("[SEPARATE-AUDIO] Vocals size OK:", vocalsSizeMB.toFixed(1), "MB");
    }

    console.log("[SEPARATE-AUDIO] Downloading accompaniment from:", accompanimentUrl);
    const accompanimentResponse = await fetch(accompanimentUrl);
    if (!accompanimentResponse.ok) {
      throw new Error(`Failed to download instrumental: ${accompanimentResponse.statusText}`);
    }
    const instrumentalBuffer = new Uint8Array(await accompanimentResponse.arrayBuffer());
    console.log("[SEPARATE-AUDIO] Instrumental downloaded, size:", instrumentalBuffer.length, "bytes");

    // Store separated stems (use original vocals for playback)
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

    // Store compressed vocals for analysis
    const vocalsAnalysisPath = `${user.id}/vocals/${fileName}-vocals.mp3`;
    console.log("[SEPARATE-AUDIO] Storing vocals for analysis at:", vocalsAnalysisPath);
    const { error: vocalsUploadError } = await supabaseClient.storage
      .from("audio-files")
      .upload(vocalsAnalysisPath, finalVocalsBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
    
    if (vocalsUploadError) {
      console.error("[SEPARATE-AUDIO] Failed to upload vocals for analysis:", vocalsUploadError);
      throw new Error(`Failed to store vocals for analysis: ${vocalsUploadError.message}`);
    }
    console.log("[SEPARATE-AUDIO] Vocals stored successfully for analysis");

    // Clean up uploaded file
    await supabaseClient.storage
      .from("audio-files")
      .remove([storagePath]);

    console.log("[SEPARATE-AUDIO] Separation successful");

    return new Response(
      JSON.stringify({
        success: true,
        vocalsStoragePath: vocalsAnalysisPath,
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
