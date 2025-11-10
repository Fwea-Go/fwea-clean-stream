import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AI-powered profanity detection using Lovable AI
async function aiProfanityDetection(words: any[], transcript: string) {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    console.warn("[ANALYZE-AUDIO] LOVABLE_API_KEY not set, falling back to basic detection");
    return basicDetection(words);
  }

  try {
    console.log("[ANALYZE-AUDIO] Using AI-powered profanity detection...");
    
    // Create a word map for quick lookup
    const wordMap = words.map((w, idx) => ({
      index: idx,
      word: w.word,
      start: w.start,
      end: w.end,
    }));

    const prompt = `You are an expert profanity detection system. Analyze the following transcript and identify ALL explicit content, including:
- Standard profanity and curse words
- Slang and informal explicit terms
- Regional and dialect-specific explicit language
- Sexual references and innuendo
- Hate speech and slurs
- Drug references when explicit
- Abbreviated or censored profanity (e.g., "fck", "sh*t", "a$$")
- Any other content that would require censoring for radio/clean versions

Be extremely thorough and catch even subtle or niche explicit terms across all languages and cultures.

Transcript:
${transcript}

Word timing data (word index, word, start time, end time):
${wordMap.slice(0, 1000).map(w => `${w.index}: "${w.word}" (${w.start.toFixed(2)}s - ${w.end.toFixed(2)}s)`).join('\n')}

Return the indices of ALL words that contain explicit content. Be aggressive - when in doubt, flag it.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert profanity detection system that identifies explicit content with extremely high precision. You catch all forms of profanity including slang, regional variations, subtle references, and abbreviated curse words. You prioritize catching ALL explicit content over avoiding false positives."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_explicit_words",
              description: "Report all explicit words found in the transcript",
              parameters: {
                type: "object",
                properties: {
                  explicit_word_indices: {
                    type: "array",
                    items: { type: "number" },
                    description: "Array of word indices that contain explicit content"
                  },
                  confidence_scores: {
                    type: "array",
                    items: { type: "number" },
                    description: "Confidence score (0-1) for each detected word"
                  }
                },
                required: ["explicit_word_indices", "confidence_scores"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "report_explicit_words" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ANALYZE-AUDIO] AI detection error:", response.status, errorText);
      return basicDetection(words);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      console.warn("[ANALYZE-AUDIO] No tool call in AI response, falling back to basic detection");
      return basicDetection(words);
    }

    const result = JSON.parse(toolCall.function.arguments);
    const explicitIndices = result.explicit_word_indices || [];
    const confidenceScores = result.confidence_scores || [];

    console.log(`[ANALYZE-AUDIO] AI detected ${explicitIndices.length} explicit words`);

    // Map indices back to words with timestamps
    const detectedWords = explicitIndices.map((idx: number, i: number) => {
      const word = words[idx];
      if (!word) {
        console.warn(`[ANALYZE-AUDIO] Word index ${idx} not found`);
        return null;
      }
      
      console.log("[ANALYZE-AUDIO] AI Flagged:", word.word, "at", word.start);
      
      return {
        word: word.word,
        start: word.start,
        end: word.end,
        confidence: confidenceScores[i] || 0.95,
        language: "ai-detected",
      };
    }).filter((w: any) => w !== null);

    return detectedWords;

  } catch (error) {
    console.error("[ANALYZE-AUDIO] AI detection failed:", error);
    return basicDetection(words);
  }
}

// Fallback basic detection (used if AI fails)
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
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData?.user) {
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
    console.log("[ANALYZE-AUDIO] Downloading audio from:", storagePath);
    const { data: audioData, error: downloadError } = await supabaseClient.storage
      .from("audio-files")
      .download(storagePath);

    if (downloadError) {
      console.error("[ANALYZE-AUDIO] Download error:", downloadError);
      throw new Error(`Failed to download audio: ${downloadError.message || JSON.stringify(downloadError)}`);
    }
    
    if (!audioData) {
      console.error("[ANALYZE-AUDIO] No audio data returned");
      throw new Error(`File not found at path: ${storagePath}`);
    }

    const bytes = new Uint8Array(await audioData.arrayBuffer());
    const fileSizeMB = bytes.length / (1024 * 1024);
    
    console.log("[ANALYZE-AUDIO] Downloaded:", fileSizeMB.toFixed(2), "MB");

    // Call Deepgram API (no file size limit)
    console.log("[ANALYZE-AUDIO] Calling Deepgram...");
    
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!deepgramKey) {
      throw new Error("DEEPGRAM_API_KEY not set");
    }

    let transcription;
    let lastError;

    // Retry logic
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[ANALYZE-AUDIO] Deepgram attempt ${attempt}/3`);

        const response = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&utterances=false",
          {
            method: "POST",
            headers: {
              "Authorization": `Token ${deepgramKey}`,
              "Content-Type": "audio/mpeg",
            },
            body: bytes,
          }
        );

        console.log("[ANALYZE-AUDIO] Deepgram response:", response.status);

        if (!response.ok) {
          const error = await response.text();
          console.error("[ANALYZE-AUDIO] Deepgram error:", error);
          
          if (response.status >= 500 && attempt < 3) {
            lastError = error;
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
          }
          throw new Error(error);
        }

        const deepgramResult = await response.json();
        
        // Convert Deepgram response to Whisper-like format
        const channel = deepgramResult.results?.channels?.[0];
        const alternative = channel?.alternatives?.[0];
        
        if (!alternative) {
          throw new Error("No transcription in Deepgram response");
        }

        transcription = {
          text: alternative.transcript,
          words: alternative.words?.map((w: any) => ({
            word: w.word,
            start: w.start,
            end: w.end,
          })) || [],
          language: deepgramResult.results?.channels?.[0]?.detected_language || "unknown",
          duration: deepgramResult.metadata?.duration || 0,
        };

        console.log("[ANALYZE-AUDIO] Deepgram OK, text:", transcription.text?.length, "chars");
        break;

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        console.error(`[ANALYZE-AUDIO] Attempt ${attempt} failed:`, lastError);
        
        if (attempt === 3) {
          throw new Error(`Deepgram failed after 3 attempts: ${lastError}`);
        }
        
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }

    if (!transcription) {
      throw new Error("No transcription result");
    }

    // Detect explicit words with AI
    console.log("[ANALYZE-AUDIO] Detecting explicit content with AI...");
    const explicitWords = transcription.words?.length > 0 
      ? await aiProfanityDetection(transcription.words, transcription.text)
      : [];

    console.log("[ANALYZE-AUDIO] Found", explicitWords.length, "explicit words");

    // Store in database
    console.log("[ANALYZE-AUDIO] Saving to database...");
    const { data: analysisData, error: insertError } = await supabaseClient
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
