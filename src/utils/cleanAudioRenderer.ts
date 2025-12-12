/**
 * Client-side audio renderer that creates clean versions by muting explicit segments
 * Uses OfflineAudioContext for precise rendering and lamejs for MP3 encoding
 */

import lamejs from 'lamejs';

export interface MuteRegion {
  start: number;
  end: number;
}

export interface RenderProgress {
  stage: 'loading' | 'rendering' | 'encoding' | 'complete';
  progress: number;
  message: string;
}

type ProgressCallback = (progress: RenderProgress) => void;

/**
 * Load an audio file from URL and decode it
 */
async function loadAudioBuffer(
  audioContext: AudioContext | OfflineAudioContext,
  url: string
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Create volume automation curve for muting specific regions
 */
function createVolumeAutomation(
  gainNode: GainNode,
  muteRegions: MuteRegion[],
  duration: number,
  sampleRate: number
): void {
  const gain = gainNode.gain;
  
  // Start at full volume
  gain.setValueAtTime(1, 0);
  
  // Sort regions by start time
  const sortedRegions = [...muteRegions].sort((a, b) => a.start - b.start);
  
  for (const region of sortedRegions) {
    const muteStart = Math.max(0, region.start - 0.05); // 50ms fade
    const muteEnd = Math.min(duration, region.end + 0.05);
    
    // Fade out before mute
    gain.setValueAtTime(1, muteStart);
    gain.linearRampToValueAtTime(0, muteStart + 0.03);
    
    // Stay muted
    gain.setValueAtTime(0, muteEnd - 0.03);
    
    // Fade back in after mute
    gain.linearRampToValueAtTime(1, muteEnd);
  }
}

/**
 * Encode AudioBuffer to MP3 using lamejs
 */
function encodeToMp3(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void
): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;
  const samples = audioBuffer.length;
  
  // Target ~128kbps for good quality/size balance
  const bitrate = 128;
  
  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, bitrate);
  const mp3Data: ArrayBuffer[] = [];
  
  // Get audio data
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = numChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
  
  // Convert Float32 to Int16
  const leftSamples = new Int16Array(samples);
  const rightSamples = new Int16Array(samples);
  
  for (let i = 0; i < samples; i++) {
    leftSamples[i] = Math.max(-32768, Math.min(32767, leftChannel[i] * 32768));
    rightSamples[i] = Math.max(-32768, Math.min(32767, rightChannel[i] * 32768));
    
    // Report progress every 10%
    if (onProgress && i % Math.floor(samples / 10) === 0) {
      onProgress(Math.round((i / samples) * 100));
    }
  }
  
  // Encode in chunks
  const blockSize = 1152;
  for (let i = 0; i < samples; i += blockSize) {
    const leftChunk = leftSamples.subarray(i, i + blockSize);
    const rightChunk = rightSamples.subarray(i, i + blockSize);
    
    const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(new Uint8Array(mp3buf).buffer);
    }
  }
  
  // Flush remaining data
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(new Uint8Array(mp3buf).buffer);
  }
  
  return new Blob(mp3Data, { type: 'audio/mp3' });
}

/**
 * Render clean audio by muting explicit segments in vocals and mixing with instrumental
 */
export async function renderCleanAudio(
  vocalsUrl: string,
  instrumentalUrl: string,
  muteRegions: MuteRegion[],
  onProgress?: ProgressCallback
): Promise<Blob> {
  const reportProgress = (stage: RenderProgress['stage'], progress: number, message: string) => {
    onProgress?.({ stage, progress, message });
  };
  
  reportProgress('loading', 0, 'Loading audio files...');
  
  // Create temporary AudioContext to decode files
  const tempContext = new AudioContext();
  
  try {
    // Load both audio files in parallel
    reportProgress('loading', 20, 'Decoding vocals...');
    const [vocalsBuffer, instrumentalBuffer] = await Promise.all([
      loadAudioBuffer(tempContext, vocalsUrl),
      loadAudioBuffer(tempContext, instrumentalUrl),
    ]);
    
    reportProgress('loading', 50, 'Audio loaded, preparing render...');
    
    // Use the longer duration
    const duration = Math.max(vocalsBuffer.duration, instrumentalBuffer.duration);
    const sampleRate = vocalsBuffer.sampleRate;
    const numChannels = Math.max(vocalsBuffer.numberOfChannels, instrumentalBuffer.numberOfChannels);
    
    // Create OfflineAudioContext for rendering
    const offlineContext = new OfflineAudioContext(
      numChannels,
      Math.ceil(duration * sampleRate),
      sampleRate
    );
    
    reportProgress('rendering', 60, 'Creating clean version...');
    
    // Create vocals source with volume automation for muting
    const vocalsSource = offlineContext.createBufferSource();
    vocalsSource.buffer = vocalsBuffer;
    
    const vocalsGain = offlineContext.createGain();
    createVolumeAutomation(vocalsGain, muteRegions, duration, sampleRate);
    
    vocalsSource.connect(vocalsGain);
    vocalsGain.connect(offlineContext.destination);
    
    // Create instrumental source (plays through unchanged)
    const instrumentalSource = offlineContext.createBufferSource();
    instrumentalSource.buffer = instrumentalBuffer;
    instrumentalSource.connect(offlineContext.destination);
    
    // Start both sources
    vocalsSource.start(0);
    instrumentalSource.start(0);
    
    reportProgress('rendering', 70, 'Rendering audio...');
    
    // Render the audio
    const renderedBuffer = await offlineContext.startRendering();
    
    reportProgress('encoding', 80, 'Encoding to MP3...');
    
    // Encode to MP3
    const mp3Blob = encodeToMp3(renderedBuffer, (encodeProgress) => {
      reportProgress('encoding', 80 + (encodeProgress * 0.15), `Encoding: ${encodeProgress}%`);
    });
    
    reportProgress('complete', 100, 'Complete!');
    
    return mp3Blob;
    
  } finally {
    await tempContext.close();
  }
}

/**
 * Sanitize filename for clean download
 */
export function sanitizeFilename(fileName: string): string {
  // Remove extension if present
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  
  // Remove special characters, keep alphanumeric, spaces, hyphens, underscores
  const sanitized = nameWithoutExt
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  
  return sanitized || 'audio';
}

/**
 * Trigger download of a Blob with the given filename
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
