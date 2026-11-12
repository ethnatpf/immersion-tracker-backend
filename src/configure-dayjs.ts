import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import isoWeek from "dayjs/plugin/isoWeek.js";
import timezone from "dayjs/plugin/timezone.js";

export function configureDayjs(): void {
  dayjs.extend(utc);
  dayjs.extend(isoWeek);
  dayjs.extend(timezone);
}
