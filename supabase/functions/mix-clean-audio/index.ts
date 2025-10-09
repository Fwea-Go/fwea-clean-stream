import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExplicitWord {
  timestamp: number;
  end: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[mix-clean-audio] Starting audio mixing process');
    
    const { vocalsUrl, instrumentalUrl, explicitWords, fileName } = await req.json();
    
    if (!vocalsUrl || !instrumentalUrl || !explicitWords || !fileName) {
      throw new Error('Missing required parameters');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user ID from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('[mix-clean-audio] Downloading audio files...');
    
    // Download both audio files
    const [vocalsResponse, instrumentalResponse] = await Promise.all([
      fetch(vocalsUrl),
      fetch(instrumentalUrl),
    ]);

    if (!vocalsResponse.ok || !instrumentalResponse.ok) {
      throw new Error('Failed to download audio files');
    }

    const vocalsBlob = await vocalsResponse.blob();
    const instrumentalBlob = await instrumentalResponse.blob();
    
    console.log('[mix-clean-audio] Building FFmpeg filter for muting...');
    
    // Build FFmpeg filter to mute vocals during explicit words
    // Format: "volume=enable='between(t,start,end)':volume=0"
    let volumeFilters = '';
    
    if (explicitWords.length > 0) {
      const muteConditions = explicitWords
        .map((word: ExplicitWord) => `between(t,${word.timestamp},${word.end})`)
        .join('+');
      
      volumeFilters = `volume=enable='${muteConditions}':volume=0`;
    }

    console.log('[mix-clean-audio] Calling Replicate for audio mixing...');
    
    // Use Replicate to mix audio with FFmpeg
    const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${Deno.env.get('REPLICATE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'b307c29fcbef80bc9edda8c283c1e3c9c1e8ef46b9dc8d4d82ef2f3d40d73c3e', // FFmpeg model
        input: {
          vocals: vocalsUrl,
          instrumental: instrumentalUrl,
          filter_complex: volumeFilters || 'anullsrc',
        },
      }),
    });

    if (!replicateResponse.ok) {
      throw new Error('Failed to start audio mixing');
    }

    const prediction = await replicateResponse.json();
    let predictionId = prediction.id;
    
    console.log('[mix-clean-audio] Polling for result...');
    
    // Poll for result (max 5 minutes)
    let attempts = 0;
    let mixedAudioUrl = null;
    
    while (attempts < 60 && !mixedAudioUrl) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s between checks
      
      const statusResponse = await fetch(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Token ${Deno.env.get('REPLICATE_API_KEY')}`,
          },
        }
      );
      
      const status = await statusResponse.json();
      console.log(`[mix-clean-audio] Status: ${status.status}`);
      
      if (status.status === 'succeeded') {
        mixedAudioUrl = status.output;
        break;
      } else if (status.status === 'failed') {
        throw new Error('Audio mixing failed');
      }
      
      attempts++;
    }

    if (!mixedAudioUrl) {
      throw new Error('Audio mixing timeout');
    }

    console.log('[mix-clean-audio] Downloading mixed audio...');
    
    // Download the mixed audio
    const mixedResponse = await fetch(mixedAudioUrl);
    const mixedBlob = await mixedResponse.blob();
    const mixedBuffer = await mixedBlob.arrayBuffer();
    
    // Upload to Supabase storage
    const cleanFileName = `${user.id}/clean/${fileName}-clean.mp3`;
    
    console.log('[mix-clean-audio] Uploading to storage:', cleanFileName);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(cleanFileName, mixedBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[mix-clean-audio] Upload error:', uploadError);
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('audio-files')
      .getPublicUrl(cleanFileName);

    console.log('[mix-clean-audio] Success! Clean audio URL:', publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true,
        cleanAudioUrl: publicUrl,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[mix-clean-audio] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to mix audio',
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});