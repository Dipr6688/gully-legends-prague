import { unstable_cache } from "next/cache";
import {
  WEEKEND_WEATHER_HOURLY_FIELDS,
  WEEKEND_WEATHER_LOCATION,
  WEEKEND_WEATHER_REVALIDATE_SECONDS,
  buildWeekendWeatherViewModel,
  getUnavailableWeekendWeather,
  getUpcomingWeekendDates,
  type OpenMeteoHourlyResponse,
  type WeekendWeatherViewModel
} from "./weekend-weather";

function buildOpenMeteoForecastUrl(startDate: string, endDate: string): string {
  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", String(WEEKEND_WEATHER_LOCATION.latitude));
  url.searchParams.set("longitude", String(WEEKEND_WEATHER_LOCATION.longitude));
  url.searchParams.set("timezone", WEEKEND_WEATHER_LOCATION.timezone);
  url.searchParams.set("hourly", WEEKEND_WEATHER_HOURLY_FIELDS.join(","));
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);

  return url.toString();
}

const fetchCachedOpenMeteoWeekend = unstable_cache(
  async (startDate: string, endDate: string): Promise<OpenMeteoHourlyResponse> => {
    const response = await fetch(buildOpenMeteoForecastUrl(startDate, endDate), {
      next: { revalidate: WEEKEND_WEATHER_REVALIDATE_SECONDS }
    } as RequestInit & { next: { revalidate: number } });

    if (!response.ok) {
      throw new Error(`Open-Meteo forecast failed with ${response.status}`);
    }

    return response.json() as Promise<OpenMeteoHourlyResponse>;
  },
  ["czu-gully-arena-weekend-playing-hours-weather"],
  { revalidate: WEEKEND_WEATHER_REVALIDATE_SECONDS }
);

export async function getWeekendWeatherViewModel(
  now = new Date()
): Promise<WeekendWeatherViewModel> {
  const weekend = getUpcomingWeekendDates(now);

  try {
    const response = await fetchCachedOpenMeteoWeekend(
      weekend.saturday,
      weekend.sunday
    );

    return buildWeekendWeatherViewModel({ response, weekend });
  } catch (error) {
    console.error("Weekend weather forecast unavailable", error);

    return getUnavailableWeekendWeather(weekend);
  }
}
