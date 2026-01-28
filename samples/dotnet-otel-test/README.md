# .NET 10 OpenTelemetry Test Application

A sample .NET 10 application that demonstrates sending OpenTelemetry traces and logs to the Kartex Logging server via OTLP gRPC.

## Prerequisites

- .NET 10 SDK (Preview)
- Kartex Logging server running with OTLP enabled (port 4317 for gRPC)

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP gRPC endpoint |
| `OTEL_SERVICE_NAME` | `dotnet-otel-test` | Service name for telemetry |

## Running

```bash
# Default settings (localhost:4317)
dotnet run

# Custom endpoint
OTEL_EXPORTER_OTLP_ENDPOINT=http://your-server:4317 dotnet run

# With custom service name
OTEL_SERVICE_NAME=my-app dotnet run
```

## Test Scenarios

1. **Simple Trace** - Basic span with INFO/DEBUG logs
2. **Nested Spans** - Parent → Child → Grandchild hierarchy
3. **Error Scenario** - Exception recording with error status
4. **HTTP Client** - External HTTP request with auto-instrumentation
5. **Batch Processing** - Multiple items with individual spans

## Viewing Results

1. Open Kartex Logging UI at `https://localhost:8443`
2. Login (default: admin/admin123)
3. Check:
   - **Traces** - Waterfall visualization
   - **Logs** - Correlated logs with trace IDs
   - **Live Stream** - Real-time events
