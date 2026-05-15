export interface ExtractedFrame {
  imageData: ImageData;
  time: number;
  index: number;
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
    video.src = url;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const frames: ExtractedFrame[] = [];
    const interval = 1 / sampleRate;

    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const duration = video.duration;
      const times: number[] = [];
      for (let t = 0; t < duration; t += interval) {
        times.push(parseFloat(t.toFixed(4)));
      }

      let idx = 0;
      const seekNext = () => {
        if (idx >= times.length) {
          URL.revokeObjectURL(url);
          resolve(frames);
          return;
        }
        video.currentTime = times[idx];
      };

      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        frames.push({ imageData, time: video.currentTime, index: idx });
        onProgress?.((idx / times.length) * 100);
        idx++;
        seekNext();
      });

      seekNext();
    });

    video.addEventListener('error', () => {
      URL.revokeObjectURL(url);
      reject(new Error('Video load error'));
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
