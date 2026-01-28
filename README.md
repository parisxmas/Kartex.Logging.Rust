# Kartex Logging Server

A high-performance, multi-protocol logging and tracing server built in Rust. Supports UDP, GELF, OpenTelemetry OTLP, stores data in MongoDB, and provides a modern web interface with real-time streaming.

## Features

- **Multi-Protocol Ingestion**
  - UDP with HMAC-SHA256 authentication (port 9514)
  - GELF UDP for Graylog-compatible clients (port 12201)
  - OpenTelemetry OTLP gRPC (port 4317)
  - OpenTelemetry OTLP HTTP/JSON (port 4318)
- **Distributed Tracing** - Full trace collection with span visualization
- **Log-Trace Correlation** - Link logs to traces via trace_id
- **Real-time Streaming** - WebSocket-based live log and trace updates
- **Alerting System** - Configurable alerts with webhook notifications
- **Metrics Dashboard** - Real-time metrics and statistics
- **MongoDB Storage** - Efficient document storage with automatic indexing
- **HTTPS API** - RESTful API for querying logs and traces
- **Web Interface** - Modern dashboard with logs, traces, and alerts views
- **Docker Ready** - Production-ready Docker and Docker Compose configuration

## Quick Start

### Using Docker Compose (Recommended)

```bash
docker-compose up -d
```

This starts:
- MongoDB on port 27017
- Kartex Logging Server with all protocols enabled

Access the web interface at http://localhost:8443

### Running Locally

1. **Start MongoDB:**
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:7
   ```

2. **Configure the server:**
   Edit `config.toml` with your settings.

3. **Build and run:**
   ```bash
   cargo build --release
   cargo run --release
   ```

## Protocol Support

### UDP with HMAC Authentication (Port 9514)

Packets follow this structure:
```
[32-byte HMAC-SHA256 signature][JSON payload]
```

#### Standard JSON Format
```json
{
  "timestamp": "2024-01-27T12:00:00Z",
  "level": "INFO",
  "service": "my-service",
  "message": "Log message here",
  "metadata": { "key": "value" }
}
```

#### Serilog CLEF Format
```json
{
  "@t": "2024-01-27T12:00:00Z",
  "@m": "User john.doe logged in",
  "@mt": "User {Username} logged in",
  "@l": "Information",
  "@tr": "0123456789abcdef",
  "@sp": "abcd1234",
  "SourceContext": "MyApp.AuthService",
  "Username": "john.doe"
}
```

### GELF UDP (Port 12201)

Graylog Extended Log Format for compatibility with existing logging infrastructure.

```json
{
  "version": "1.1",
  "host": "example.org",
  "short_message": "A short message",
  "full_message": "Full message with details",
  "timestamp": 1234567890.123,
  "level": 6,
  "facility": "my-service",
  "_user_id": 42,
  "_request_id": "abc-123"
}
```

Features:
- Supports GELF 1.0 and 1.1
- Gzip and Zlib compression
- Custom fields (prefixed with `_`)
- Syslog severity levels (0-7)

#### GELF Level Mapping
| Syslog Level | Name | Internal Level |
|--------------|------|----------------|
| 0-2 | Emergency/Alert/Critical | FATAL |
| 3 | Error | ERROR |
| 4 | Warning | WARN |
| 5-6 | Notice/Informational | INFO |
| 7 | Debug | DEBUG |

### OpenTelemetry OTLP

#### gRPC (Port 4317)
```python
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter

trace_exporter = OTLPSpanExporter(endpoint="localhost:4317", insecure=True)
log_exporter = OTLPLogExporter(endpoint="localhost:4317", insecure=True)
```

#### HTTP/JSON (Port 4318)
```bash
# Send traces
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[...]}'

# Send logs
curl -X POST http://localhost:4318/v1/logs \
  -H "Content-Type: application/json" \
  -d '{"resourceLogs":[...]}'
```

## API Endpoints

### Logs

| Endpoint | Description |
|----------|-------------|
| `GET /api/logs` | Query logs with filters |
| `GET /api/logs/{id}` | Get log by ID |
| `GET /api/logs/{id}/trace` | Get trace for a log entry |
| `GET /api/stats` | Get log statistics |

Query parameters for `/api/logs`:
- `level` - Filter by log level
- `service` - Filter by service name
- `start_time` / `end_time` - Time range (ISO 8601)
- `search` - Full-text search
- `trace_id` - Filter by trace ID
- `limit` / `skip` - Pagination

### Traces

| Endpoint | Description |
|----------|-------------|
| `GET /api/traces` | List trace summaries |
| `GET /api/traces/{trace_id}` | Get full trace with spans and correlated logs |

Query parameters for `/api/traces`:
- `service` - Filter by service name
- `start_time` / `end_time` - Time range
- `limit` / `skip` - Pagination

### Alerts

| Endpoint | Description |
|----------|-------------|
| `GET /api/alerts` | List alert rules |
| `POST /api/alerts` | Create alert rule |
| `DELETE /api/alerts/{id}` | Delete alert rule |
| `GET /api/alerts/history` | Get triggered alerts history |

### Real-time

| Endpoint | Description |
|----------|-------------|
| `GET /api/ws` | WebSocket for real-time logs, traces, and metrics |
| `GET /api/metrics` | Current metrics snapshot |

### Health

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |

## WebSocket Messages

Connect to `/api/ws` for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:8443/api/ws');
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'log': console.log('New log:', msg.data); break;
    case 'span': console.log('New span:', msg.data); break;
    case 'metrics': console.log('Metrics:', msg.data); break;
    case 'alert': console.log('Alert triggered:', msg.data); break;
  }
};
```

## Configuration

### config.toml

```toml
[server]
udp_port = 9514
https_port = 8443
auth_secret = "change-this-secret-key-in-production"
api_keys = ["your-api-key"]

[mongodb]
connection_string = "mongodb://localhost:27017"
database_name = "kartex_logs"
collection_name = "logs"

[gelf]
enabled = true
udp_port = 12201

[otlp]
enabled = true
grpc_port = 4317
http_port = 4318
enable_grpc = true
enable_http = true
spans_collection = "spans"

[tls]
cert_path = "certs/cert.pem"
key_path = "certs/key.pem"

[logging]
level = "info"
retention_days = 30
```

## Example Clients

### Python (UDP)

```python
import socket
import hmac
import hashlib
import json
from datetime import datetime

def send_log(host, port, secret, level, service, message):
    payload = json.dumps({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "service": service,
        "message": message
    }).encode()

    signature = hmac.new(secret.encode(), payload, hashlib.sha256).digest()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(signature + payload, (host, port))

send_log("localhost", 9514, "your-secret", "INFO", "my-app", "Hello!")
```

### Python (GELF)

```python
import socket
import json
import time

def send_gelf(host, port, message, level=6, facility="my-app", **extra):
    gelf = {
        "version": "1.1",
        "host": socket.gethostname(),
        "short_message": message,
        "timestamp": time.time(),
        "level": level,
        "facility": facility,
        **{f"_{k}": v for k, v in extra.items()}
    }

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(json.dumps(gelf).encode(), (host, port))

send_gelf("localhost", 12201, "User logged in", user_id=42, request_id="abc-123")
```

### Python (OpenTelemetry)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Setup
trace.set_tracer_provider(TracerProvider())
exporter = OTLPSpanExporter(endpoint="localhost:4317", insecure=True)
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(exporter))

# Create traces
tracer = trace.get_tracer("my-service")
with tracer.start_as_current_span("my-operation") as span:
    span.set_attribute("user.id", 42)
    # Your code here
```

### C# / .NET (Serilog)

```csharp
// Custom Serilog sink for Kartex UDP
public class KartexUdpSink : ILogEventSink
{
    private readonly UdpClient _client;
    private readonly byte[] _secret;
    private readonly CompactJsonFormatter _formatter = new();

    public KartexUdpSink(string host, int port, string secret)
    {
        _client = new UdpClient(host, port);
        _secret = Encoding.UTF8.GetBytes(secret);
    }

    public void Emit(LogEvent logEvent)
    {
        using var writer = new StringWriter();
        _formatter.Format(logEvent, writer);
        var payload = Encoding.UTF8.GetBytes(writer.ToString());

        using var hmac = new HMACSHA256(_secret);
        var signature = hmac.ComputeHash(payload);

        var packet = signature.Concat(payload).ToArray();
        _client.Send(packet, packet.Length);
    }
}

// Usage
Log.Logger = new LoggerConfiguration()
    .WriteTo.Sink(new KartexUdpSink("localhost", 9514, "your-secret"))
    .CreateLogger();
```

### C# / .NET (OpenTelemetry)

```csharp
using var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .AddSource("MyApp")
    .AddOtlpExporter(o => {
        o.Endpoint = new Uri("http://localhost:4317");
        o.Protocol = OtlpExportProtocol.Grpc;
    })
    .Build();

var tracer = tracerProvider.GetTracer("MyApp");
using var span = tracer.StartActiveSpan("my-operation");
span.SetAttribute("user.id", 42);
```

## Docker Compose

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  logging-server:
    build: .
    ports:
      - "8443:8443"      # HTTP API & Web UI
      - "9514:9514/udp"  # UDP with HMAC auth
      - "4317:4317"      # OTLP gRPC
      - "4318:4318"      # OTLP HTTP
      - "12201:12201/udp" # GELF UDP
    depends_on:
      - mongodb

volumes:
  mongodb_data:
```

## Web Interface

The web interface at http://localhost:8443 provides:

- **Logs View** - Search, filter, and browse logs with real-time updates
- **Traces View** - Waterfall visualization of distributed traces
- **Alerts View** - Configure and monitor alert rules
- **Log Detail Modal** - Full log details with trace correlation
- **Trace Detail Modal** - Span timeline with attributes and correlated logs

## Development

```bash
# Run with debug logging
RUST_LOG=debug cargo run

# Run tests
cargo test

# Build release
cargo build --release
```

## License

MIT
