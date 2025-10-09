import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Comprehensive explicit words list (multilingual)
const EXPLICIT_WORDS = [
  // English
  "fuck", "fucking", "shit", "damn", "bitch", "ass", "asshole", "bastard", "hell", "crap",
  "dick", "cock", "pussy", "piss", "cunt", "motherfucker", "bullshit", "nigga", "nigger",
  // Spanish
  "mierda", "puta", "puto", "carajo", "coño", "joder", "pendejo", "chinga", "verga",
  // French
  "merde", "putain", "con", "connard", "salope", "bordel",
  // German
  "scheiße", "fick", "arsch", "verdammt",
  // Portuguese
  "porra", "caralho", "foda", "merda", "puta",
  // Italian
  "cazzo", "merda", "puttana", "stronzo",
  // Add more languages as needed
];

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
    console.log("[ANALYZE-AUDIO] Starting analysis");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[ANALYZE-AUDIO] No authorization header");
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      console.error("[ANALYZE-AUDIO] Auth error:", userError);
      throw userError;
    }
    
    const user = userData.user;
    if (!user) {
      console.error("[ANALYZE-AUDIO] User not authenticated");
      throw new Error("User not authenticated");
    }

    console.log("[ANALYZE-AUDIO] User authenticated:", user.id);

    const { audioBase64, fileName } = await req.json();
    if (!audioBase64 || !fileName) {
      console.error("[ANALYZE-AUDIO] Missing data:", { hasAudio: !!audioBase64, hasFileName: !!fileName });
      throw new Error("Missing audio data or file name");
    }

    console.log("[ANALYZE-AUDIO] Received file:", fileName, "Base64 length:", audioBase64.length);

    // Decode base64 audio
    console.log("[ANALYZE-AUDIO] Decoding base64...");
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    console.log("[ANALYZE-AUDIO] Base64 decoded, bytes length:", bytes.length);

    // Transcribe audio using OpenAI Whisper
    console.log("[ANALYZE-AUDIO] Preparing Whisper request");
    const formData = new FormData();
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      console.error("[ANALYZE-AUDIO] OPENAI_API_KEY not set");
      throw new Error("OPENAI_API_KEY not configured");
    }

    console.log("[ANALYZE-AUDIO] Calling OpenAI Whisper API...");
    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    console.log("[ANALYZE-AUDIO] Whisper response status:", whisperResponse.status);

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error("[ANALYZE-AUDIO] Whisper error:", error);
      throw new Error(`Whisper API error: ${error}`);
    }

    const transcription = await whisperResponse.json();
    console.log("[ANALYZE-AUDIO] Transcription complete, text length:", transcription.text?.length || 0);

    // Detect explicit words with timestamps
    const explicitWords: Array<{
      word: string;
      start: number;
      end: number;
      language: string;
      confidence: number;
    }> = [];

    if (transcription.words) {
      console.log("[ANALYZE-AUDIO] Processing", transcription.words.length, "words");
      for (const wordData of transcription.words) {
        // Clean the word and get exact match
        const cleanWord = wordData.word.toLowerCase().trim().replace(/[.,!?;:"']/g, "");
        
        // Check if the EXACT word is in the explicit words list (not substring)
        const isExplicit = EXPLICIT_WORDS.includes(cleanWord);

        if (isExplicit) {
          console.log("[ANALYZE-AUDIO] Found explicit word:", cleanWord, "at", wordData.start);
          explicitWords.push({
            word: wordData.word,
            start: wordData.start || 0,
            end: wordData.end || 0,
            language: transcription.language || "unknown",
            confidence: 0.95,
          });
        }
      }
    }

    console.log(`[ANALYZE-AUDIO] Found ${explicitWords.length} explicit words`);

    // Store analysis in database
    console.log("[ANALYZE-AUDIO] Storing analysis in database");
    const { data: analysisData, error: insertError } = await supabaseClient
      .from("audio_analyses")
      .insert({
        user_id: user.id,
        file_name: fileName,
        storage_path: `${user.id}/${fileName}`,
        transcript: transcription.text,
        explicit_words: explicitWords,
        status: "completed",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[ANALYZE-AUDIO] DB insert error:", insertError);
      throw insertError;
    }

    console.log("[ANALYZE-AUDIO] Analysis saved to database with ID:", analysisData.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysisId: analysisData.id,
        transcript: transcription.text,
        explicitWords: explicitWords,
        language: transcription.language,
        duration: transcription.duration,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[ANALYZE-AUDIO] Error:", error);
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