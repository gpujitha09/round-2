import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type SeverityBand = "Low" | "Medium" | "High";

export interface SeverityModelInput {
  event_type: string;
  event_cause: string;
  requires_road_closure: boolean;
  veh_type: string;
  zone: string;
  corridor: string;
  latitude: number;
  longitude: number;
  hour: number;
  day_of_week: number;
  month: number;
}

export interface SeverityModelPrediction {
  severity_score: number;
  severity_band: SeverityBand;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultModelDir = path.resolve(packageRoot, "models");
const repoRoot = path.resolve(packageRoot, "..", "..");

function findModelDir(): string {
  const candidates = [defaultModelDir, repoRoot];
  for (const c of candidates) {
    if (
      ["severity_model.pkl", "feature_cols.pkl", "categorical_cols.pkl"].every((fileName) =>
        fs.existsSync(path.resolve(c, fileName)),
      )
    ) {
      return c;
    }
  }
  return defaultModelDir;
}
const modelDir = findModelDir();

const PYTHON_SCRIPT = String.raw`
import json
import os
import pickle
from pathlib import Path

import pandas as pd

model_dir = Path(os.environ["MODEL_DIR"])
input_payload = json.loads(os.environ["MODEL_INPUT"])

model_path = model_dir / "severity_model.pkl"
feature_cols_path = model_dir / "feature_cols.pkl"
categorical_cols_path = model_dir / "categorical_cols.pkl"

with feature_cols_path.open("rb") as handle:
    feature_cols = pickle.load(handle)

with categorical_cols_path.open("rb") as handle:
    categorical_cols = pickle.load(handle)

with model_path.open("rb") as handle:
    model = pickle.load(handle)

row = {column: input_payload.get(column) for column in feature_cols}
frame = pd.DataFrame([row], columns=feature_cols)

for column in categorical_cols:
    if column in frame.columns:
        frame[column] = frame[column].astype("string").fillna("").astype("category")

for column in frame.columns:
    if column not in categorical_cols:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)

prediction = model.predict(frame)
score = 50
band = "Medium"

if hasattr(model, "predict_proba"):
    probabilities = model.predict_proba(frame)
    best_index = int(probabilities[0].argmax())
    score = int(round(float(probabilities[0][best_index]) * 100))

    if hasattr(model, "classes_"):
        predicted_class = model.classes_[best_index]
    else:
        predicted_class = prediction[0]
else:
    predicted_class = prediction[0]

label = str(predicted_class).strip().lower()
if label == "low" or label == "0":
    band = "Low"
elif label == "medium" or label == "1":
    band = "Medium"
elif label == "high" or label == "2":
    band = "High"
else:
    if isinstance(predicted_class, (int, float)):
        if predicted_class <= 0:
            band = "Low"
        elif predicted_class == 1:
            band = "Medium"
        else:
            band = "High"
    else:
        band = "High" if score >= 65 else "Medium" if score >= 35 else "Low"

score = max(0, min(100, score))

print(json.dumps({"severity_score": score, "severity_band": band}))
`;

function resolvePythonCommand(): string | null {
  const candidates = ["python", "python3", "py"];

  for (const command of candidates) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" });
    if (!result.error && result.status === 0) {
      return command;
    }
  }

  return null;
}

export function hasSeverityModelFiles(): boolean {
  return ["severity_model.pkl", "feature_cols.pkl", "categorical_cols.pkl"].every((fileName) =>
    fs.existsSync(path.resolve(modelDir, fileName)),
  );
}

export function predictSeverityWithModel(
  input: SeverityModelInput,
): SeverityModelPrediction | null {
  if (!hasSeverityModelFiles()) {
    return null;
  }

  const pythonCommand = resolvePythonCommand();
  if (!pythonCommand) {
    return null;
  }

  const result = spawnSync(pythonCommand, ["-c", PYTHON_SCRIPT], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      MODEL_DIR: modelDir,
      MODEL_INPUT: JSON.stringify(input),
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0 || result.error) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as SeverityModelPrediction;
    if (
      typeof parsed?.severity_score !== "number" ||
      !["Low", "Medium", "High"].includes(parsed.severity_band)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}