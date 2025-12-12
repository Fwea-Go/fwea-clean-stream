/**
 * Client-side audio renderer that creates clean versions by muting explicit segments
 * Uses OfflineAudioContext for precise rendering and native WAV encoding (no dependencies)
 */

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
  duration: number
): void {
  const gain = gainNode.gain;
  
  // Start at full volume
  gain.setValueAtTime(1, 0);
  
  // Sort regions by start time
  const sortedRegions = [...muteRegions].sort((a, b) => a.start - b.start);
  
  // Merge overlapping regions
  const mergedRegions: MuteRegion[] = [];
  for (const region of sortedRegions) {
    if (mergedRegions.length === 0) {
      mergedRegions.push({ ...region });
    } else {
      const last = mergedRegions[mergedRegions.length - 1];
      if (region.start <= last.end + 0.1) {
        // Merge overlapping or adjacent regions
        last.end = Math.max(last.end, region.end);
      } else {
        mergedRegions.push({ ...region });
      }
    }
  }
  
  for (const region of mergedRegions) {
    const fadeTime = 0.03; // 30ms fade
    const muteStart = Math.max(0, region.start - fadeTime);
    const muteEnd = Math.min(duration, region.end + fadeTime);
    
    // Fade out before mute
    gain.setValueAtTime(1, muteStart);
    gain.linearRampToValueAtTime(0, muteStart + fadeTime);
    
    // Stay muted
    gain.setValueAtTime(0, muteEnd - fadeTime);
    
    // Fade back in after mute
    gain.linearRampToValueAtTime(1, muteEnd);
  }
}

/**
 * Interleave stereo channels for WAV encoding
 */
function interleaveChannels(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const result = new Float32Array(length * numChannels);
  
  if (numChannels === 1) {
    result.set(audioBuffer.getChannelData(0));
  } else {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      result[i * 2] = left[i];
      result[i * 2 + 1] = right[i];
    }
  }
  
  return result;
}

/**
 * Write a string to a DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Encode AudioBuffer to WAV format (no external dependencies)
 */
function encodeWAV(audioBuffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const numSamples = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  
  // Interleave channels
  const interleaved = interleaveChannels(audioBuffer);
  
  // Calculate sizes
  const dataSize = numSamples * numChannels * bytesPerSample;
  const bufferSize = 44 + dataSize; // 44 bytes for WAV header
  
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  
  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferSize - 8, true); // File size - 8
  writeString(view, 8, 'WAVE');
  
  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, bytesPerSample * 8, true); // BitsPerSample
  
  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size
  
  // Write audio data as 16-bit PCM
  let offset = 44;
  for (let i = 0; i < interleaved.length; i++) {
    // Clamp and convert to 16-bit
    const sample = Math.max(-1, Math.min(1, interleaved[i]));
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }
  
  return buffer;
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
    
    // Use the longer duration and ensure same sample rate
    const duration = Math.max(vocalsBuffer.duration, instrumentalBuffer.duration);
    const sampleRate = vocalsBuffer.sampleRate;
    const numChannels = 2; // Force stereo output
    
    // Create OfflineAudioContext for rendering
    const totalSamples = Math.ceil(duration * sampleRate);
    const offlineContext = new OfflineAudioContext(
      numChannels,
      totalSamples,
      sampleRate
    );
    
    reportProgress('rendering', 60, 'Creating clean version...');
    
    // Create vocals source with volume automation for muting
    const vocalsSource = offlineContext.createBufferSource();
    vocalsSource.buffer = vocalsBuffer;
    
    const vocalsGain = offlineContext.createGain();
    createVolumeAutomation(vocalsGain, muteRegions, duration);
    
    vocalsSource.connect(vocalsGain);
    vocalsGain.connect(offlineContext.destination);
    
    // Create instrumental source (plays through unchanged)
    const instrumentalSource = offlineContext.createBufferSource();
    instrumentalSource.buffer = instrumentalBuffer;
    instrumentalSource.connect(offlineContext.destination);
    
    // Start both sources at exactly time 0
    vocalsSource.start(0);
    instrumentalSource.start(0);
    
    reportProgress('rendering', 70, 'Rendering audio...');
    
    // Render the audio
    const renderedBuffer = await offlineContext.startRendering();
    
    reportProgress('encoding', 85, 'Encoding to WAV...');
    
    // Encode to WAV (native, no dependencies)
    const wavBuffer = encodeWAV(renderedBuffer);
    
    reportProgress('complete', 100, 'Complete!');
    
    return new Blob([wavBuffer], { type: 'audio/wav' });
    
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
