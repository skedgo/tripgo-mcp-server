import polyline from "@mapbox/polyline";
import { point, polygon } from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Coordinate } from "./tripgo";

/**
 * @param coordinate
 * @param polygon Encoded polygon of coverage area for the region, using Google's Encoded Polyline Algorithm. See https://developers.google.com/maps/documentation/utilities/polylinealgorithm.
 */
export function coordinateInPolygon(
  coordinate: Coordinate,
  encodedPolygon: string,
): boolean {
  // Decode the polygon using Google's polyline decoding algorithm
  const points = polyline.decode(encodedPolygon);

  // Convert to GeoJSON format - Turf expects [lng, lat] order
  const polygonCoords = points.map((coord) => [coord[1], coord[0]]);

  // Close the polygon if it's not already closed
  if (
    polygonCoords[0][0] !== polygonCoords[polygonCoords.length - 1][0] ||
    polygonCoords[0][1] !== polygonCoords[polygonCoords.length - 1][1]
  ) {
    polygonCoords.push(polygonCoords[0]);
  }

  // Create Turf point and polygon objects
  const turfPoint = point([coordinate.lng, coordinate.lat]);
  const turfPolygon = polygon([polygonCoords]);

  // Check if point is inside polygon
  return booleanPointInPolygon(turfPoint, turfPolygon);
}

/**
 * Native JS equivalent of date-fns-tz's zonedTimeToUtc
 * Interprets a ISO date string with no timezone as being in the specified timezone and returns UTC Date.
 * For instance, if `isoDateLocalString` is "2025-07-18T19:00:00" and `timezone` is "Australia/Sydney",
 * it will interpret this as 7 PM on July 18, 2025 in Sydney time, and it will return a Date object in UTC
 * representing that same moment in time.
 * Assuming Sydney is in AEST (UTC+10) during July, then zonedTimeToUtc("2025-07-18T19:00:00", "Australia/Sydney").getTime()
 * is exactly the same as new Date("2025-07-18T19:00:00T+10:00").getTime();
 */
export function zonedTimeToUtc(
  isoDateLocalString: string,
  timezone: string,
): Date {
  // Parse the date string as if it were in UTC (to avoid local timezone interpretation)
  const date = new Date(`${isoDateLocalString}Z`);

  // Get what this UTC time would be when displayed in the target timezone
  const targetTime = new Date(
    date.toLocaleString("en-US", { timeZone: timezone }),
  );

  // Calculate the offset between UTC and the target timezone
  const utcTime = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const offset = targetTime.getTime() - utcTime.getTime();

  // Apply the reverse offset to get the UTC time that would display as the input in the target timezone
  return new Date(date.getTime() - offset);
}

/**
 * Native JS equivalent of date-fns-tz's utcToZonedTime
 * Converts a UTC Date to how it would appear in the specified timezone
 */
export function utcToZonedTime(utcDate: Date, timezone: string): Date {
  // Get the date as it would appear in the target timezone
  const targetTimeString = utcDate.toLocaleString("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Parse this as a local time (which will be interpreted in the server's timezone)
  // But we want it to represent the time as it appears in the target timezone
  const [datePart, timePart] = targetTimeString.split(", ");
  const [year, month, day] = datePart.split("-");
  const [hour, minute, second] = timePart.split(":");

  // Create a new Date object with these components
  return new Date(
    Number.parseInt(year),
    Number.parseInt(month) - 1, // Month is 0-indexed
    Number.parseInt(day),
    Number.parseInt(hour),
    Number.parseInt(minute),
    Number.parseInt(second),
  );
}

/**
 * Converts a UTC Date to ISO string in the specified timezone with timezone offset
 */
export function toISOStringInTimezone(utcDate: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "longOffset",
  });

  const parts = formatter.formatToParts(utcDate);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  const second = parts.find((p) => p.type === "second")?.value;
  const offsetPart =
    parts.find((p) => p.type === "timeZoneName")?.value || "+00:00";

  // Format as ISO string (YYYY-MM-DD format)
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetPart}`;
}
