# DarkSky Hourly to Apple WeatherKit Request

JavaScript (Next.js API style) request handler adapter function to make a DarkSky style hourly request to Apple WeatherKit and return a compatible response.
Currently only support hourly data requests.

See comments in `forecast.js` for more information

### Environment variables required

```
WEATHERKIT_KEY=[Base64 encoded WeatherKit key]
WEATHERKIT_ISS=XXXXXXXXXX
WEATHERKIT_KID=YYYYYYYYYY
WEATHERKIT_SUB=com.yourorg.yourapp.weatherkit-client
```
