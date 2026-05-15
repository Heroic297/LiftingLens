export interface ExtractedFrame {
  imageData: ImageData;
  time: number;
  index: number;
}

/**
 * MediaRecorder-produced WebM blobs are missing duration metadata, so
 * `video.duration` returns Infinity. We force the browser to seek past the
 * end, which makes it expose the real duration on the next 'seeked' event.
 */
async function getRealDuration(video: HTMLVideoElement): Promise<number> {
  if (isFinite(video.duration) && video.duration > 0) return video.duration;

  return new Promise<number>((resolve) => {
    const onSeeked = () => {
      const d = video.duration;
      video.removeEventListener('seeked', onSeeked);
      video.currentTime = 0;
      // After the duration is exposed, seek back to 0 and wait for that to land
      const onBack = () => {
        video.removeEventListener('seeked', onBack);
        resolve(isFinite(d) && d > 0 ? d : 0);
      };
      video.addEventListener('seeked', onBack, { once: true });
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    // Seek to a very large time — browser clamps to actual end
    video.currentTime = 1e9;
  });
}

export async function extractFrames(
  videoBlob: Blob,
  sampleRate: number,
  onProgress?: (pct: number) => void,
): Promise<ExtractedFrame[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const frames: ExtractedFrame[] = [];
    const interval = 1 / sampleRate;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      URL.revokeObjectURL(url);
    };

    const onError = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    video.addEventListener('error', () => onError('Video failed to load. Try recording again.'));

    video.addEventListener('loadedmetadata', async () => {
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      let duration: number;
      try {
        duration = await getRealDuration(video);
      } catch {
        return onError('Could not determine video duration.');
      }

      if (!isFinite(duration) || duration <= 0) {
        return onError('Video duration could not be read. Try recording again.');
      }

      const times: number[] = [];
      // Stay slightly inside the end to avoid seek-past-end failures
      const safeEnd = Math.max(0, duration - 0.05);
      for (let t = 0; t <= safeEnd; t += interval) {
        times.push(parseFloat(t.toFixed(4)));
      }
      if (times.length === 0) times.push(0);

      let idx = 0;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const seekNext = () => {
        if (idx >= times.length) {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          cleanup();
          resolve(frames);
          return;
        }
        // Hard timeout: if a single seek doesn't fire 'seeked' within 4s,
        // abandon the rest and return what we have
        if (timeoutHandle) clearTimeout(timeoutHandle);
        timeoutHandle = setTimeout(() => {
          cleanup();
          resolve(frames);
        }, 4000);
        try {
          video.currentTime = times[idx];
        } catch {
          // Some browsers throw if seeking before fully ready — push past it
          idx++;
          seekNext();
        }
      };

      const onSeeked = () => {
        try {
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          frames.push({ imageData, time: video.currentTime, index: idx });
          onProgress?.((idx / times.length) * 100);
        } catch {
          // Skip frames that fail to draw (e.g., transient codec issues)
        }
        idx++;
        seekNext();
      };

      video.addEventListener('seeked', onSeeked);
      seekNext();
    });

    video.load();
  });
}

export function getFirstFrame(videoBlob: Blob): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(videoBlob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.currentTime = 0;

    video.addEventListener('loadeddata', () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve({ imageData, width: canvas.width, height: canvas.height });
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video'));
    });

    video.load();
  });
}
