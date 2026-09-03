"""
Route 360 – ML Prediction Script
Loads trained model and predicts risk from feature dict passed as CLI arg.
Outputs JSON to stdout.
"""

import sys
import json
import pickle
import os

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No input features provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(base_dir, "model", "risk_model.pkl")
    encoder_path = os.path.join(base_dir, "model", "label_encoder.pkl")
    features_path = os.path.join(base_dir, "model", "features.json")

    # Check if model exists
    if not os.path.exists(model_path):
        print(json.dumps({"error": "Model not found. Run train.py first."}))
        sys.exit(1)

    with open(model_path, "rb") as f:
        model = pickle.load(f)
    with open(encoder_path, "rb") as f:
        le = pickle.load(f)
    with open(features_path, "r") as f:
        features = json.load(f)

    import numpy as np

    X = np.array([[input_data.get(f, 0) for f in features]])
    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]

    label = le.inverse_transform([prediction])[0]
    prob_dict = {
        le.classes_[i]: round(float(probabilities[i]), 4)
        for i in range(len(le.classes_))
    }

    result = {
        "risk_level": label,
        "confidence": round(float(max(probabilities)), 4),
        "probabilities": prob_dict,
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
