/** Base64 SHA-256 digest, the format S3 expects in x-amz-checksum-sha256. */
export const sha256Base64 = async (data: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as BufferSource),
  );
  return btoa(String.fromCharCode(...digest));
};
