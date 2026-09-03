"""
Route 360 – ML Risk Prediction Model
Trains a Random Forest classifier to predict road/route risk levels.

Features:
- traffic_level (0-1 normalized congestion ratio)
- weather_risk (0-1 from weather conditions)
- accident_count (number of incidents near segment)
- flood_risk (0-1)
- road_condition_risk (0-1)
- time_of_day (0-23)
- day_of_week (0-6)
- visibility_km (km)
- rainfall_mm (mm)
- wind_speed_ms (m/s)

Output labels: SAFE, MODERATE, HIGH, CRITICAL
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.preprocessing import LabelEncoder
import pickle

# ====================================================================
# 1) GENERATE SYNTHETIC TRAINING DATA
# ====================================================================
# In production, replace this with real historical data.

def generate_synthetic_data(n_samples=5000):
    np.random.seed(42)
    data = []

    for _ in range(n_samples):
        traffic_level = np.random.uniform(0, 1)
        weather_risk = np.random.uniform(0, 1)
        accident_count = np.random.poisson(lam=1.5)
        flood_risk = np.random.uniform(0, 1)
        road_condition_risk = np.random.uniform(0, 1)
        time_of_day = np.random.randint(0, 24)
        day_of_week = np.random.randint(0, 7)
        visibility_km = np.random.uniform(0.1, 15)
        rainfall_mm = np.random.uniform(0, 50)
        wind_speed_ms = np.random.uniform(0, 20)

        # Weighted risk score (same formula as the JS risk engine)
        risk_score = (
            0.25 * traffic_level +
            0.30 * min(1.0, accident_count / 5.0) +
            0.20 * weather_risk +
            0.15 * flood_risk +
            0.10 * road_condition_risk
        )

        # Apply modifiers
        if visibility_km < 1.0:
            risk_score = min(1.0, risk_score + 0.15)
        if rainfall_mm > 20:
            risk_score = min(1.0, risk_score + 0.1)
        if time_of_day >= 22 or time_of_day <= 5:
            risk_score = min(1.0, risk_score + 0.05)

        # Classify
        if risk_score < 0.25:
            label = "SAFE"
        elif risk_score < 0.50:
            label = "MODERATE"
        elif risk_score < 0.75:
            label = "HIGH"
        else:
            label = "CRITICAL"

        data.append({
            "traffic_level": round(traffic_level, 4),
            "weather_risk": round(weather_risk, 4),
            "accident_count": accident_count,
            "flood_risk": round(flood_risk, 4),
            "road_condition_risk": round(road_condition_risk, 4),
            "time_of_day": time_of_day,
            "day_of_week": day_of_week,
            "visibility_km": round(visibility_km, 2),
            "rainfall_mm": round(rainfall_mm, 2),
            "wind_speed_ms": round(wind_speed_ms, 2),
            "risk_label": label,
        })

    return pd.DataFrame(data)


# ====================================================================
# 2) TRAIN MODEL
# ====================================================================

def train_model():
    print("Generating synthetic training data...")
    df = generate_synthetic_data(n_samples=8000)

    # Save dataset
    os.makedirs("dataset", exist_ok=True)
    df.to_csv("dataset/training_data.csv", index=False)
    print(f"Dataset saved: {len(df)} samples")

    feature_cols = [
        "traffic_level", "weather_risk", "accident_count",
        "flood_risk", "road_condition_risk", "time_of_day",
        "day_of_week", "visibility_km", "rainfall_mm", "wind_speed_ms",
    ]

    X = df[feature_cols].values
    y = df["risk_label"].values

    # Encode labels
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )

    print(f"Training set: {len(X_train)} samples")
    print(f"Test set:     {len(X_test)} samples")

    # Train Random Forest
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=15,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1,
    )

    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    print("\n=== Classification Report ===")
    print(classification_report(y_test, y_pred, target_names=le.classes_))

    print("=== Confusion Matrix ===")
    print(confusion_matrix(y_test, y_pred))

    # Feature importance
    importances = model.feature_importances_
    print("\n=== Feature Importances ===")
    for col, imp in sorted(zip(feature_cols, importances), key=lambda x: -x[1]):
        print(f"  {col:25s}: {imp:.4f}")

    # Save model and encoder
    os.makedirs("model", exist_ok=True)
    with open("model/risk_model.pkl", "wb") as f:
        pickle.dump(model, f)
    with open("model/label_encoder.pkl", "wb") as f:
        pickle.dump(le, f)

    # Save feature names
    with open("model/features.json", "w") as f:
        json.dump(feature_cols, f)

    print("\nModel saved to model/risk_model.pkl")
    print("Encoder saved to model/label_encoder.pkl")
    print("Features saved to model/features.json")

    return model, le, feature_cols


# ====================================================================
# 3) PREDICTION FUNCTION (used by backend)
# ====================================================================

def predict_risk(model, le, features, input_data):
    """
    Predict risk level for a set of road conditions.

    input_data: dict with keys matching feature_cols
    Returns: dict with label and probability scores
    """
    X = np.array([[input_data.get(f, 0) for f in features]])
    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]

    label = le.inverse_transform([prediction])[0]
    prob_dict = {le.classes_[i]: round(float(probabilities[i]), 4) for i in range(len(le.classes_))}

    return {
        "risk_level": label,
        "confidence": round(float(max(probabilities)), 4),
        "probabilities": prob_dict,
    }


# ====================================================================
# MAIN
# ====================================================================

if __name__ == "__main__":
    model, le, features = train_model()
    print("\nTraining complete.")
