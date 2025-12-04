export const fetchSlideAsPdf = async (
  slideId: string,
): Promise<Uint8Array<ArrayBuffer>> => {
  const pdfFile = (await gapi.client.drive.files.export({
    fileId: slideId,
    mimeType: "application/pdf",
  })) as { body: string };

  return new Uint8Array(
    pdfFile.body.split("").map((char) => char.charCodeAt(0)),
  );
};
