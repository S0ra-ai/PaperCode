# SPDX-License-Identifier: MPL-2.0
#
# Folio sandbox image — used by `app/sandbox/runner.py` (DEFAULT_IMAGE
# = "folio-sandbox:0.1") to execute LLM-generated experiment scripts in
# isolation.
#
# Build:
#   docker build -t folio-sandbox:0.1 docker/folio-sandbox/
#
# The runner invokes the image with the user-code mounted at /work,
# `--network=none`, `--read-only`, `--cap-drop=ALL`, `--user=1000:1000`,
# memory + CPU + timeout caps. The image only needs to provide a Python
# 3.11 interpreter and a numeric/plotting baseline; heavier libs (torch,
# transformers, ...) should be lazy-installed by the user code itself
# during a one-off pre-run with networking enabled, NOT baked here.

FROM python:3.11-slim

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MPLBACKEND=Agg

# Baseline scientific stack. Versions pinned to avoid surprise drift in
# golden experiment outputs across rebuilds.
RUN pip install \
        "numpy==2.1.3" \
        "pandas==2.2.3" \
        "scikit-learn==1.5.2" \
        "matplotlib==3.9.2" \
        "scipy==1.14.1"

# Non-root user matching `--user=1000:1000` in the runner.
RUN useradd --create-home --uid 1000 --shell /bin/bash folio
USER folio
WORKDIR /work

# The runner overrides CMD with `timeout -k 5 <N> python main.py`,
# but a sane default helps `docker run --rm folio-sandbox:0.1 python -V`
# work for smoke tests.
CMD ["python", "-V"]
