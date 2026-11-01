import type { GoogleFilePickerCallbackData } from "@/_types/lib/google/filePicker";
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID } from "@/const/env";

export const showFilePicker = async (
  token: string,
  callback: (data: GoogleFilePickerCallbackData) => void,
) => {
  const picker = new google.picker.PickerBuilder()
    .addView(google.picker.ViewId.DOCS)
    .addView(google.picker.ViewId.DOCS_IMAGES)
    .setLocale("ja")
    .setTitle("Select a slide")
    .setOAuthToken(token)
    .setSelectableMimeTypes(
      "application/vnd.google-apps.presentation,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,image/png,image/jpeg,image/jpg",
    )
    .setDeveloperKey(GOOGLE_API_KEY)
    .setCallback(callback)
    .setAppId(GOOGLE_CLIENT_ID)
    .build();
  picker.setVisible(true);
};
