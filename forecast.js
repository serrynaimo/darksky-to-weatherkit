import fetch from 'isomorphic-fetch'
import jwt from 'jsonwebtoken'
import timezones from './timezones.json'
import { find } from 'geo-tz'

export default async function Forecast (req, res) {
  // Check and prepare parameters
  const { lang = 'en' } = req.query
  const route = req.pathname?.split('/') // e.g. '/forecast/lat,lng,time'

  if (!route.length) {
    res.setHeader('Cache-Control', 's-maxage=10')
    res.status(404).json({ detail: 'Not found' })
    return
  }

  const slug = route[route.length - 1] // 'lat,lng,time' 
  const attributes = slug.split(',')

  if (attributes.length < 2) {
    res.setHeader('Cache-Control', 's-maxage=10')
    res.status(400).json({ detail: 'Not enough arguments' })
    return
  }

  try {
     // Get geo timezone
    const [lat, lon, time] = attributes
    const zone = find(lat, lon)?.[0]
    const offset = timezones.find(t => t.utc.includes(zone))?.offset || 0

    // Check time parameter to be valid
    let startDatetime
    if (parseInt(time, 10) >= 1600000000) {
      startDatetime = parseInt(time, 10)
    } else {
      const startDateObj = new Date(time)
      if (isNaN(startDateObj)) {
        res.setHeader('Cache-Control', 's-maxage=10')
        res.status(400).json({ detail: 'Invalid time parameter' })
        return
      }
      startDatetime = Math.floor(startDateObj.getTime() / 1000)
    }

    // Get 24-hour day in local time at location
    const startDateIso = new Date((startDatetime + (offset * 60 * 60)) * 1000).toISOString()
    const startDateString = startDateIso.substring(0, 10) + 'T00:00:00' + (
      offset < 0
        ? (offset > -10 ? '-0' : '-') + Math.abs(Math.ceil(offset)).toString()
        : '+' + (offset < 10 ? '0' : '') + Math.floor(offset).toString()
    ) + ((Math.abs(offset) % 1 * 60) < 10 ? '0' : '') + (Math.abs(offset) % 1 * 60).toString()

    const start = new Date(startDateString)
    const end = new Date(start.getTime() + (24 * 60 * 60 * 1000))

    // Send request to WeatherKit REST endpoint
    const authorization = 'Bearer ' + weatherkitToken()
    const request = `https://weatherkit.apple.com/api/v1/weather/${lang}/${lat}/${lon}?dataSets=forecastHourly&hourlyStart=${start.toISOString()}&hourlyEnd=${end.toISOString()}&timezone=${zone}`

    console.log('WeatherKit request attempt: ', lat, lon, start.toISOString(), end.toISOString(), zone, lang)
    const response = await fetch(request, { headers: { authorization } })
    if (response.ok) {
      const json = await response.json()
      res.setHeader('Cache-Control', 'max-age=0')
      res.json(weatherKitToDarkSkyHourly(json, zone || 'Etc/GMT', offset))
    } else {
      console.error('WeatherKit request failed. Status ', response.status)
      res.setHeader('Cache-Control', 'max-age=0')
      res.status(response.status).end()
    }
  } catch (e) {
    console.error(e)
    res.setHeader('Cache-Control', 's-maxage=10')
    res.status(500).end()
  }
}
// Convert WeatherKit response to DarkSky response format (only hourly)
export function weatherKitToDarkSkyHourly (json, timezone, offset) {
  return {
    latitude: json.forecastHourly.metadata.latitude,
    longitude: json.forecastHourly.metadata.longitude,
    timezone,
    hourly: {
      summary: 'N/A',
      icon: '',
      data: json.forecastHourly.hours.map(h => ({
        time: Math.floor(new Date(h.forecastStart).getTime() / 1000),
        summary: h.conditionCode,
        icon: weatherKitConditionToDarkSkyIcon(h.conditionCode.toLowerCase(), h.daylight),
        daylight: h.daylight,
        temperature: h.temperature,
        humidity: h.humidity,
        pressure: h.pressure,
        pressureTrend: h.pressureTrend,
        precipIntensity: h.precipitationIntensity,
        precipProbability: h.precipitationChance,
        precipType: h.precipitationType,
        apparentTemperature: h.temperatureApparent,
        dewPoint: h.temperatureDewPoint,
        windSpeed: h.windSpeed,
        windGust: h.windGust,
        windBearing: h.windDirection,
        cloudCover: h.cloudCover,
        uvIndex: h.uvIndex,
        visibility: h.visibility,
        snowfallIntensity: h.snowfallIntensity,
        ozone: null
      }))
    },
    flags: {
      sources: [json.forecastHourly.metadata.attributionUrl],
      'nearest-station': 5, // just to have something instead of nothing
      units: json.forecastHourly.metadata.units === 'm' ? 'si' : json.forecastHourly.metadata.units
    },
    offset
  }
}

// Roughly map WeatherKit condition code to DarkSky icon
export function weatherKitConditionToDarkSkyIcon (conditionCode, daylight) {
  if (conditionCode === 'blowingDust') {
    return 'fog'
  } else if (conditionCode === 'clear') {
    return daylight ? 'clear-day' : 'clear-night'
  } else if (conditionCode === 'cloudy') {
    return 'cloudy'
  } else if (conditionCode === 'foggy') {
    return 'fog'
  } else if (conditionCode === 'haze') {
    return 'fog'
  } else if (conditionCode === 'mostlyClear') {
    return daylight ? 'clear-day' : 'clear-night'
  } else if (conditionCode === 'mostlyCloudy') {
    return daylight ? 'partly-cloudy-day' : 'partly-cloudy-night'
  } else if (conditionCode === 'partlyCloudy') {
    return daylight ? 'partly-cloudy-day' : 'partly-cloudy-night'
  } else if (conditionCode === 'smoky') {
    return 'fog'
  } else if (conditionCode === 'breezy') {
    return 'wind'
  } else if (conditionCode === 'windy') {
    return 'wind'
  } else if (conditionCode === 'drizzle') {
    return 'rain'
  } else if (conditionCode === 'heavyRain') {
    return 'thunder-rain'
  } else if (conditionCode === 'isolatedThunderstorms') {
    return daylight ? 'thunder-showers-day' : 'thunder-showers-night'
  } else if (conditionCode === 'rain') {
    return 'rain'
  } else if (conditionCode === 'sunShowers') {
    return daylight ? 'showers-day' : 'showers-night'
  } else if (conditionCode === 'scatteredThunderstorms') {
    return daylight ? 'thunder-showers-day' : 'thunder-showers-night'
  } else if (conditionCode === 'strongStorms') {
    return 'thunder'
  } else if (conditionCode === 'thunderstorms') {
    return 'thunder'
  } else if (conditionCode === 'frigid') {
    return daylight ? 'clear-day' : 'clear-night'
  } else if (conditionCode === 'hail') {
    return 'hail'
  } else if (conditionCode === 'hot') {
    return daylight ? 'clear-day' : 'clear-night'
  } else if (conditionCode === 'flurries') {
    return 'rain-snow'
  } else if (conditionCode === 'sleet') {
    return 'sleet'
  } else if (conditionCode === 'snow') {
    return 'snow'
  } else if (conditionCode === 'sunFlurries') {
    return daylight ? 'showers-day' : 'showers-night'
  } else if (conditionCode === 'wintryMix') {
    return 'rain-snow'
  } else if (conditionCode === 'blizzard') {
    return 'snow'
  } else if (conditionCode === 'blowingSnow') {
    return daylight ? 'snow-showers-day' : 'snow-showers-night'
  } else if (conditionCode === 'freezingDrizzle') {
    return 'rain-snow'
  } else if (conditionCode === 'freezingRain') {
    return daylight ? 'rain-snow-showers-day' : 'rain-snow-showers-night'
  } else if (conditionCode === 'heavySnow') {
    return 'snow'
  } else if (conditionCode === 'hurricane') {
    return 'wind'
  } else if (conditionCode === 'tropicalStorm') {
    return 'wind'
  } else {
    return daylight ? 'clear-day' : 'clear-night'
  }
}

// Generate WeatherKit token valid for a minute
export function weatherkitToken () {
  const key = Buffer.from(process.env.WEATHERKIT_KEY, 'base64').toString() // Note that WeatherKit key must be saved in base64 encoded form in environment variable
  const offset = -2
  const exp = 62
  const now = (Math.floor(new Date().getTime() / 1000 / 60) * 60) + offset
  return jwt.sign({
      iss: process.env.WEATHERKIT_ISS, // 'XXXXXXXXXX',
      iat: now,
      exp: now + exp,
      sub: process.env.WEATHERKIT_SUB // 'com.yourorg.yourapp.weatherkit-client'
    }, key, {
      algorithm: 'ES256',
      header: {
        kid: process.env.WEATHERKIT_KID, // 'YYYYYYYYYY',
        id: `${process.env.WEATHERKIT_ISS}.${process.env.WEATHERKIT_SUB}`
      }
    })
}