import { Buffer } from "buffer";
export const fetchFileBuffer = async (fileId: string) => {
  const response = (await gapi.client.drive.files.get({
    fileId: fileId,
    alt: "media",
  })) as { body: string };
  return Buffer.from(response.body, "binary");
};
