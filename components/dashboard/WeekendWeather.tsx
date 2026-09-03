import {
  WEEKEND_WEATHER_PLAYING_HOURS_LABEL,
  type WeekendWeatherViewModel
} from "@/lib/weekend-weather";

function formatWeatherDate(dateKey: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  })
    .format(new Date(`${dateKey}T12:00:00.000Z`))
    .toUpperCase();
}

export function WeekendWeather({
  weather
}: {
  weather: WeekendWeatherViewModel;
}) {
  return (
    <section className="weekend-weather-card" aria-label="Weekend weather">
      <div className="weekend-weather-header">
        <span>WEEKEND WEATHER</span>
      </div>

      {weather.status === "unavailable" ? (
        <p className="weekend-weather-fallback">{weather.message}</p>
      ) : (
        <>
          <div className="weekend-weather-days">
            {weather.days.map((day) => (
              <article key={day.date} className="weekend-weather-day">
                <div className="weekend-weather-day-title">
                  <span>
                    {day.weekday} · {formatWeatherDate(day.date)}
                  </span>
                  {day.isMatchDay ? <b>MATCH DAY 🏏</b> : null}
                  {day.isPastContext ? <em>CURRENT WEEKEND</em> : null}
                </div>
                <div className="weekend-weather-condition">
                  <span aria-hidden="true">{day.condition.icon}</span>
                  <strong>{day.condition.label}</strong>
                </div>
                <span className="weekend-weather-playing-hours">
                  PLAYING HOURS {WEEKEND_WEATHER_PLAYING_HOURS_LABEL}
                </span>
                <div className="weekend-weather-values">
                  <span>
                    {day.maxTemperatureC}° / {day.minTemperatureC}°
                  </span>
                  <span>RAIN {day.precipitationProbability}%</span>
                  <span>WIND {day.maxWindKmh} KM/H</span>
                </div>
              </article>
            ))}
          </div>
          {weather.message ? (
            <p className="weekend-weather-fallback">{weather.message}</p>
          ) : null}
          <p className="weekend-weather-summary">{weather.summary}</p>
        </>
      )}
    </section>
  );
}
