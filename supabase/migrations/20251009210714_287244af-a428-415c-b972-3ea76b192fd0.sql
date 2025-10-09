-- Make the audio-files bucket public so Replicate can access the files
UPDATE storage.buckets 
SET public = true 
WHERE id = 'audio-files';