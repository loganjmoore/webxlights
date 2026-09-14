/** Shared with Laravel's max:51200 validation and docker/uploads.ini. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const TOO_LARGE = "This file is too large. Choose a file up to 50 MB.";

export function checkUploadSize(file: Pick<File, "size">): void {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);
}

/** Upload errors may come from Laravel (JSON) or the web server (HTML). */
export function uploadErrorMessage(status: number, body: string): string {
  if (status === 413) return TOO_LARGE;
  if (status === 401 || status === 419) return "Your session has expired. Sign in again, then retry the upload.";
  if (status === 422) {
    try {
      const data: unknown = JSON.parse(body);
      if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
        return data.message;
      }
    } catch { /* A proxy may return HTML instead of JSON. */ }
  }
  return "The file could not be uploaded. Please try again.";
}
