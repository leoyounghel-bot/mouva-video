export async function inspectVideo(
  file: Blob,
): Promise<{ duration: number; poster: string }> {
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Video metadata could not be read. Try an MP4 file supported by your browser.",
          ),
        );
      }, 20000);
      video.onloadeddata = () => {
        cleanup();
        resolve();
      };
      video.onerror = () => {
        cleanup();
        reject(new Error("This video cannot be decoded by your browser."));
      };
      video.src = url;
      video.load();
    });
    if (
      !Number.isFinite(video.duration) ||
      video.duration < 0.04 ||
      video.duration > 3600
    )
      throw new Error("Import a video between 0.04 seconds and one hour long.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(480, video.videoWidth);
    canvas.height = Math.max(
      1,
      Math.round((canvas.width * video.videoHeight) / video.videoWidth),
    );
    canvas
      .getContext("2d")!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      duration: video.duration,
      poster: canvas.toDataURL("image/jpeg", 0.75),
    };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
