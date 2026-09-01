import type { MatchRecord } from "./types/match";

export const WEEKEND_WEATHER_LOCATION = {
  latitude: 50.129976,
  longitude: 14.373707,
  timezone: "Europe/Prague",
  venue: "\u010cZU Gully Arena",
  area: "Prague-Suchdol"
} as const;

export const WEEKEND_WEATHER_REVALIDATE_SECONDS = 60 * 60 * 2;

export const WEEKEND_WEATHER_DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "wind_speed_10m_max"
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

export type OpenMeteoDailyResponse = {
  daily?: {
    time?: unknown;
    weather_code?: unknown;
    temperature_2m_max?: unknown;
    temperature_2m_min?: unknown;
    precipitation_probability_max?: unknown;
    wind_speed_10m_max?: unknown;
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

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function roundWeatherValue(value: number): number {
  return Math.round(value);
}

export function buildWeekendWeatherViewModel({
  response,
  weekend
}: {
  response: OpenMeteoDailyResponse;
  weekend: WeekendWeatherDatePlan;
}): WeekendWeatherViewModel {
  const daily = response.daily;

  if (
    !daily ||
    !isStringArray(daily.time) ||
    !isNumberArray(daily.weather_code) ||
    !isNumberArray(daily.temperature_2m_max) ||
    !isNumberArray(daily.temperature_2m_min) ||
    !isNumberArray(daily.precipitation_probability_max) ||
    !isNumberArray(daily.wind_speed_10m_max)
  ) {
    return getUnavailableWeekendWeather(weekend);
  }

  const times = daily.time;
  const weatherCodes = daily.weather_code;
  const maxTemperatures = daily.temperature_2m_max;
  const minTemperatures = daily.temperature_2m_min;
  const precipitationProbabilities = daily.precipitation_probability_max;
  const maxWindSpeeds = daily.wind_speed_10m_max;
  const dateEntries = [
    { date: weekend.saturday, weekday: "SAT" as const },
    { date: weekend.sunday, weekday: "SUN" as const }
  ];
  const days = dateEntries.flatMap((entry) => {
    const index = times.indexOf(entry.date);

    if (index < 0) return [];

    const weatherCode = weatherCodes[index];
    const maxTemperatureC = maxTemperatures[index];
    const minTemperatureC = minTemperatures[index];
    const precipitationProbability = precipitationProbabilities[index];
    const maxWindKmh = maxWindSpeeds[index];

    if (
      !Number.isFinite(weatherCode) ||
      !Number.isFinite(maxTemperatureC) ||
      !Number.isFinite(minTemperatureC) ||
      !Number.isFinite(precipitationProbability) ||
      !Number.isFinite(maxWindKmh)
    ) {
      return [];
    }

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
