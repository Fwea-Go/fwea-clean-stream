# Hetzner Audio Processing Server Setup

This document provides instructions for setting up the audio processing API on your Hetzner server.

## Server Requirements

- Node.js 18+ 
- FFmpeg installed
- NPM or Yarn

## Installation Steps

### 1. Install Dependencies

```bash
# SSH into your server
ssh root@178.156.190.229

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Verify installations
node --version
ffmpeg -version
```

### 2. Create Project Directory

```bash
mkdir -p /opt/audio-processor
cd /opt/audio-processor
```

### 3. Create package.json

```bash
cat > package.json << 'EOF'
{
  "name": "audio-processor",
  "version": "1.0.0",
  "description": "Audio processing API for clean version generation",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "uuid": "^9.0.0"
  }
}
EOF
```

### 4. Create server.js

```bash
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

const execAsync = promisify(exec);

const app = express();
app.use(cors());
app.use(express.json({ limit: '500mb' }));

// Serve static files from output directory
app.use('/output', express.static('/opt/audio-processor/output'));

const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';
const PORT = process.env.PORT || 3001;
const SERVER_URL = process.env.SERVER_URL || 'http://178.156.190.229:3001';

// Ensure directories exist
const tempDir = '/opt/audio-processor/temp';
const outputDir = '/opt/audio-processor/output';
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// API Key middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
}

// Download file from URL
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// Build FFmpeg volume filter for muting segments
function buildVolumeFilter(muteSegments) {
  if (!muteSegments || muteSegments.length === 0) {
    return 'volume=1.0';
  }
  
  return muteSegments.map(seg => 
    `volume=enable='between(t,${seg.start},${seg.end})':volume=0`
  ).join(',');
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main audio processing endpoint
app.post('/api/process-audio', authenticateApiKey, async (req, res) => {
  const jobId = uuidv4();
  const vocalsPath = path.join(tempDir, `${jobId}_vocals.mp3`);
  const instrumentalPath = path.join(tempDir, `${jobId}_instrumental.mp3`);
  const mutedVocalsPath = path.join(tempDir, `${jobId}_muted_vocals.mp3`);
  const outputPath = path.join(outputDir, `${jobId}_clean.mp3`);
  
  console.log(`[${jobId}] Processing started`);
  
  try {
    const { vocalsUrl, instrumentalUrl, muteSegments, outputFormat = 'mp3' } = req.body;
    
    if (!vocalsUrl || !instrumentalUrl) {
      return res.status(400).json({ error: 'Missing vocalsUrl or instrumentalUrl' });
    }
    
    console.log(`[${jobId}] Downloading vocals from:`, vocalsUrl);
    console.log(`[${jobId}] Downloading instrumental from:`, instrumentalUrl);
    console.log(`[${jobId}] Mute segments:`, muteSegments?.length || 0);
    
    // Download both files
    await Promise.all([
      downloadFile(vocalsUrl, vocalsPath),
      downloadFile(instrumentalUrl, instrumentalPath)
    ]);
    
    console.log(`[${jobId}] Files downloaded`);
    
    // Step 1: Apply muting to vocals
    const volumeFilter = buildVolumeFilter(muteSegments);
    console.log(`[${jobId}] Volume filter:`, volumeFilter.substring(0, 200));
    
    const muteCommand = `ffmpeg -y -i "${vocalsPath}" -af "${volumeFilter}" -c:a libmp3lame -q:a 2 "${mutedVocalsPath}"`;
    console.log(`[${jobId}] Running mute command...`);
    
    await execAsync(muteCommand);
    console.log(`[${jobId}] Vocals muted successfully`);
    
    // Step 2: Merge muted vocals with instrumental
    const mergeCommand = `ffmpeg -y -i "${instrumentalPath}" -i "${mutedVocalsPath}" -filter_complex "amix=inputs=2:duration=first:dropout_transition=0" -c:a libmp3lame -q:a 2 "${outputPath}"`;
    console.log(`[${jobId}] Running merge command...`);
    
    await execAsync(mergeCommand);
    console.log(`[${jobId}] Audio merged successfully`);
    
    // Generate public URL for the output
    const cleanAudioUrl = `${SERVER_URL}/output/${jobId}_clean.mp3`;
    
    console.log(`[${jobId}] Processing complete:`, cleanAudioUrl);
    
    // Cleanup temp files (keep output)
    fs.unlink(vocalsPath, () => {});
    fs.unlink(instrumentalPath, () => {});
    fs.unlink(mutedVocalsPath, () => {});
    
    // Schedule output file cleanup after 1 hour
    setTimeout(() => {
      fs.unlink(outputPath, () => {
        console.log(`[${jobId}] Output file cleaned up`);
      });
    }, 60 * 60 * 1000);
    
    res.json({
      success: true,
      jobId,
      cleanAudioUrl,
      muteSegmentsApplied: muteSegments?.length || 0
    });
    
  } catch (error) {
    console.error(`[${jobId}] Error:`, error);
    
    // Cleanup on error
    [vocalsPath, instrumentalPath, mutedVocalsPath, outputPath].forEach(p => {
      fs.unlink(p, () => {});
    });
    
    res.status(500).json({
      error: error.message || 'Processing failed',
      jobId
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Audio processor running on port ${PORT}`);
  console.log(`Server URL: ${SERVER_URL}`);
});
EOF
```

### 5. Install Node Dependencies

```bash
npm install
```

### 6. Set Environment Variables

Create a `.env` file or set environment variables:

```bash
export API_KEY="your-secure-api-key-here"
export PORT=3001
export SERVER_URL="http://178.156.190.229:3001"
```

### 7. Create Systemd Service (for auto-start)

```bash
cat > /etc/systemd/system/audio-processor.service << 'EOF'
[Unit]
Description=Audio Processor API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/audio-processor
Environment=API_KEY=your-secure-api-key-here
Environment=PORT=3001
Environment=SERVER_URL=http://178.156.190.229:3001
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start service
systemctl daemon-reload
systemctl enable audio-processor
systemctl start audio-processor

# Check status
systemctl status audio-processor
```

### 8. Configure Firewall (if needed)

```bash
# Allow port 3001
ufw allow 3001/tcp
```

### 9. Test the API

```bash
# Health check
curl http://178.156.190.229:3001/health

# Test processing (replace with real URLs)
curl -X POST http://178.156.190.229:3001/api/process-audio \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secure-api-key-here" \
  -d '{
    "vocalsUrl": "https://example.com/vocals.mp3",
    "instrumentalUrl": "https://example.com/instrumental.mp3",
    "muteSegments": [
      {"start": 1.5, "end": 2.0},
      {"start": 5.3, "end": 5.8}
    ]
  }'
```

## Supabase Configuration

Add these secrets in your Supabase/Lovable project:

- `HETZNER_API_URL`: `http://178.156.190.229:3001/api/process-audio`
- `HETZNER_API_KEY`: Your secure API key from step 6

## API Reference

### POST /api/process-audio

**Headers:**
- `Content-Type: application/json`
- `X-API-Key: your-api-key`

**Body:**
```json
{
  "vocalsUrl": "https://...",
  "instrumentalUrl": "https://...",
  "muteSegments": [
    {"start": 1.5, "end": 2.0},
    {"start": 5.3, "end": 5.8}
  ],
  "outputFormat": "mp3"
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "cleanAudioUrl": "http://178.156.190.229:3001/output/uuid_clean.mp3",
  "muteSegmentsApplied": 2
}
```

## Troubleshooting

### Check logs
```bash
journalctl -u audio-processor -f
```

### Restart service
```bash
systemctl restart audio-processor
```

### Test FFmpeg
```bash
ffmpeg -version
```
