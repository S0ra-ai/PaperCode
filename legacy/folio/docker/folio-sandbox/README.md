# folio-sandbox image

Container image used by `app/sandbox/runner.py` to execute
LLM-generated experiment scripts under hard isolation
(`--network=none --read-only --cap-drop=ALL --user=1000:1000`,
memory/CPU/timeout caps).

## Build

```sh
docker build -t folio-sandbox:0.1 docker/folio-sandbox/
```

## Verify

```sh
docker run --rm folio-sandbox:0.1 python -c "import numpy, pandas, sklearn, matplotlib, scipy; print('ok')"
```

## What's inside

- `python:3.11-slim` base
- Pinned scientific stack: `numpy 2.1.3`, `pandas 2.2.3`,
  `scikit-learn 1.5.2`, `matplotlib 3.9.2`, `scipy 1.14.1`
- Non-root `folio` user (uid 1000)
- `MPLBACKEND=Agg` so plotting works without a display

## What's NOT inside (deliberate)

- No `torch` / `transformers` / `tensorflow` — too heavy and rarely
  needed by the toy experiments M3 currently emits. If a generated
  script needs them, surface that to the user so they can run a
  one-off `pip install` step or extend this image.
- No network egress at runtime — `--network=none` makes any
  `pip install` inside user code fail by design.
