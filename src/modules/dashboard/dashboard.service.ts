import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model, Types } from "mongoose";
import dayjs, { type Dayjs } from "dayjs";
import { ImmersionSession } from "../immersion-session/schemas/immersion-session.schema.js";
import type {
  DashboardRange,
  DashboardStatisticsDto,
} from "./dto/dashboard-statistics.dto.js";
import type {
  DashboardBucketResponseDto,
  DashboardStatisticsResponseDto,
} from "./dto/dashboard-statistics-response.dto.js";

type DailyTotals = {
  _id: Date;
  reading_time: number;
  audiovisual_time: number;
};

type ActiveDay = { _id: Date };

function dateKey(date: Dayjs): string {
  return date.format("YYYY-MM-DD");
}

function calendarDate(date: Dayjs, timezone: string): Dayjs {
  return dayjs.tz(date.format("YYYY-MM-DD"), timezone).startOf("day");
}

function rangeStart(
  range: DashboardRange,
  today: Dayjs,
  timezone: string,
): Dayjs | undefined {
  switch (range) {
    case "week":
      return today.startOf("isoWeek");
    case "month":
      return today.startOf("month");
    case "year":
      return calendarDate(today.subtract(1, "year"), timezone);
    case "total":
      return undefined;
  }
}

function bucketStart(range: DashboardRange, date: Dayjs, start: Dayjs): Dayjs {
  let bucket: Dayjs;
  switch (range) {
    case "week":
      return date;
    case "month":
      bucket = date.startOf("isoWeek");
      break;
    case "year":
      bucket = date.startOf("month");
      break;
    case "total":
      return date.startOf("year");
  }
  return bucket.isBefore(start) ? start : bucket;
}

function nextBucket(
  range: DashboardRange,
  date: Dayjs,
  timezone: string,
): Dayjs {
  switch (range) {
    case "week":
      return calendarDate(date.add(1, "day"), timezone);
    case "month":
      return calendarDate(date.startOf("isoWeek").add(1, "week"), timezone);
    case "year":
      return dayjs
        .tz(
          date.startOf("month").add(1, "month").format("YYYY-MM-01"),
          timezone,
        )
        .startOf("day");
    case "total":
      return dayjs
        .tz(date.startOf("year").add(1, "year").format("YYYY-01-01"), timezone)
        .startOf("day");
  }
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(ImmersionSession.name)
    private readonly sessionModel: Model<ImmersionSession>,
  ) {}

  async statistics(
    input: DashboardStatisticsDto,
    userId: string,
  ): Promise<DashboardStatisticsResponseDto> {
    const now = dayjs.utc();
    const today = now.tz(input.timezone).startOf("day");
    const tomorrow = calendarDate(today.add(1, "day"), input.timezone);
    const start = rangeStart(input.range, today, input.timezone);
    // Return at most one row per day rather than loading individual sessions.
    const days = await this.sessionModel
      .aggregate<DailyTotals>([
        {
          $match: {
            user_id: userId,
            language: new Types.ObjectId(input.language),
            created_at: {
              ...(start ? { $gte: start.toDate() } : {}),
              $lt: tomorrow.toDate(),
              $lte: now.toDate(),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$created_at",
                unit: "day",
                timezone: input.timezone,
              },
            },
            reading_time: {
              $sum: {
                $cond: [
                  { $in: ["$content_type", ["book", "manga"]] },
                  "$duration",
                  0,
                ],
              },
            },
            audiovisual_time: {
              $sum: {
                $cond: [
                  { $in: ["$content_type", ["anime", "drama", "video"]] },
                  "$duration",
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .exec();

    const streakDays = await this.sessionModel
      .aggregate<ActiveDay>([
        {
          $match: {
            user_id: userId,
            language: new Types.ObjectId(input.language),
            created_at: { $lte: now.toDate() },
          },
        },
        {
          $group: {
            _id: {
              $dateTrunc: {
                date: "$created_at",
                unit: "day",
                timezone: input.timezone,
              },
            },
          },
        },
      ])
      .exec();

    const result: DashboardStatisticsResponseDto = {
      total_immersion_time: 0,
      current_streak: 0,
      reading_time: 0,
      audiovisual_time: 0,
      average_time: 0,
      breakdown: [],
    };
    const activeDays = new Set(
      streakDays.map(({ _id }) => dateKey(dayjs.utc(_id).tz(input.timezone))),
    );
    let streakDay = today;
    if (!activeDays.has(dateKey(today)))
      streakDay = streakDay.subtract(1, "day");
    while (activeDays.has(dateKey(streakDay))) {
      result.current_streak++;
      streakDay = streakDay.subtract(1, "day");
    }

    const averageStart =
      start ??
      (days[0] ? dayjs.utc(days[0]._id).tz(input.timezone) : undefined);
    if (!averageStart) return result;

    let chartEnd = tomorrow;
    if (input.range === "week")
      chartEnd = calendarDate(averageStart.add(1, "week"), input.timezone);
    if (input.range === "month")
      chartEnd = dayjs
        .tz(
          today.startOf("month").add(1, "month").format("YYYY-MM-01"),
          input.timezone,
        )
        .startOf("day");

    const buckets = new Map<string, DashboardBucketResponseDto>();

    for (
      let date = bucketStart(input.range, averageStart, averageStart);
      date.isBefore(chartEnd);
      date = nextBucket(input.range, date, input.timezone)
    ) {
      const key = dateKey(date);
      buckets.set(key, {
        start_date: key,
        reading_time: 0,
        audiovisual_time: 0,
      });
    }

    for (const day of days) {
      const date = dayjs.utc(day._id).tz(input.timezone);
      result.reading_time += day.reading_time;
      result.audiovisual_time += day.audiovisual_time;
      const bucket = buckets.get(
        dateKey(bucketStart(input.range, date, averageStart)),
      )!;
      bucket.reading_time += day.reading_time;
      bucket.audiovisual_time += day.audiovisual_time;
    }
    result.total_immersion_time = result.reading_time + result.audiovisual_time;
    result.average_time =
      result.total_immersion_time / (today.diff(averageStart, "day") + 1);
    result.breakdown = [...buckets.values()];
    return result;
  }
}
