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
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw userError;
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    const { audioBase64, fileName } = await req.json();
    if (!audioBase64 || !fileName) {
      throw new Error("Missing audio data or file name");
    }

    console.log("[ANALYZE-AUDIO] Received file:", fileName);

    // Decode base64 audio
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Transcribe audio using OpenAI Whisper
    console.log("[ANALYZE-AUDIO] Transcribing with Whisper");
    const formData = new FormData();
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    formData.append("file", blob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");

    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error("[ANALYZE-AUDIO] Whisper error:", error);
      throw new Error(`Whisper API error: ${error}`);
    }

    const transcription = await whisperResponse.json();
    console.log("[ANALYZE-AUDIO] Transcription complete");

    // Detect explicit words with timestamps
    const explicitWords: Array<{
      word: string;
      start: number;
      end: number;
      language: string;
      confidence: number;
    }> = [];

    if (transcription.words) {
      for (const wordData of transcription.words) {
        const word = wordData.word.toLowerCase().replace(/[.,!?]/g, "");
        
        // Check if word contains explicit content
        const isExplicit = EXPLICIT_WORDS.some(explicit => 
          word.includes(explicit) || explicit.includes(word)
        );

        if (isExplicit) {
          explicitWords.push({
            word: wordData.word,
            start: wordData.start || 0,
            end: wordData.end || 0,
            language: transcription.language || "unknown",
            confidence: 0.9, // Whisper doesn't provide confidence per word
          });
        }
      }
    }

    console.log(`[ANALYZE-AUDIO] Found ${explicitWords.length} explicit words`);

    // Store analysis in database
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

    console.log("[ANALYZE-AUDIO] Analysis saved to database");

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