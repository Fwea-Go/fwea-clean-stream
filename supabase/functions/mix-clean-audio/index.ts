import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HETZNER_SERVER = 'http://178.156.190.229:9000/clean';

interface ExplicitWord {
  word: string;
  timestamp: number;
  end: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[mix-clean-audio] Starting Hetzner server processing');
    
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

    console.log('[mix-clean-audio] Downloading audio files for Hetzner...');
    
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
    
    console.log('[mix-clean-audio] Preparing request to Hetzner server...');
    
    // Prepare multipart form data for Hetzner server
    const formData = new FormData();
    
    // Add vocals file
    formData.append('vocals', vocalsBlob, 'vocals.mp3');
    
    // Add instrumental file
    formData.append('instrumental', instrumentalBlob, 'instrumental.mp3');
    
    // Add mute timestamps as JSON
    const muteTimestamps = explicitWords.map((w: ExplicitWord) => ({
      start: w.timestamp,
      end: w.end,
      word: w.word,
    }));
    formData.append('mute_timestamps', JSON.stringify(muteTimestamps));
    
    // Enable full render/mix
    formData.append('render', 'true');
    
    console.log('[mix-clean-audio] Sending to Hetzner server:', HETZNER_SERVER);
    console.log('[mix-clean-audio] Muting', explicitWords.length, 'explicit words');
    
    // Send to Hetzner server
    const hetznerResponse = await fetch(HETZNER_SERVER, {
      method: 'POST',
      body: formData,
    });

    if (!hetznerResponse.ok) {
      const errorText = await hetznerResponse.text();
      console.error('[mix-clean-audio] Hetzner error:', errorText);
      throw new Error(`Hetzner server error: ${hetznerResponse.status}`);
    }

    const hetznerResult = await hetznerResponse.json();
    console.log('[mix-clean-audio] Hetzner response:', hetznerResult);

    if (hetznerResult.status !== 'success' || !hetznerResult.download_url) {
      throw new Error('Hetzner server did not return a valid download URL');
    }

    // Download the clean audio from Hetzner
    console.log('[mix-clean-audio] Downloading clean audio from Hetzner...');
    const cleanAudioResponse = await fetch(hetznerResult.download_url);
    
    if (!cleanAudioResponse.ok) {
      throw new Error('Failed to download clean audio from Hetzner');
    }

    const cleanAudioBlob = await cleanAudioResponse.blob();
    const cleanAudioBuffer = await cleanAudioBlob.arrayBuffer();
    
    // Upload to Supabase storage for permanent access
    const cleanFileName = `${user.id}/clean/${fileName}-clean.mp3`;
    
    console.log('[mix-clean-audio] Uploading to Supabase storage:', cleanFileName);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('audio-files')
      .upload(cleanFileName, cleanAudioBuffer, {
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