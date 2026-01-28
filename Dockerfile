FROM rust:1.83-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock* ./

# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy source code
COPY src ./src
COPY static ./static
COPY config.toml ./

# Build application
RUN touch src/main.rs && cargo build --release

# Runtime stage - use same debian version as builder
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/kartex-logging-rust .
COPY --from=builder /app/static ./static
COPY --from=builder /app/config.toml ./

EXPOSE 8443 9514/udp

CMD ["./kartex-logging-rust"]
