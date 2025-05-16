import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import axios from "axios";

// Get the API key from environment variables
console.log("WeatherAPI Key exists:", !!process.env.WEATHERAPI_KEY);
const WEATHERAPI_KEY = process.env.WEATHERAPI_KEY;
const WEATHERAPI_BASE_URL = "https://api.weatherapi.com/v1";

// Helper function to properly capitalize city names
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Cities for the "Forecast in Other Cities" section - customize with your favorites
const FAVORITE_CITIES = [
  { name: "San Francisco", country: "US" },
  { name: "Tokyo", country: "JP" },
  { name: "London", country: "GB" },
  { name: "Sydney", country: "AU" },
  { name: "Toronto", country: "CA" }
];

// Helper function to convert WeatherAPI data to our app's format
const mapWeatherCondition = (condition: any) => ({
  id: condition.code,
  main: condition.text.split(" ")[0],  // Using first word as 'main'
  description: condition.text.toLowerCase(),
  icon: condition.icon
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Get weather for a city
  app.get("/api/weather", async (req: Request, res: Response) => {
    try {
      const city = req.query.city as string;
      const units = req.query.units as string || "imperial";
      
      if (!city) {
        return res.status(400).json({ message: "City parameter is required" });
      }
      
      // Get current weather and forecast in one call
      const response = await axios.get(`${WEATHERAPI_BASE_URL}/forecast.json`, {
        params: {
          key: WEATHERAPI_KEY || "",
          q: city,
          days: 7,
          aqi: "yes",
          alerts: "no"
        }
      });
      
      if (!response.data) {
        return res.status(404).json({ message: "City or weather data not found" });
      }
      
      // Apply proper capitalization to the city name from the API response
      const capitalizedCityName = toTitleCase(response.data.location.name);
      
      // Map the WeatherAPI data to our app's expected format
      const currentWeather = {
        coord: {
          lon: response.data.location.lon,
          lat: response.data.location.lat
        },
        weather: [mapWeatherCondition(response.data.current.condition)],
        base: "stations",
        main: {
          temp: units === "imperial" ? response.data.current.temp_f : response.data.current.temp_c,
          feels_like: units === "imperial" ? response.data.current.feelslike_f : response.data.current.feelslike_c,
          temp_min: units === "imperial" ? 
            response.data.forecast.forecastday[0].day.mintemp_f : 
            response.data.forecast.forecastday[0].day.mintemp_c,
          temp_max: units === "imperial" ? 
            response.data.forecast.forecastday[0].day.maxtemp_f : 
            response.data.forecast.forecastday[0].day.maxtemp_c,
          pressure: response.data.current.pressure_mb,
          humidity: response.data.current.humidity
        },
        visibility: response.data.current.vis_km * 1000, // convert to meters
        wind: {
          speed: units === "imperial" ? response.data.current.wind_mph : response.data.current.wind_kph,
          deg: response.data.current.wind_degree
        },
        clouds: {
          all: response.data.current.cloud
        },
        dt: new Date(response.data.current.last_updated_epoch * 1000).getTime() / 1000,
        sys: {
          type: 1,
          id: 5141,
          country: response.data.location.country,
          sunrise: new Date(response.data.forecast.forecastday[0].astro.sunrise).getTime() / 1000,
          sunset: new Date(response.data.forecast.forecastday[0].astro.sunset).getTime() / 1000
        },
        timezone: response.data.location.localtime_epoch - new Date().getTime() / 1000,
        id: 1,
        name: capitalizedCityName,
        cod: 200
      };
      
      // Map the forecast data
      const dailyForecasts = response.data.forecast.forecastday.map((day: any) => ({
        dt: new Date(day.date).getTime() / 1000,
        sunrise: new Date(day.astro.sunrise).getTime() / 1000,
        sunset: new Date(day.astro.sunset).getTime() / 1000,
        moonrise: new Date(day.astro.moonrise).getTime() / 1000,
        moonset: new Date(day.astro.moonset).getTime() / 1000,
        moon_phase: 0, // Not provided by WeatherAPI
        temp: {
          day: units === "imperial" ? day.day.avgtemp_f : day.day.avgtemp_c,
          min: units === "imperial" ? day.day.mintemp_f : day.day.mintemp_c,
          max: units === "imperial" ? day.day.maxtemp_f : day.day.maxtemp_c,
          night: units === "imperial" ? 
            (day.day.avgtemp_f - 10) : (day.day.avgtemp_c - 5), // Approximation
          eve: units === "imperial" ? 
            (day.day.avgtemp_f - 5) : (day.day.avgtemp_c - 2), // Approximation
          morn: units === "imperial" ? 
            (day.day.avgtemp_f - 2) : (day.day.avgtemp_c - 1) // Approximation
        },
        feels_like: {
          day: units === "imperial" ? day.day.avgtemp_f : day.day.avgtemp_c,
          night: units === "imperial" ? 
            (day.day.avgtemp_f - 12) : (day.day.avgtemp_c - 6), // Approximation
          eve: units === "imperial" ? 
            (day.day.avgtemp_f - 7) : (day.day.avgtemp_c - 3), // Approximation
          morn: units === "imperial" ? 
            (day.day.avgtemp_f - 4) : (day.day.avgtemp_c - 2) // Approximation
        },
        pressure: day.day.avgvis_km * 10, // Approximation
        humidity: day.day.avghumidity,
        dew_point: 0, // Not provided
        wind_speed: units === "imperial" ? day.day.maxwind_mph : day.day.maxwind_kph,
        wind_deg: 0, // Not provided
        weather: [mapWeatherCondition(day.day.condition)],
        clouds: day.day.cloud || 0,
        pop: day.day.daily_chance_of_rain / 100,
        uvi: day.day.uv
      }));
      
      // Combine data in the format our frontend expects
      const combinedData = {
        lat: response.data.location.lat,
        lon: response.data.location.lon,
        timezone: response.data.location.tz_id,
        timezone_offset: response.data.location.localtime_epoch - new Date().getTime() / 1000,
        current: {
          ...currentWeather,
          name: capitalizedCityName  // Ensure this is set correctly
        },
        daily: dailyForecasts
      };
      
      res.json(combinedData);
    } catch (error) {
      console.error("Weather API error:", error);
      if (axios.isAxiosError(error)) {
        res.status(error.response?.status || 500).json({ 
          message: error.response?.data?.message || "Error fetching weather data" 
        });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  // Get weather for popular cities
  app.get("/api/other-cities", async (req: Request, res: Response) => {
    try {
      const units = req.query.units as string || "imperial";
      const cityWeatherPromises = FAVORITE_CITIES.map(async (city) => {
        try {
          const response = await axios.get(`${WEATHERAPI_BASE_URL}/current.json`, {
            params: {
              key: WEATHERAPI_KEY,
              q: `${city.name},${city.country}`
            }
          });
          
          return {
            name: city.name,
            country: city.country,
            temp: units === "imperial" ? response.data.current.temp_f : response.data.current.temp_c,
            weather: [mapWeatherCondition(response.data.current.condition)]
          };
        } catch (cityError) {
          console.error(`Error fetching data for ${city.name}:`, cityError);
          // Return a placeholder for this city so we don't break the whole response
          return {
            name: city.name,
            country: city.country,
            temp: 0,
            weather: [{ 
              id: 800, 
              main: "Clear", 
              description: "unknown", 
              icon: "" 
            }]
          };
        }
      });
      
      const citiesData = await Promise.all(cityWeatherPromises);
      res.json(citiesData);
    } catch (error) {
      console.error("Other cities API error:", error);
      if (axios.isAxiosError(error)) {
        res.status(error.response?.status || 500).json({ 
          message: error.response?.data?.message || "Error fetching other cities data" 
        });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
