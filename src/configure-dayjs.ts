import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import isoWeek from "dayjs/plugin/isoWeek.js";

export function configureDayjs(): void {
  dayjs.extend(utc);
  dayjs.extend(isoWeek);
}
