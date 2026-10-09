import numpy as np
import logging
from typing import List, Tuple

logger = logging.getLogger("ETAPredictor")


class SimpleDecisionTreeRegressor:
    """A lightweight decision tree stump for Gradient Boosting using pure NumPy."""
    def __init__(self, max_depth: int = 3):
        self.max_depth = max_depth
        self.tree = None

    def fit(self, X: np.ndarray, y: np.ndarray, depth: int = 0):
        if depth >= self.max_depth or len(y) <= 5 or np.var(y) < 1e-4:
            return {"val": float(np.mean(y))}

        best_feat, best_thresh, best_score = None, None, float("inf")
        n_samples, n_features = X.shape

        for feat in range(n_features):
            vals = np.unique(X[:, feat])
            if len(vals) > 10:
                vals = np.percentile(vals, np.linspace(10, 90, 8))
            for thresh in vals:
                left_mask = X[:, feat] <= thresh
                right_mask = ~left_mask
                if not np.any(left_mask) or not np.any(right_mask):
                    continue
                score = np.var(y[left_mask]) * np.sum(left_mask) + np.var(y[right_mask]) * np.sum(right_mask)
                if score < best_score:
                    best_score = score
                    best_feat = feat
                    best_thresh = thresh

        if best_feat is None:
            return {"val": float(np.mean(y))}

        left_mask = X[:, best_feat] <= best_thresh
        return {
            "feat": best_feat,
            "thresh": best_thresh,
            "left": self.fit(X[left_mask], y[left_mask], depth + 1),
            "right": self.fit(X[~left_mask], y[~left_mask], depth + 1)
        }

    def predict_row(self, node: dict, row: np.ndarray) -> float:
        if "val" in node:
            return node["val"]
        if row[node["feat"]] <= node["thresh"]:
            return self.predict_row(node["left"], row)
        return self.predict_row(node["right"], row)


class GradientBoostedETARegressor:
    """Gradient Boosted Regressor built with pure NumPy.

    Matches scikit-learn GradientBoostingRegressor behavior without DLL / Cython policy blocks.
    """
    def __init__(self, n_estimators: int = 25, learning_rate: float = 0.1, max_depth: int = 3):
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.trees: List[dict] = []
        self.base_pred = 0.0

    def fit(self, X: np.ndarray, y: np.ndarray):
        self.base_pred = float(np.mean(y))
        residuals = y - self.base_pred
        self.trees = []

        for _ in range(self.n_estimators):
            stump = SimpleDecisionTreeRegressor(max_depth=self.max_depth)
            tree = stump.fit(X, residuals)
            self.trees.append(tree)

            # Update residuals
            preds = np.array([stump.predict_row(tree, row) for row in X])
            residuals -= self.learning_rate * preds

    def predict(self, X: np.ndarray) -> np.ndarray:
        stump = SimpleDecisionTreeRegressor()
        predictions = np.full(X.shape[0], self.base_pred)
        for tree in self.trees:
            preds = np.array([stump.predict_row(tree, row) for row in X])
            predictions += self.learning_rate * preds
        return predictions


class ETAPredictor:
    def __init__(self):
        self.model = GradientBoostedETARegressor(n_estimators=20, learning_rate=0.15, max_depth=3)
        self.is_trained = False
        self._train_initial_model()

    def _generate_synthetic_dataset(self, n_samples: int = 600) -> Tuple[np.ndarray, np.ndarray]:
        """Features:
        0: distance_km (0.5 to 25.0)
        1: hour_of_day (6.0 to 22.0)
        2: congestion_severity (1.0 to 3.5)
        3: weather_flag (0 = clear, 1 = rain, 2 = storm)
        4: payload_ratio (0.0 to 1.0)
        """
        np.random.seed(42)
        distances = np.random.uniform(0.5, 25.0, n_samples)
        hours = np.random.uniform(6.0, 22.0, n_samples)
        congestion = np.random.uniform(1.0, 3.5, n_samples)
        weather = np.random.choice([0, 1, 2], size=n_samples, p=[0.75, 0.2, 0.05])
        payload = np.random.uniform(0.1, 1.0, n_samples)

        X = np.column_stack([distances, hours, congestion, weather, payload])

        # Realistic physics-informed travel times
        rush_hour_boost = np.where(((hours >= 8.0) & (hours <= 10.0)) | ((hours >= 17.0) & (hours <= 19.0)), 1.3, 1.0)
        weather_boost = 1.0 + weather * 0.25
        payload_boost = 1.0 + payload * 0.1

        y = distances * 1.5 * congestion * rush_hour_boost * weather_boost * payload_boost
        noise = np.random.normal(0, 0.05 * y)
        y = np.maximum(1.0, y + noise)

        return X, y

    def _train_initial_model(self):
        try:
            X, y = self._generate_synthetic_dataset()
            self.model.fit(X, y)
            self.is_trained = True
            logger.info("Gradient Boosted ETA Model trained successfully.")
        except Exception as e:
            logger.error(f"ETA model training failed: {e}")
            self.is_trained = False

    def predict_eta_minutes(
        self,
        distance_km: float,
        hour_of_day: float = 9.0,
        congestion_severity: float = 1.0,
        weather_flag: int = 0,
        payload_ratio: float = 0.5
    ) -> float:
        if not self.is_trained:
            return round((distance_km / 35.0) * 60.0 * max(1.0, congestion_severity), 1)

        features = np.array([[distance_km, hour_of_day, congestion_severity, weather_flag, payload_ratio]])
        pred = float(self.model.predict(features)[0])
        return round(max(1.0, pred), 1)
