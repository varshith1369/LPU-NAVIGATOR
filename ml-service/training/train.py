"""Opt-in training on real, aggregated observations. Does not manufacture a dataset."""
import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

REQUIRED = {'location_id', 'observed_at', 'event', 'crowd_level', 'source', 'consent_basis'}
LABELS = {'LOW', 'MEDIUM', 'HIGH'}

def check_data(path):
    with open(path, newline='', encoding='utf-8-sig') as file:
        reader = csv.DictReader(file)
        if not REQUIRED.issubset(reader.fieldnames or []):
            raise ValueError('Missing required observation fields.')
        rows = list(reader)
    if len(rows) < 500:
        raise ValueError('Training disabled: at least 500 real observations are required for this pilot gate.')
    dates = set()
    seen = set()
    for row in rows:
        stamp = datetime.fromisoformat(row['observed_at'].replace('Z', '+00:00'))
        if stamp.tzinfo is None:
            raise ValueError('Observation timestamps must include a timezone.')
        dates.add(stamp.date())
        key = (row['location_id'], stamp.isoformat())
        if key in seen:
            raise ValueError('Duplicate location/timestamp observation.')
        seen.add(key)
        if row['crowd_level'] not in LABELS or not row['source'].strip() or not row['consent_basis'].strip():
            raise ValueError('Labels, provenance and collection basis must be valid.')
    if len(dates) < 30:
        raise ValueError('At least 30 observation days are required.')
    return sorted(rows, key=lambda row: datetime.fromisoformat(row['observed_at'].replace('Z', '+00:00')))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv_path')
    parser.add_argument('--output', default='ml-service/models')
    args = parser.parse_args()
    rows = check_data(args.csv_path)  # Gate before heavy imports or artifact creation.
    import pandas as pd
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.pipeline import Pipeline
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.dummy import DummyClassifier
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score
    import joblib

    data = pd.DataFrame(rows)
    time = pd.to_datetime(data.observed_at, utc=True).dt.tz_convert('Asia/Kolkata')
    data['hour'] = time.dt.hour
    data['day_of_week'] = time.dt.dayofweek
    # Hold out whole future days, preventing same-day observations leaking across folds.
    days = sorted(time.dt.date.unique())
    cutoff = days[int(len(days) * 0.8)]
    train_mask = time.dt.date < cutoff
    features = ['location_id', 'event', 'hour', 'day_of_week']
    x_train, x_test = data.loc[train_mask, features], data.loc[~train_mask, features]
    y_train, y_test = data.loc[train_mask, 'crowd_level'], data.loc[~train_mask, 'crowd_level']
    if set(y_train) != LABELS or set(y_test) != LABELS or min(y_train.value_counts()) < 20 or min(y_test.value_counts()) < 10:
        raise ValueError('Each class needs at least 20 training and 10 held-out examples.')
    if not set(x_test.location_id).issubset(set(x_train.location_id)):
        raise ValueError('Held-out locations lack training coverage.')
    transform = ColumnTransformer([('categorical', OneHotEncoder(handle_unknown='ignore'), ['location_id', 'event'])], remainder='passthrough')
    model = Pipeline([('features', transform), ('model', RandomForestClassifier(n_estimators=150, max_depth=12, class_weight='balanced', random_state=42))])
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    baseline = DummyClassifier(strategy='most_frequent').fit(x_train, y_train).predict(x_test)
    report = {'status': 'evaluation_only', 'training_rows': len(x_train), 'test_rows': len(x_test),
              'cutoff_date': str(cutoff), 'accuracy': accuracy_score(y_test, predictions),
              'macro_f1': f1_score(y_test, predictions, average='macro'),
              'baseline_macro_f1': f1_score(y_test, baseline, average='macro'),
              'classification_report': classification_report(y_test, predictions, output_dict=True, zero_division=0),
              'confusion_matrix_labels': ['LOW', 'MEDIUM', 'HIGH'],
              'confusion_matrix': confusion_matrix(y_test, predictions, labels=['LOW', 'MEDIUM', 'HIGH']).tolist()}
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'evaluation.json').write_text(json.dumps(report, indent=2))
    joblib.dump(model, output / 'candidate.joblib')
    print('Candidate evaluated. Predictions remain disabled pending human review and deployment validation.')

if __name__ == '__main__':
    main()
