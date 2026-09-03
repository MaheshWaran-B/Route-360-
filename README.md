# Route 360 – Safe Route Planner

**Smart, Safety-Aware Route Planning for India**

Route 360 goes beyond traditional navigation. Instead of simply finding the *shortest* or *fastest* route, it recommends the **safest + optimal** route by combining real-time traffic, weather, accidents, flooding, and road conditions — powered by a machine-learning risk engine.

> Traditional Navigation: Shortest / Fastest Route
>
> **Route 360: Safe + Optimal + Adaptive Route**

---

## 🎯 Problem Statement

Normal navigation apps optimize for the shortest or fastest path. But the fastest route isn't always the **safest**. Accidents, heavy traffic, flooding, severe weather, road construction, animal intrusion, and roadblocks can make a route dangerous.

**Route 360 addresses this by recommending a route based on both travel efficiency AND safety.**

---

## ✨ Features

### Map & Routing
- 🗺️ Interactive Leaflet map (India focus)
- 📍 TomTom geocoding (start + destination)
- 🛣️ OSRM routing — primary + alternative routes
- 🚗 Travel modes: **Car / Bike / Public transport**
- 🎯 Route preferences: **Fastest / Balanced / Safest**

### Real-Time Data
- 🚦 Live traffic flow — route colored green / yellow / red
- 🚧 Construction & diversion speed-limit zones
- 🚨 Live incidents (TomTom Orbis — accidents, diversions)
- 🌦️ Live weather markers along the route (OpenWeatherMap)

### Safety & Intelligence
- 🧠 **Risk Scoring Engine** — weighted multi-factor formula:
  ```
  Risk = 0.25×Traffic + 0.30×Accident + 0.20×Weather + 0.15×Flood + 0.10×RoadCondition
  ```
- 🤖 **ML Risk Prediction** — Random Forest predicts SAFE / MODERATE / HIGH / CRITICAL
- 📊 **Route Optimization** — balances time, distance, and risk based on user preference
- 🔄 **Dynamic Rerouting** — monitors the route and suggests alternatives when risk increases
- 🚨 **Hazard Alerts** — real-time warnings near your route

### Community
- 📝 **User-Reported Incidents** — report accidents, floods, potholes, roadblocks, etc.
- ⭐ **Safe Zones** — hospitals, police, fire stations

---

## 🏗️ Project Structure

```
project/
├── index.html              # Frontend UI
├── style.css               # Frontend styles
├── script.js               # Frontend logic (map, risk, routing)
├── config.js               # API keys (GITIGNORED — never committed)
├── config.example.js       # Template for config.js
│
├── backend/                # Node.js + TypeScript + Express Backend
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example        # Template for .env (gitignored)
│   └── src/
│       ├── app.ts          # Server entry + MongoDB connection
│       ├── routes/         # API route definitions
│       ├── controllers/    # Request handlers
│       ├── services/       # API clients, risk engine, optimizer
│       ├── models/         # Mongoose models (User, Incident, Route)
│       └── middleware/
│
└── ml/                     # Machine Learning
    ├── train.py            # Train Random Forest model
    ├── predict.py          # Load model & predict risk
    ├── dataset/            # Training data (gitignored)
    └── model/              # Trained model (gitignored)
```

---

## 🚀 Getting Started

### Requirements
- Modern web browser
- [Node.js](https://nodejs.org) 18+ (for backend)
- [Python 3](https://www.python.org) + scikit-learn, pandas, numpy (for ML)
- [MongoDB](https://www.mongodb.com) (optional — backend runs in-memory without it)

### API Keys
You need keys to use the live data features:
- **TomTom** — https://developer.tomtom.com
- **OpenWeatherMap** — https://openweathermap.org/api

### Step 1 — Configure API keys
Frontend:
```bash
cp config.example.js config.js
# open config.js and paste your real keys
```

Backend:
```bash
cp backend/.env.example backend/.env
# fill in TOMTOM_API_KEY, OPENWEATHER_API_KEY, MONGODB_URI
```

### Step 2 — Run the frontend
Simply open `index.html` in a browser (works standalone with direct API access).

### Step 3 — Run the backend (optional, enables ML ranking)
```bash
cd backend
npm install
npm run dev        # or: npm run build && npm start
```
The backend runs on `http://localhost:3001`. When it's running, the frontend automatically uses it for ML-powered route ranking. If it's offline, the frontend falls back to direct browser APIs.

### Step 4 — Train the ML model (optional)
```bash
cd ml
pip install -r requirements.txt   # scikit-learn, pandas, numpy
python train.py                    # trains & saves model to ml/model/
```

---

## 🔌 API Reference

| Method | Endpoint              | Description |
|--------|-----------------------|-------------|
| POST   | `/api/routes`         | Plan routes with risk scores + ranking |
| POST   | `/api/routes/alternatives` | Get multiple route options |
| POST   | `/api/routes/reroute` | Dynamic rerouting |
| GET    | `/api/weather`        | Weather at a point |
| POST   | `/api/weather/route`  | Weather along a route |
| GET    | `/api/traffic`        | Traffic flow at a point |
| GET    | `/api/incidents`      | Incidents in a bounding box |
| POST   | `/api/report`         | Report a user incident |
| GET    | `/api/hazards`        | Get user-reported incidents |
| POST   | `/api/ml/predict`     | ML risk prediction |
| GET    | `/api/safe-zones`     | Hospitals / police / fire stations |

### Example — Plan a route
```json
POST /api/routes
{
  "origin": "Salem",
  "destination": "Attur",
  "mode": "bike",
  "priority": "safety"
}
```

---

## 🧠 How the Risk Engine Works

Each road segment gets a risk score from multiple factors:

| Factor | Weight | Source |
|--------|--------|--------|
| Traffic | 0.25 | TomTom flow speed ratio |
| Accident | 0.30 | TomTom incident count/delay |
| Weather | 0.20 | OpenWeatherMap conditions, visibility, wind, rain |
| Flood | 0.15 | Rain + user flood reports |
| Road Condition | 0.10 | User reports (potholes, construction) |

The weighted score (0–1) maps to:
- **0.00–0.24** → SAFE
- **0.25–0.49** → MODERATE
- **0.50–0.74** → HIGH
- **0.75–1.00** → CRITICAL

### Route Optimization
```
Final Score = w_time×Time + w_dist×Distance + w_risk×Risk
```
Preference weights:
- **Fastest**: 0.7×Time + 0.2×Distance + 0.1×Risk
- **Balanced**: 0.4×Time + 0.2×Distance + 0.4×Risk
- **Safest**: 0.1×Time + 0.1×Distance + 0.8×Risk

The route with the lowest final score is recommended.

### ML Model
A **Random Forest classifier** (200 trees) predicts risk level from features:
`traffic_level, weather_risk, accident_count, flood_risk, road_condition_risk, time_of_day, day_of_week, visibility_km, rainfall_mm, wind_speed_ms`

Trained on 8,000 samples → **~88% accuracy**.

---

## 🔒 Security

API keys are **never** committed to the repository:
- `config.js` (frontend) — **gitignored**
- `backend/.env` — **gitignored**
- `ml/model/`, `ml/dataset/` — **gitignored** (large generated files)

Use `config.example.js` and `backend/.env.example` as templates.

> ⚠️ **Important**: If you ever commit real API keys by accident, rotate/revoke them immediately.

---

## 🛣️ Roadmap / Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1–3 | Basic map, multi-route, real-time data | ✅ Done |
| 4 | Rule-based risk engine | ✅ Done |
| 5 | Random Forest ML model | ✅ Done |
| 6 | Route optimization | ✅ Done |
| 7 | Dynamic rerouting | ✅ Done |
| 8 | User-reported incidents | ✅ Done |
| 9 | Backend + database | ✅ Done |

---

## 🧰 Tech Stack

- **Frontend**: HTML, CSS, JavaScript, Leaflet
- **Mapping**: Leaflet, TomTom, OSRM, OpenStreetMap
- **Backend**: Node.js, Express, TypeScript
- **Database**: MongoDB (Mongoose)
- **Machine Learning**: Python, scikit-learn, pandas, numpy
- **APIs**: TomTom, OpenWeatherMap, OSRM

---

## 🤝 Contributing
This project was built for **SIH (Smart India Hackathon)**. Contributions and improvements are welcome.

---

## 📄 License
This project is created for educational/hackathon purposes.
