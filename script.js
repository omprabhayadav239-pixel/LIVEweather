const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

localStorage.removeItem("atmos.openweathermap-api-key");

const searchForm = document.querySelector("#search-form");
const cityInput = document.querySelector("#city-input");
const stateSelect = document.querySelector("#state-select");
const citySuggestions = document.querySelector("#city-suggestions");
const searchButton = document.querySelector("#search-button");
const statusMessage = document.querySelector("#status-message");
const statusText = document.querySelector(".status-text");
const weatherContent = document.querySelector("#weather-content");
const welcomeCard = document.querySelector("#welcome-card");
const forecastGrid = document.querySelector("#forecast-grid");

let selectedLocation = null;
let suggestionLocations = [];
let activeSuggestionIndex = -1;
let suggestionTimer;
let suggestionRequest = 0;

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = cityInput.value.trim();
  if (!query) {
    showStatus("Enter a city name to search.", "error");
    cityInput.focus();
    return;
  }

  if (selectedLocation && cityInput.value.trim() === selectedLocation.label) {
    await loadWeather(selectedLocation);
    return;
  }

  setLoading(true, `Looking up ${query} in India...`);
  try {
    const locations = await searchIndianLocations(query, stateSelect.value);
    if (locations.length === 0) {
      showStatus(`No Indian city found for "${query}". Try a nearby city or a different spelling.`, "error");
    } else if (locations.length > 1) {
      renderSuggestions(locations);
      showStatus("Choose the matching city and state from the results.", "error");
      cityInput.focus();
    } else {
      await loadWeather(locations[0]);
    }
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
});

cityInput.addEventListener("input", () => {
  selectedLocation = null;
  window.clearTimeout(suggestionTimer);
  const query = cityInput.value.trim();
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  suggestionTimer = window.setTimeout(() => loadSuggestions(query), 350);
});

stateSelect.addEventListener("change", () => {
  selectedLocation = null;
  const query = cityInput.value.trim();
  if (query.length >= 2) {
    window.clearTimeout(suggestionTimer);
    suggestionTimer = window.setTimeout(() => loadSuggestions(query), 150);
  } else {
    hideSuggestions();
  }
});

cityInput.addEventListener("keydown", (event) => {
  if (citySuggestions.hidden || suggestionLocations.length === 0) {
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestionIndex = (activeSuggestionIndex + direction + suggestionLocations.length) % suggestionLocations.length;
    updateActiveSuggestion();
  } else if (event.key === "Escape") {
    hideSuggestions();
  } else if (event.key === "Enter" && activeSuggestionIndex >= 0) {
    event.preventDefault();
    chooseLocation(suggestionLocations[activeSuggestionIndex]);
  }
});

document.addEventListener("click", (event) => {
  if (!searchForm.contains(event.target)) {
    hideSuggestions();
  }
});

async function loadSuggestions(query) {
  const requestId = ++suggestionRequest;
  try {
    const locations = await searchIndianLocations(query, stateSelect.value);
    if (requestId !== suggestionRequest || cityInput.value.trim() !== query) {
      return;
    }
    if (locations.length) {
      renderSuggestions(locations);
    } else {
      renderSuggestionMessage("No matching Indian cities found.");
    }
  } catch (error) {
    if (requestId === suggestionRequest && cityInput.value.trim() === query) {
      hideSuggestions();
      showStatus(error.message, "error");
    }
  }
}

async function searchIndianLocations(query, state = "") {
  const url = new URL(GEOCODING_URL);
  url.search = new URLSearchParams({
    name: query,
    count: "100",
    language: "en",
    format: "json"
  });
  const data = await fetchJson(url);
  if (data.results !== undefined && !Array.isArray(data.results)) {
    throw new Error("The location service returned an unexpected response. Please try again.");
  }

  const normalizedQuery = normalizePlaceName(query);
  const locations = (data.results || [])
    .filter((location) =>
      location.country_code === "IN" &&
      Number.isFinite(location.latitude) &&
      Number.isFinite(location.longitude) &&
      (!state || normalizePlaceName(location.admin1 || "") === normalizePlaceName(state)) &&
      [location.name, location.admin1].some((value) =>
        normalizePlaceName(value || "").includes(normalizedQuery) ||
        normalizedQuery.includes(normalizePlaceName(value || ""))
      )
    )
    .map((location) => ({
      name: location.name,
      state: location.admin1 || "",
      country: "India",
      lat: location.latitude,
      lon: location.longitude,
      population: Number.isFinite(location.population) ? location.population : 0,
      label: [location.name, location.admin1, "India"].filter(Boolean).join(", ")
    }))
    .sort((first, second) => {
      const firstExact = normalizePlaceName(first.name) === normalizedQuery ? 0 : 1;
      const secondExact = normalizePlaceName(second.name) === normalizedQuery ? 0 : 1;
      return firstExact - secondExact ||
        second.population - first.population ||
        first.name.localeCompare(second.name);
    });

  const uniqueLocations = new Map();
  for (const location of locations) {
    const cityKey = normalizePlaceName(location.name);
    if (!uniqueLocations.has(cityKey)) {
      uniqueLocations.set(cityKey, location);
    }
  }
  return [...uniqueLocations.values()];
}

function normalizePlaceName(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function renderSuggestions(locations) {
  suggestionLocations = locations;
  activeSuggestionIndex = -1;
  citySuggestions.replaceChildren(...locations.map((location, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "city-suggestion";
    option.id = `city-suggestion-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");

    const name = document.createElement("span");
    name.className = "city-suggestion-name";
    name.textContent = location.name;
    const state = document.createElement("span");
    state.className = "city-suggestion-state";
    state.textContent = [location.state, "India"].filter(Boolean).join(", ");
    option.append(name, state);
    option.addEventListener("click", () => chooseLocation(location));
    return option;
  }));
  citySuggestions.hidden = false;
  cityInput.setAttribute("aria-expanded", "true");
}

function renderSuggestionMessage(message) {
  suggestionLocations = [];
  activeSuggestionIndex = -1;
  const item = document.createElement("div");
  item.className = "suggestion-message";
  item.textContent = message;
  citySuggestions.replaceChildren(item);
  citySuggestions.hidden = false;
  cityInput.setAttribute("aria-expanded", "true");
}

function updateActiveSuggestion() {
  const options = citySuggestions.querySelectorAll('[role="option"]');
  options.forEach((option, index) => {
    option.setAttribute("aria-selected", String(index === activeSuggestionIndex));
  });
  cityInput.setAttribute("aria-activedescendant", `city-suggestion-${activeSuggestionIndex}`);
}

function chooseLocation(location) {
  selectedLocation = location;
  cityInput.value = location.label;
  hideSuggestions();
  hideStatus();
  cityInput.focus();
}

function hideSuggestions() {
  suggestionRequest += 1;
  suggestionLocations = [];
  activeSuggestionIndex = -1;
  citySuggestions.hidden = true;
  citySuggestions.replaceChildren();
  cityInput.setAttribute("aria-expanded", "false");
  cityInput.removeAttribute("aria-activedescendant");
}

async function loadWeather(location) {
  setLoading(true, `Finding the forecast for ${location.label}...`);
  hideSuggestions();
  try {
    const url = new URL(FORECAST_URL);
    url.search = new URLSearchParams({
      latitude: String(location.lat),
      longitude: String(location.lon),
      current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min",
      temperature_unit: "celsius",
      wind_speed_unit: "ms",
      forecast_days: "5",
      timezone: "auto"
    });
    const forecast = await fetchJson(url);
    renderCurrentWeather(forecast.current, location);
    renderForecast(forecast.daily);
    weatherContent.hidden = false;
    welcomeCard.hidden = true;
    hideStatus();
  } catch (error) {
    showStatus(error.message, "error");
  } finally {
    setLoading(false);
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(url, {signal: controller.signal});
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The weather service took too long to respond. Please try again.");
    }
    throw new Error("Unable to reach the weather service. Check your connection and try again.");
  } finally {
    window.clearTimeout(timeout);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The weather service returned an unreadable response. Please try again.");
  }
  if (!response.ok) {
    const detail = typeof data.reason === "string" ? ` ${data.reason}` : "";
    throw new Error(`Weather or location data is unavailable right now.${detail}`);
  }
  return data;
}

function renderCurrentWeather(current, location) {
  const condition = describeWeather(current.weather_code);
  document.querySelector("#city-name").textContent = [location.name, location.state, location.country].filter(Boolean).join(", ");
  document.querySelector("#current-date").textContent = formatCityDate(current.time);
  document.querySelector("#temperature").textContent = Math.round(current.temperature_2m);
  document.querySelector("#condition").textContent = condition.description;
  document.querySelector("#humidity").textContent = current.relative_humidity_2m;
  document.querySelector("#wind-speed").textContent = formatNumber(current.wind_speed_10m);
  document.querySelector("#feels-like").textContent = Math.round(current.apparent_temperature);

  const icon = document.querySelector("#current-icon");
  icon.textContent = condition.icon;
  icon.setAttribute("aria-label", condition.description);
  icon.title = condition.description;
}

function renderForecast(daily) {
  if (!daily || !Array.isArray(daily.time) || daily.time.length < 5) {
    throw new Error("The forecast service returned incomplete data. Please try again.");
  }

  forecastGrid.replaceChildren(...daily.time.slice(0, 5).map((date, index) => {
    const condition = describeWeather(daily.weather_code[index]);
    const card = document.createElement("article");
    card.className = "forecast-card";

    const day = document.createElement("p");
    day.className = "forecast-day";
    day.textContent = index === 0 ? "Today" : formatDay(date);
    const icon = document.createElement("span");
    icon.className = "forecast-icon";
    icon.setAttribute("aria-label", condition.description);
    icon.title = condition.description;
    icon.textContent = condition.icon;
    const summary = document.createElement("p");
    summary.className = "forecast-condition";
    summary.textContent = condition.description;
    const temperatures = document.createElement("div");
    temperatures.className = "forecast-temps";
    temperatures.innerHTML = `<span>${Math.round(daily.temperature_2m_max[index])}°</span><span class="low">${Math.round(daily.temperature_2m_min[index])}°</span>`;

    card.append(day, icon, summary, temperatures);
    return card;
  }));
}

function describeWeather(code) {
  if (code === 0) return {description: "Clear sky", icon: "☀️"};
  if (code === 1) return {description: "Mainly clear", icon: "🌤️"};
  if (code === 2) return {description: "Partly cloudy", icon: "⛅"};
  if (code === 3) return {description: "Overcast", icon: "☁️"};
  if (code === 45 || code === 48) return {description: "Fog", icon: "🌫️"};
  if ([51, 53, 55, 56, 57].includes(code)) return {description: "Drizzle", icon: "🌦️"};
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return {description: "Rain", icon: "🌧️"};
  if ([71, 73, 75, 77, 85, 86].includes(code)) return {description: "Snow", icon: "❄️"};
  if ([95, 96, 99].includes(code)) return {description: "Thunderstorm", icon: "⛈️"};
  return {description: "Current conditions", icon: "🌤️"};
}

function setLoading(isLoading, message = "") {
  searchButton.disabled = isLoading;
  cityInput.disabled = isLoading;
  searchButton.querySelector("span:first-child").textContent = isLoading ? "Loading" : "Search";
  statusMessage.classList.toggle("loading", isLoading);
  if (isLoading) {
    statusMessage.classList.add("visible");
    statusMessage.classList.remove("error");
    statusText.textContent = message;
  }
}

function showStatus(message, type = "") {
  statusMessage.classList.remove("loading");
  statusMessage.classList.add("visible");
  statusMessage.classList.toggle("error", type === "error");
  statusText.textContent = message;
}

function hideStatus() {
  statusMessage.classList.remove("visible", "loading", "error");
  statusText.textContent = "";
}

function formatCityDate(value) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function formatDay(value) {
  const date = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("en", {weekday: "short", timeZone: "UTC"}).format(date);
}

function formatNumber(number) {
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}
