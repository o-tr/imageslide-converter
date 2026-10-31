# Build from the repository root; publish and reference the resulting digest.
FROM python:3.13-alpine AS builder
ARG GOOGLE_FONTS_REV=6c1dbe27dcf7d817d4b62cec033ba77fa8e2a5ec
RUN apk add --no-cache git
WORKDIR /google-fonts
RUN git init && git remote add origin https://github.com/google/fonts.git \
    && git -c protocol.version=2 fetch --depth=1 --filter=blob:none origin "$GOOGLE_FONTS_REV" \
    && git sparse-checkout init --cone \
    && git sparse-checkout set ofl apache ufl \
    && git checkout --detach FETCH_HEAD
COPY scripts/create-google-font-pack.py /usr/local/bin/create-google-font-pack.py
RUN python3 /usr/local/bin/create-google-font-pack.py /google-fonts /font-pack

FROM scratch
COPY --from=builder /font-pack/ /
