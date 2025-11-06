import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Enhanced explicit words detection using AI
async function detectExplicitWords(words: any[], transcript: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn("[ANALYZE-AUDIO] LOVABLE_API_KEY not set, using basic detection");
    return basicDetection(words);
  }

  try {
    console.log("[ANALYZE-AUDIO] Using AI for explicit content detection");
    
    const wordList = words.map((w: any, idx: number) => ({
      index: idx,
      word: w.word,
      start: w.start,
      end: w.end
    }));

    // FIXED: Use timeout and better error handling for AI gateway
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{
            role: "system",
            content: `You are a strict content moderator. Analyze the word list and return a JSON object with "explicit_indices" array containing indices of explicit/profane words.
            
EXPLICIT WORDS TO CATCH: fuck, shit, bitch, ass, damn, hell, dick, pussy, cunt, bastard, motherfucker, nigga, nigger, whore, slut, hoe, mierda, puta, joder, carajo, scheiße, fick, arsch, putain, merde, etc.

Return ONLY valid JSON, no other text.`
          }, {
            role: "user",
            content: `Transcript: "${transcript}"\n\nWord list:\n${JSON.stringify(wordList)}\n\nReturn: {"explicit_indices": [...]}`
          }],
          temperature: 0,
          max_tokens: 500
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ANALYZE-AUDIO] AI API error:", response.status, errorText);
        return basicDetection(words);
      }

      const result = await response.json();
      const aiResponse = JSON.parse(result.choices[0].message.content);
      const explicitIndices = aiResponse.explicit_indices || [];
      
      console.log(`[ANALYZE-AUDIO] AI detected ${explicitIndices.length} explicit words`);

      const explicitWords = explicitIndices.map((idx: number) => {
        if (idx >= words.length) return null;
        const wordData = words[idx];
        return {
          word: wordData.word,
          start: wordData.start || 0,
          end: wordData.end || 0,
          language: "detected_by_ai",
          confidence: 0.98,
        };
      }).filter(w => w !== null);

      // Double-check with basic detection
      const basicWords = basicDetection(words);
      const basicWordsNotInAI = basicWords.filter((bw: any) => 
        !explicitWords.some((ew: any) => ew.word === bw.word && Math.abs(ew.start - bw.start) < 0.1)
      );
      
      if (basicWordsNotInAI.length > 0) {
        console.log(`[ANALYZE-AUDIO] Basic detection added ${basicWordsNotInAI.length} words`);
        explicitWords.push(...basicWordsNotInAI);
      }

      return explicitWords;
    } catch (error) {
      if (error.name === "AbortError") {
        console.warn("[ANALYZE-AUDIO] AI request timed out, using basic detection");
      } else {
        console.error("[ANALYZE-AUDIO] AI detection error:", error);
      }
      return basicDetection(words);
    }
  } catch (error) {
    console.error("[ANALYZE-AUDIO] Unexpected error in detectExplicitWords:", error);
    return basicDetection(words);
  }
}

// Fallback basic detection
function basicDetection(words: any[]) {
  const EXPLICIT_WORDS = [
    // English
    "fuck", "fucking", "fucked", "fucker", "fck", "fuk", "shit", "damn", "bitch", "bitches", 
    "ass", "asshole", "bastard", "hell", "crap", "dick", "cock", "pussy", "piss", "cunt", 
    "motherfucker", "bullshit", "nigga", "nigger", "whore", "slut", "hoe",
    // Spanish
    "mierda", "puta", "puto", "carajo", "coño", "joder", "pendejo", "chinga", "verga", "perra",
    // French
    "merde", "putain", "con", "connard", "salope", "bordel", "enculé",
    // German
    "scheiße", "fick", "arsch", "verdammt", "hurensohn",
    // Portuguese
    "porra", "caralho", "foda", "merda", "puta", "filho da puta",
    // Italian
    "cazzo", "merda", "puttana", "stronzo", "vaffanculo",
  ];

  const explicitWords = [];
  for (const wordData of words) {
    const cleanWord = wordData.word.toLowerCase().trim().replace(/[.,!?;:"']/g, "");
    if (EXPLICIT_WORDS.includes(cleanWord)) {
      console.log("[ANALYZE-AUDIO] Found explicit word:", cleanWord, "at", wordData.start);
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
    console.log("[ANALYZE-AUDIO] Starting analysis");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const {  userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      throw new Error("User not authenticated");
    }
    
    const user = userData.user;
    console.log("[ANALYZE-AUDIO] User authenticated:", user.id);

    const { storagePath, fileName } = await req.json();
    if (!storagePath || !fileName) {
      throw new Error("Missing storage path or file name");
    }

    console.log("[ANALYZE-AUDIO] Processing file:", storagePath);

    // Download audio from storage
    const {  audioData, error: downloadError } = await supabaseClient.storage
      .from("audio-files")
      .download(storagePath);

    if (downloadError || !audioData) {
      throw new Error(`Failed to download audio: ${downloadError?.message || 'No data'}`);
    }

    const bytes = new Uint8Array(await audioData.arrayBuffer());
    const fileSizeMB = bytes.length / (1024 * 1024);
    console.log("[ANALYZE-AUDIO] File size:", fileSizeMB.toFixed(2), "MB");

    if (fileSizeMB > 24) {
      throw new Error(`Audio file too large (${fileSizeMB.toFixed(1)}MB). Max: 25MB`);
    }

    // FIXED: Use direct binary upload instead of FormData
    console.log("[ANALYZE-AUDIO] Calling Whisper API...");
    
    const whisperController = new AbortController();
    const whisperTimeout = setTimeout(() => whisperController.abort(), 120000); // 2 min timeout

    let whisperResponse;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ANALYZE-AUDIO] Whisper attempt ${attempt}/3`);

        // FIXED: Use multipart/form-data with proper boundary
        const boundary = `----FormBoundary${Date.now()}`;
        const body = [
          `--${boundary}`,
          `Content-Disposition: form-data; name="file"; filename="audio.mp3"`,
          `Content-Type: audio/mpeg`,
          ``,
          // This is tricky - we need to append binary data
          // For Deno, use a different approach:
        ];

        // SIMPLER FIX: Create FormData-like structure manually
        const parts = [];
        parts.push(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`));
        parts.push(bytes);
        parts.push(new TextEncoder().encode(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword\r\n--${boundary}--\r\n`));

        const bodyData = await concatUint8Arrays(parts);

        whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
          },
          body: bodyData,
          signal: whisperController.signal
        });

        console.log("[ANALYZE-AUDIO] Whisper status:", whisperResponse.status);

        if (whisperResponse.ok) {
          break;
        }

        const errorText = await whisperResponse.text();
        console.error(`[ANALYZE-AUDIO] Whisper error attempt ${attempt}:`, errorText);
        
        if (whisperResponse.status >= 500 && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          continue;
        }

        throw new Error(errorText);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt === 3) throw error;
      }
    }

    clearTimeout(whisperTimeout);

    if (!whisperResponse?.ok) {
      throw new Error(`Whisper failed: ${lastError}`);
    }

    const transcription = await whisperResponse.json();
    console.log("[ANALYZE-AUDIO] Transcription done, text length:", transcription.text?.length);

    // Detect explicit words
    let explicitWords = [];
    if (transcription.words?.length > 0) {
      console.log("[ANALYZE-AUDIO] Processing", transcription.words.length, "words");
      explicitWords = await detectExplicitWords(transcription.words, transcription.text);
    }

    // Store in database
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

    if (insertError) throw insertError;

    console.log("[ANALYZE-AUDIO] Success! Analysis ID:", analysisData.id);

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
    console.error("[ANALYZE-AUDIO] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

// Helper function
async function concatUint8Arrays(arrays: Uint8Array[]): Promise<Uint8Array> {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
