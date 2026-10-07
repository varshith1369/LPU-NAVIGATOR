# Crowd prediction gate

No real crowd observations were supplied. Predictions are disabled at `/api/ml/status` and not exposed in the interface.

The optional Random Forest training script accepts aggregated, sourced observations using the header in `ml-service/data/crowd_observations.csv`. It checks provenance, duplicate observations, timestamps, temporal coverage, location coverage and class coverage before fitting. The minimum 500 observations and 30 days are explicit pilot engineering gates, not statistical guarantees of adequacy. Dataset quality and sample-size requirements must still be reviewed for the real use case.

Install `ml-service/requirements.txt` only when a real dataset is available. Run `python ml-service/training/train.py <real-data.csv>`. It uses whole future days as the test set, compares a majority-class baseline and writes accuracy, per-class precision/recall/F1, macro F1 and a confusion matrix. Location/event/hour/day-of-week are predictors; crowd labels are never used as input features.

Candidate artifacts do not activate production predictions. Quality thresholds, calibration, new-location behavior, drift monitoring and lawful collection practices need review before activation. Never use raw device identifiers or precise individual movement histories for this dataset.
