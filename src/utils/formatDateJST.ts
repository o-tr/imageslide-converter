import { formatInTimeZone } from "date-fns-tz";

export const formatDateJST = (date: Date): string => {
  return formatInTimeZone(date, "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
};
