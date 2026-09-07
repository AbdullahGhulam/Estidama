"""Export everything the static site needs to run the model without a server.

Writes into `web/public/model/`:

  trees.json    the selected LightGBM model, flattened into plain arrays
  bundle.json   feature order, category codes, facility tree, climate normals

Run from this directory:

    python export_web_model.py

Why not ONNX: it works, but it drags in 14 MB of WebAssembly to evaluate a
300-tree model. This model splits only on `<=` against numeric thresholds, with
no categorical splits, so walking the trees in JavaScript is a few dozen lines
and the payload is a fraction of the size. Thresholds and leaf values are kept
as full doubles, so the browser arithmetic is not merely close to the Python
model, it is the same arithmetic.

The script proves that before writing anything: it re-implements the traversal
here, scores it against the real model on random inputs, and refuses to export
if they disagree at all beyond floating point noise.
"""

from __future__ import annotations

import json
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np

warnings.filterwarnings("ignore")

sys.path.insert(0, str(Path(__file__).resolve().parent / "api"))

import climate  # noqa: E402
import model as backend  # noqa: E402

OUT = Path(__file__).resolve().parent / "web" / "public" / "model"

# Any deviation at all would be a bug in the flattening, not rounding, because
# both sides use doubles. This leaves room only for float noise.
TOLERANCE = 1e-9


def flatten(dump: dict) -> dict:
    """Trees to parallel arrays.

    A child reference is an index into the internal-node arrays when it is
    non-negative, and encodes a leaf as -(leaf_index + 1) otherwise.
    """
    feature: list[int] = []
    threshold: list[float] = []
    left: list[int] = []
    right: list[int] = []
    leaf_value: list[float] = []
    roots: list[int] = []

    def add(node: dict) -> int:
        if "leaf_value" in node:
            leaf_value.append(float(node["leaf_value"]))
            return -len(leaf_value)  # -(index + 1)

        if node.get("decision_type", "<=") != "<=":
            raise SystemExit(f"unsupported decision type {node['decision_type']!r}")

        slot = len(feature)
        feature.append(int(node["split_feature"]))
        threshold.append(float(node["threshold"]))
        left.append(0)
        right.append(0)

        left[slot] = add(node["left_child"])
        right[slot] = add(node["right_child"])
        return slot

    sys.setrecursionlimit(100_000)
    for tree in dump["tree_info"]:
        roots.append(add(tree["tree_structure"]))

    return {
        "n_features": dump["max_feature_idx"] + 1,
        "roots": roots,
        "feature": feature,
        "threshold": threshold,
        "left": left,
        "right": right,
        "leaf_value": leaf_value,
    }


def predict_with_arrays(trees: dict, rows: np.ndarray) -> np.ndarray:
    """The exact traversal the browser will perform, so parity means something."""
    feature = trees["feature"]
    threshold = trees["threshold"]
    left = trees["left"]
    right = trees["right"]
    leaf = trees["leaf_value"]

    out = np.zeros(len(rows))
    for i, row in enumerate(rows):
        total = 0.0
        for root in trees["roots"]:
            node = root
            while node >= 0:
                node = left[node] if row[feature[node]] <= threshold[node] else right[node]
            total += leaf[-node - 1]
        out[i] = total
    return out


def sample_rows(count: int) -> np.ndarray:
    rng = np.random.default_rng(20260907)
    return np.column_stack(
        [
            rng.uniform(50, 200_000, count),  # sqm
            rng.uniform(-10, 55, count),  # airTemperature
            rng.uniform(-20, 30, count),  # dewTemperature
            rng.uniform(950, 1070, count),  # seaLvlPressure
            rng.uniform(0, 40, count),  # windSpeed
            rng.integers(0, 24, count),  # hour
            rng.integers(0, 7, count),  # day_of_week
            rng.integers(1, 13, count),  # month
            rng.integers(0, 2, count),  # is_weekend
            rng.integers(-1, 16, count),  # primaryspaceusage_code
            rng.integers(-1, 98, count),  # sub_primaryspaceusage_code
        ]
    ).astype(np.float64)


def write_bundle(config: dict, categories: dict) -> None:
    bundle = {
        "features": config["features"],
        "category_levels": config["category_levels"],
        "unseen_category_code": config.get("unseen_category_code", -1),
        "usages": config["category_levels"]["primaryspaceusage"],
        "sub_usages": [
            label
            for label in config["category_levels"]["sub_primaryspaceusage"]
            if label not in set(categories.get("hidden_variants", []))
        ],
        "tree": categories["tree"],
        "defaults": categories["defaults"],
        "climate": climate.presets(),
        "scores": backend.MODEL_SCORES,
    }
    (OUT / "bundle.json").write_text(json.dumps(bundle), encoding="utf-8")


def main() -> None:
    config = backend.config()
    categories = backend.category_tree()
    OUT.mkdir(parents=True, exist_ok=True)

    # The category lists and climate data change far more often than the model
    # does, and refreshing them does not need the estimator in memory.
    if "--bundle-only" in sys.argv:
        write_bundle(config, categories)
        print(f"bundle: {(OUT / 'bundle.json').stat().st_size / 1e6:.2f} MB "
              f"(trees left untouched)")
        return

    estimator = joblib.load(backend.MODEL_FILE)
    print(f"model:  {backend.MODEL_FILE.name}")
    trees = flatten(estimator.booster_.dump_model())
    print(f"trees:  {len(trees['roots'])}, {len(trees['feature'])} splits, "
          f"{len(trees['leaf_value'])} leaves")

    rows = sample_rows(2000)
    reference = estimator.predict(rows)
    ported = predict_with_arrays(trees, rows)
    worst = float(np.abs(reference - ported).max())
    print(f"parity: worst deviation {worst:.3e} kWh over {len(rows)} random rows")
    if worst > TOLERANCE:
        raise SystemExit(f"Flattened trees disagree by {worst} kWh. Not exporting.")

    (OUT / "trees.json").write_text(json.dumps(trees), encoding="utf-8")
    write_bundle(config, categories)

    for name in ("trees.json", "bundle.json"):
        print(f"wrote:  {name}  {(OUT / name).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
