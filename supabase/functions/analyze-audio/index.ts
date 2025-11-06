import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Basic explicit words detection
function basicDetection(words: any[]) {
  const EXPLICIT_WORDS = [
    "fuck", "fucking", "fucked", "fucker", "fck", "fuk", "shit", "damn", "bitch", "bitches", 
    "ass", "asshole", "bastard", "hell", "crap", "dick", "cock", "pussy", "piss", "cunt", 
    "motherfucker", "bullshit", "nigga", "nigger", "whore", "slut", "hoe",
    "mierda", "puta", "puto", "carajo", "coño", "joder", "pendejo", "chinga", "verga", "perra",
    "merde", "putain", "con", "connard", "salope", "bordel", "enculé",
    "scheiße", "fick", "arsch", "verdammt", "hurensohn",
    "porra", "caralho", "foda", "merda", "puta", "filho da puta",
    "cazzo", "merda", "puttana", "stronzo", "vaffanculo",
  ];

  const explicitWords = [];
  for (const wordData of words) {
    const cleanWord = wordData.word.toLowerCase().trim().replace(/[.,!?;:"']/g, "");
    if (EXPLICIT_WORDS.includes(cleanWord)) {
      console.log("[ANALYZE-AUDIO] Flagged:", cleanWord, "at", wordData.start);
      explicitWords.push({
        word: wordData.word,
        start: wordData.start || 0,
        end: wordData.end || 0,
        language: "basic_detection",
        confidence: 0.95,
      });
    }
  }
  return explicitWords;
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
    console.log("[ANALYZE-AUDIO] Request started");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing Authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {  userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      console.error("[ANALYZE-AUDIO] Auth failed:", userError);
      throw new Error("Authentication failed");
    }
    
    const user = userData.user;
    console.log("[ANALYZE-AUDIO] User OK:", user.id);

    // Parse request
    const body = await req.json();
    const { storagePath, fileName } = body;
    
    if (!storagePath || !fileName) {
      throw new Error("Missing storagePath or fileName");
    }

    console.log("[ANALYZE-AUDIO] File:", storagePath);

    // Download from storage
    console.log("[ANALYZE-AUDIO] Downloading audio...");
    const {  audioData, error: downloadError } = await supabaseClient.storage
      .from("audio-files")
      .download(storagePath);

    if (downloadError || !audioData) {
      console.error("[ANALYZE-AUDIO] Download failed:", downloadError);
      throw new Error(`Download error: ${downloadError?.message}`);
    }

    const bytes = new Uint8Array(await audioData.arrayBuffer());
    const fileSizeMB = bytes.length / (1024 * 1024);
    
    console.log("[ANALYZE-AUDIO] Downloaded:", fileSizeMB.toFixed(2), "MB");

    if (fileSizeMB > 24) {
      throw new Error(`File too large: ${fileSizeMB.toFixed(1)}MB (max 25MB)`);
    }

    // Call Whisper API using simple blob approach
    console.log("[ANALYZE-AUDIO] Calling Whisper...");
    
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not set");
    }

    let transcription;
    let lastError;

    // Retry logic
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ANALYZE-AUDIO] Whisper attempt ${attempt}/3`);

        // Create a simple blob and send as-is
        const blob = new Blob([bytes], { type: "audio/mpeg" });
        
        // Build formdata manually with proper encoding
        const formData = new FormData();
        formData.append("file", blob, "audio.mp3");
        formData.append("model", "whisper-1");
        formData.append("response_format", "verbose_json");
        formData.append("timestamp_granularities[]", "word");

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: formData,
        });

        console.log("[ANALYZE-AUDIO] Whisper response:", response.status);

        if (!response.ok) {
          const error = await response.text();
          console.error("[ANALYZE-AUDIO] Whisper error:", error);
          
          if (response.status >= 500 && attempt < 3) {
            lastError = error;
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
          }
          throw new Error(error);
        }

        transcription = await response.json();
        console.log("[ANALYZE-AUDIO] Whisper OK, text:", transcription.text?.length, "chars");
        break;

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`[ANALYZE-AUDIO] Attempt ${attempt} failed:`, lastError);
        
        if (attempt === 3) {
          throw new Error(`Whisper failed after 3 attempts: ${lastError}`);
        }
        
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (!transcription) {
      throw new Error("No transcription result");
    }

    // Detect explicit words
    console.log("[ANALYZE-AUDIO] Detecting explicit content...");
    const explicitWords = transcription.words?.length > 0 
      ? basicDetection(transcription.words)
      : [];

    console.log("[ANALYZE-AUDIO] Found", explicitWords.length, "explicit words");

    // Store in database
    console.log("[ANALYZE-AUDIO] Saving to database...");
    const {  analysisData, error: insertError } = await supabaseClient
      .from("audio_analyses")
      .insert({
        user_id: user.id,
        file_name: fileName,
        storage_path: storagePath,
        transcript: transcription.text,
        explicit_words: explicitWords,
        status: "completed",
      })
      .select()
      .single();

    if (insertError) {
      console.error("[ANALYZE-AUDIO] DB error:", insertError);
      throw insertError;
    }

    console.log("[ANALYZE-AUDIO] SUCCESS! ID:", analysisData.id);

    return new Response(
      JSON.stringify({
        success: true,
        analysisId: analysisData.id,
        transcript: transcription.text,
        explicitWords: explicitWords,
        language: transcription.language || "unknown",
        duration: transcription.duration || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[ANALYZE-AUDIO] ERROR:", error);
    
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
