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
    console.warn("[ANALYZE-AUDIO] LOVABLE_API_KEY not set, falling back to basic detection");
    return basicDetection(words);
  }

  try {
    console.log("[ANALYZE-AUDIO] Using AI for explicit content detection");
    
    // Create a list of words with timestamps for AI analysis
    const wordList = words.map((w: any, idx: number) => ({
      index: idx,
      word: w.word,
      start: w.start,
      end: w.end
    }));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "system",
          content: `You are an expert content moderator. Analyze transcribed audio and identify ALL explicit, profane, vulgar, or offensive words including slang, euphemisms, and variations. Be extremely thorough - catch everything that would need censoring in broadcast media.

Return a JSON object with an array called "explicit_indices" containing the array indices of explicit words from the provided word list. Only return the indices, nothing else.

Examples of what to catch:
- Direct profanity (fuck, shit, damn, bitch, ass, dick, cock, pussy, cunt, bastard, etc.)
- Racial slurs and offensive terms (nigga, nigger, etc.)
- Sexual content and references
- Violent or aggressive language
- Drug references
- All variations and slang (frickin, dang, fricken, freaking when used as substitutes, etc.)
- Words in any language (Spanish, French, German, Portuguese, Italian, etc.)

Be consistent and catch EVERYTHING that would be censored on radio/TV.`
        }, {
          role: "user",
          content: `Transcript: "${transcript}"\n\nWord list with indices:\n${JSON.stringify(wordList, null, 2)}`
        }],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      console.error("[ANALYZE-AUDIO] AI detection failed:", await response.text());
      return basicDetection(words);
    }

    const result = await response.json();
    const aiResponse = JSON.parse(result.choices[0].message.content);
    const explicitIndices = aiResponse.explicit_indices || [];
    
    console.log(`[ANALYZE-AUDIO] AI detected ${explicitIndices.length} explicit words`);

    const explicitWords = explicitIndices.map((idx: number) => {
      const wordData = words[idx];
      return {
        word: wordData.word,
        start: wordData.start || 0,
        end: wordData.end || 0,
        language: "detected_by_ai",
        confidence: 0.98,
      };
    });

    return explicitWords;
  } catch (error) {
    console.error("[ANALYZE-AUDIO] AI detection error:", error);
    return basicDetection(words);
  }
}

// Fallback basic detection
function basicDetection(words: any[]) {
  const EXPLICIT_WORDS = [
    // English
    "fuck", "fucking", "fucked", "fucker", "fck", "fuk", "shit", "shit", "damn", "bitch", "bitches", 
    "ass", "asshole", "bastard", "hell", "crap", "dick", "cock", "pussy", "piss", "cunt", 
    "motherfucker", "bullshit", "nigga", "nigger", "whore", "slut",
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

    const { storagePath, fileName } = await req.json();
    if (!storagePath || !fileName) {
      console.error("[ANALYZE-AUDIO] Missing data:", { hasStoragePath: !!storagePath, hasFileName: !!fileName });
      throw new Error("Missing storage path or file name");
    }

    console.log("[ANALYZE-AUDIO] Processing file from storage:", storagePath);

    // Download audio from storage
    console.log("[ANALYZE-AUDIO] Downloading from storage...");
    const { data: audioData, error: downloadError } = await supabaseClient.storage
      .from("audio-files")
      .download(storagePath);

    if (downloadError || !audioData) {
      console.error("[ANALYZE-AUDIO] Download error:", downloadError);
      throw new Error(`Failed to download audio: ${downloadError?.message || 'No data'}`);
    }

    const bytes = new Uint8Array(await audioData.arrayBuffer());
    console.log("[ANALYZE-AUDIO] File downloaded, bytes length:", bytes.length);

    // Check file size (OpenAI Whisper has a 25MB limit)
    const fileSizeMB = bytes.length / (1024 * 1024);
    console.log("[ANALYZE-AUDIO] File size:", fileSizeMB.toFixed(2), "MB");

    if (fileSizeMB > 24) {
      console.error("[ANALYZE-AUDIO] File too large for Whisper API");
      throw new Error(`Audio file is too large (${fileSizeMB.toFixed(1)}MB). OpenAI Whisper supports files up to 25MB. Please try a shorter audio file.`);
    }

    // Transcribe audio using OpenAI Whisper with retry logic
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

    // Retry logic for transient errors
    const maxRetries = 3;
    let whisperResponse;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[ANALYZE-AUDIO] Calling OpenAI Whisper API (attempt ${attempt}/${maxRetries})...`);
      
      try {
        whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
          },
          body: formData,
        });

        console.log("[ANALYZE-AUDIO] Whisper response status:", whisperResponse.status);

        if (whisperResponse.ok) {
          break; // Success!
        }

        const errorText = await whisperResponse.text();
        console.error(`[ANALYZE-AUDIO] Whisper error (attempt ${attempt}):`, errorText);
        
        // Parse error to check if it's retryable
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }

        // Retry on 500 server errors, don't retry on client errors (4xx)
        if (whisperResponse.status >= 500 && attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`[ANALYZE-AUDIO] Retrying in ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          lastError = errorData.error?.message || errorText;
          continue;
        }

        // Don't retry on client errors or last attempt
        throw new Error(errorData.error?.message || errorText);
      } catch (error) {
        if (attempt === maxRetries) {
          throw new Error(`Whisper API failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`);
        }
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (!whisperResponse || !whisperResponse.ok) {
      throw new Error(`Whisper API error: ${lastError || "Unknown error"}`);
    }

    const transcription = await whisperResponse.json();
    console.log("[ANALYZE-AUDIO] Transcription complete, text length:", transcription.text?.length || 0);

    // Detect explicit words using AI-enhanced detection
    let explicitWords: Array<{
      word: string;
      start: number;
      end: number;
      language: string;
      confidence: number;
    }> = [];

    if (transcription.words && transcription.words.length > 0) {
      console.log("[ANALYZE-AUDIO] Processing", transcription.words.length, "words");
      explicitWords = await detectExplicitWords(transcription.words, transcription.text);
      console.log(`[ANALYZE-AUDIO] Found ${explicitWords.length} explicit words`);
    } else {
      console.log("[ANALYZE-AUDIO] No word-level timestamps available");
    }

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