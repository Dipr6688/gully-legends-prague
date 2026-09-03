import type { MatchRecord } from "./types/match";

export const WEEKEND_WEATHER_LOCATION = {
  latitude: 50.12969,
  longitude: 14.38018,
  timezone: "Europe/Prague",
  venue: "\u010cZU Gully Arena",
  area: "Prague-Suchdol"
} as const;

export const WEEKEND_WEATHER_REVALIDATE_SECONDS = 60 * 60 * 2;

export const WEEKEND_WEATHER_PLAYING_HOURS = [15, 16, 17, 18, 19] as const;
export const WEEKEND_WEATHER_PLAYING_HOURS_LABEL = "15:00-19:00";

export const WEEKEND_WEATHER_HOURLY_FIELDS = [
  "weather_code",
  "temperature_2m",
  "precipitation_probability",
  "wind_speed_10m"
] as const;

export type WeekendWeatherDatePlan = {
  today: string;
  saturday: string;
  sunday: string;
};

export type WeatherCondition = {
  label: string;
  icon: string;
};

export type WeekendWeatherDay = {
  date: string;
  weekday: "SAT" | "SUN";
  condition: WeatherCondition;
  maxTemperatureC: number;
  minTemperatureC: number;
  precipitationProbability: number;
  maxWindKmh: number;
  isMatchDay: boolean;
  isPastContext: boolean;
};

export type WeekendWeatherViewModel =
  | {
      status: "available" | "partial";
      location: typeof WEEKEND_WEATHER_LOCATION;
      weekend: WeekendWeatherDatePlan;
      days: WeekendWeatherDay[];
      summary: string;
      message?: string;
    }
  | {
      status: "unavailable";
      location: typeof WEEKEND_WEATHER_LOCATION;
      weekend: WeekendWeatherDatePlan;
      days: [];
      summary: "";
      message: string;
    };

export type OpenMeteoHourlyResponse = {
  hourly?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m?: unknown;
    precipitation_probability?: unknown;
    wind_speed_10m?: unknown;
  };
};

function getPragueDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WEEKEND_WEATHER_LOCATION.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return now.toISOString().slice(0, 10);

  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getDateKeyDay(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

export function getUpcomingWeekendDates(now = new Date()): WeekendWeatherDatePlan {
  const today = getPragueDateKey(now);
  const day = getDateKeyDay(today);

  if (day === 0) {
    return {
      today,
      saturday: addDays(today, -1),
      sunday: today
    };
  }

  const daysUntilSaturday = day === 6 ? 0 : 6 - day;
  const saturday = addDays(today, daysUntilSaturday);

  return {
    today,
    saturday,
    sunday: addDays(saturday, 1)
  };
}

export function getWeatherCondition(weatherCode: number): WeatherCondition {
  if (weatherCode === 0) return { label: "Clear", icon: "\u2600\ufe0f" };
  if (weatherCode === 1 || weatherCode === 2) {
    return { label: "Partly cloudy", icon: "\ud83c\udf24\ufe0f" };
  }
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) {
    return { label: "Cloudy", icon: "\u2601\ufe0f" };
  }
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return { label: "Rain/showers", icon: "\ud83c\udf26\ufe0f" };
  }
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return { label: "Snow", icon: "\u2744\ufe0f" };
  }
  if (weatherCode >= 95 && weatherCode <= 99) {
    return { label: "Thunderstorm", icon: "\u26c8\ufe0f" };
  }

  return { label: "Cloudy", icon: "\u2601\ufe0f" };
}

export function getCricketWeatherSummary(maxPrecipitationProbability: number): string {
  if (maxPrecipitationProbability <= 20) return "LOOKING GOOD FOR CRICKET \u2600\ufe0f";
  if (maxPrecipitationProbability <= 50) return "KEEP AN EYE ON THE SKY \ud83c\udf24\ufe0f";
  if (maxPrecipitationProbability <= 70) return "RAIN COULD JOIN THE GAME \ud83c\udf26\ufe0f";

  return "COVERS MIGHT BE NEEDED \ud83c\udf27\ufe0f";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundWeatherValue(value: number): number {
  return Math.round(value);
}

function getWeatherCodeSeverity(weatherCode: number): number {
  if (weatherCode >= 95 && weatherCode <= 99) return 6;
  if (
    (weatherCode >= 71 && weatherCode <= 77) ||
    weatherCode === 85 ||
    weatherCode === 86
  ) {
    return 5;
  }
  if (
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82)
  ) {
    return 4;
  }
  if (weatherCode === 3 || weatherCode === 45 || weatherCode === 48) return 3;
  if (weatherCode === 1 || weatherCode === 2) return 2;
  if (weatherCode === 0) return 1;

  return 3;
}

function getPlayingHour(timeKey: string): { date: string; hour: number } | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):\d{2}/.exec(timeKey);

  if (!match) return null;

  return {
    date: match[1],
    hour: Number(match[2])
  };
}

function choosePlayingHoursWeatherCode(weatherCodes: number[]): number {
  return weatherCodes.reduce((selected, candidate) => {
    const selectedSeverity = getWeatherCodeSeverity(selected);
    const candidateSeverity = getWeatherCodeSeverity(candidate);

    if (candidateSeverity > selectedSeverity) return candidate;
    if (candidateSeverity === selectedSeverity && candidate > selected) return candidate;

    return selected;
  }, weatherCodes[0]);
}

export function buildWeekendWeatherViewModel({
  response,
  weekend
}: {
  response: OpenMeteoHourlyResponse;
  weekend: WeekendWeatherDatePlan;
}): WeekendWeatherViewModel {
  const hourly = response.hourly;

  if (
    !hourly ||
    !isStringArray(hourly.time) ||
    !isArray(hourly.weather_code) ||
    !isArray(hourly.temperature_2m) ||
    !isArray(hourly.precipitation_probability) ||
    !isArray(hourly.wind_speed_10m)
  ) {
    return getUnavailableWeekendWeather(weekend);
  }

  const times = hourly.time;
  const weatherCodes = hourly.weather_code;
  const temperatures = hourly.temperature_2m;
  const precipitationProbabilities = hourly.precipitation_probability;
  const windSpeeds = hourly.wind_speed_10m;
  const dateEntries = [
    { date: weekend.saturday, weekday: "SAT" as const },
    { date: weekend.sunday, weekday: "SUN" as const }
  ];
  const days = dateEntries.flatMap((entry) => {
    const playingHourIndexes = times.flatMap((time, index) => {
      const playingHour = getPlayingHour(time);

      if (
        !playingHour ||
        playingHour.date !== entry.date ||
        !WEEKEND_WEATHER_PLAYING_HOURS.includes(
          playingHour.hour as (typeof WEEKEND_WEATHER_PLAYING_HOURS)[number]
        )
      ) {
        return [];
      }

      const weatherCode = weatherCodes[index];
      const temperature = temperatures[index];
      const precipitationProbability = precipitationProbabilities[index];
      const windSpeed = windSpeeds[index];

      if (
        !isFiniteNumber(weatherCode) ||
        !isFiniteNumber(temperature) ||
        !isFiniteNumber(precipitationProbability) ||
        !isFiniteNumber(windSpeed)
      ) {
        return [];
      }

      return [
        {
          weatherCode,
          temperature,
          precipitationProbability,
          windSpeed
        }
      ];
    });

    if (playingHourIndexes.length === 0) return [];

    const dayWeatherCodes = playingHourIndexes.map((hour) => hour.weatherCode);
    const dayTemperatures = playingHourIndexes.map((hour) => hour.temperature);
    const dayPrecipitationProbabilities = playingHourIndexes.map(
      (hour) => hour.precipitationProbability
    );
    const dayWindSpeeds = playingHourIndexes.map((hour) => hour.windSpeed);
    const weatherCode = choosePlayingHoursWeatherCode(dayWeatherCodes);
    const maxTemperatureC = Math.max(...dayTemperatures);
    const minTemperatureC = Math.min(...dayTemperatures);
    const precipitationProbability = Math.max(...dayPrecipitationProbabilities);
    const maxWindKmh = Math.max(...dayWindSpeeds);

    return [
      {
        date: entry.date,
        weekday: entry.weekday,
        condition: getWeatherCondition(weatherCode),
        maxTemperatureC: roundWeatherValue(maxTemperatureC),
        minTemperatureC: roundWeatherValue(minTemperatureC),
        precipitationProbability: Math.max(0, roundWeatherValue(precipitationProbability)),
        maxWindKmh: Math.max(0, roundWeatherValue(maxWindKmh)),
        isMatchDay: false,
        isPastContext: entry.date < weekend.today
      }
    ];
  });

  if (days.length === 0) return getUnavailableWeekendWeather(weekend);

  const worstRain = Math.max(...days.map((day) => day.precipitationProbability));

  return {
    status: days.length === 2 ? "available" : "partial",
    location: WEEKEND_WEATHER_LOCATION,
    weekend,
    days,
    summary: getCricketWeatherSummary(worstRain),
    message:
      days.length === 2
        ? undefined
        : "FORECAST AVAILABLE CLOSER TO THE WEEKEND"
  };
}

export function getUnavailableWeekendWeather(
  weekend = getUpcomingWeekendDates()
): WeekendWeatherViewModel {
  return {
    status: "unavailable",
    location: WEEKEND_WEATHER_LOCATION,
    weekend,
    days: [],
    summary: "",
    message: "Forecast temporarily unavailable."
  };
}

export function applyWeekendMatchDayMarkers(
  weather: WeekendWeatherViewModel,
  matches: MatchRecord[]
): WeekendWeatherViewModel {
  if (weather.status === "unavailable") return weather;

  const weekendDates = new Set([weather.weekend.saturday, weather.weekend.sunday]);
  const matchDayDates = new Set(
    matches
      .filter(
        (match) =>
          !match.deletedAt &&
          !match.isDemo &&
          !match.isDemoTestMatch &&
          (match.status === "draft" || match.status === "in_progress") &&
          weekendDates.has(match.matchDate)
      )
      .map((match) => match.matchDate)
  );

  return {
    ...weather,
    days: weather.days.map((day) => ({
      ...day,
      isMatchDay: matchDayDates.has(day.date)
    }))
  };
}
