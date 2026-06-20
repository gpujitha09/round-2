import pickle, os, json
root = os.path.dirname(__file__)
model_path = os.path.join(root, 'severity_model.pkl')
feat_path = os.path.join(root, 'feature_cols.pkl')
cat_path = os.path.join(root, 'categorical_cols.pkl')
with open(feat_path,'rb') as f:
    feature_cols = pickle.load(f)
with open(cat_path,'rb') as f:
    categorical_cols = pickle.load(f)
with open(model_path,'rb') as f:
    try:
        import joblib
        model = joblib.load(f)
    except Exception:
        f.seek(0)
        model = pickle.load(f)

print('model type', type(model))
row = {c: None for c in feature_cols}
# fill some reasonable defaults
row.update({
    'event_type': 'unplanned',
    'event_cause': 'accident',
    'requires_road_closure': True,
    'veh_type': 'private_car',
    'zone': 'Central Zone 1',
    'corridor': 'CBD 1',
    'latitude': 12.9716,
    'longitude': 77.5946,
    'hour': 9,
    'day_of_week': 0,
    'month': 6,
})
import pandas as pd
frame = pd.DataFrame([row], columns=feature_cols)
for col in categorical_cols:
    if col in frame.columns:
        frame[col] = frame[col].astype('string').fillna('').astype('category')
for col in frame.columns:
    if col not in categorical_cols:
        frame[col] = pd.to_numeric(frame[col], errors='coerce').fillna(0)
print('frame\n', frame)
if hasattr(model, 'predict_proba'):
    probs = model.predict_proba(frame)
    print('probs', probs)
    print('pred', model.predict(frame))
else:
    print('pred', model.predict(frame))
