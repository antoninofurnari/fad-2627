# site/data/

Datasets used by the lecture notes, served from the website itself.

Chapters load them through a single base URL:

```python
DATA = "https://antoninofurnari.github.io/fad-2627/data/"
pd.read_csv(DATA + "titanic.csv")
```

so the same code runs locally, during a Quarto render and on Colab, and no chapter
depends on a third-party URL that may disappear.

`MANIFEST.yml` records, for every file: where it came from, its licence, which chapters
use it, its size and a checksum. `scripts/fetch_data.py` downloads or refreshes them and
updates the checksums.

Files larger than about 5 MB stay remote and are documented in the manifest instead of
being committed. Datasets loaded through a library API that ships with the environment
(`seaborn.load_dataset`, `sklearn.datasets`) are not vendored.

Two entries are not plain downloads: `breast_cancer_wisconsin.csv` and `automobile.csv`
carry a `ucimlrepo_id:` and are written by `fetch_data.py` from `fetch_ucirepo`, features
joined to targets. UCI serves them as zips, and the chapters that read them were written
against the frame `ucimlrepo` returns — its column names, `radius1` rather than
scikit-learn's `mean radius`, are the ones the prose refers to.
