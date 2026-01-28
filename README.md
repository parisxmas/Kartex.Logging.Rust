# Kartex Logging Server

A high-performance logging server built in Rust that accepts UDP log packets with authentication, stores them in MongoDB, and provides HTTPS API endpoints with a modern web interface.

## Features

- **UDP Log Ingestion** - High-performance UDP server accepting authenticated log packets
- **HMAC-SHA256 Authentication** - Secure authentication using HMAC signatures
- **Serilog Compatible** - Native support for Serilog CLEF (Compact Log Event Format)
- **MongoDB Storage** - Efficient document storage with automatic indexing
- **HTTPS API** - RESTful API for querying logs with filtering and pagination
- **Web Interface** - Modern, responsive dashboard for log viewing and analysis
- **Real-time Updates** - Auto-refresh capability for live monitoring
- **Docker Ready** - Production-ready Docker and Docker Compose configuration

## Quick Start

### Prerequisites

- Rust 1.75+ (or Docker)
- MongoDB 6.0+

### Running Locally

1. **Start MongoDB:**
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:7
   ```

2. **Configure the server:**
   Edit `config.toml` with your settings:
   ```toml
   [server]
   udp_port = 9514
   https_port = 8443
   auth_secret = "your-secret-key"
   api_keys = ["your-api-key"]
   ```

3. **Build and run:**
   ```bash
   cargo build --release
   cargo run --release
   ```

4. **Access the web interface:**
   Open http://localhost:8443 in your browser

### Using Docker Compose

```bash
docker-compose up -d
```

## UDP Packet Format

Packets should follow this structure:
```
[32-byte HMAC-SHA256 signature][JSON payload]
```

### Standard JSON Payload Schema

```json
{
  "timestamp": "2024-01-27T12:00:00Z",
  "level": "INFO",
  "service": "my-service",
  "message": "Log message here",
  "metadata": {
    "key": "value"
  }
}
```

### Serilog CLEF Format (Compact Log Event Format)

The server auto-detects and parses Serilog's CLEF format:

```json
{
  "@t": "2024-01-27T12:00:00Z",
  "@m": "User john.doe logged in from 10.0.0.1",
  "@mt": "User {Username} logged in from {IpAddress}",
  "@l": "Information",
  "@x": "System.Exception: Error details...",
  "@i": "a1b2c3d4",
  "@tr": "0123456789abcdef",
  "@sp": "abcd1234",
  "SourceContext": "MyApp.AuthService",
  "Username": "john.doe",
  "IpAddress": "10.0.0.1"
}
```

| Field | Description |
|-------|-------------|
| `@t` | Timestamp (required) |
| `@m` | Rendered message |
| `@mt` | Message template with placeholders |
| `@l` | Log level (Verbose, Debug, Information, Warning, Error, Fatal) |
| `@x` | Exception details |
| `@i` | Event ID |
| `@tr` | Trace ID for distributed tracing |
| `@sp` | Span ID for distributed tracing |
| `SourceContext` | Logger name (used as service name) |
| Other fields | Stored as metadata |

### Supported Log Levels

Standard format:
- `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`

Serilog format (automatically mapped):
- `Verbose` -> TRACE
- `Debug` -> DEBUG
- `Information` -> INFO
- `Warning` -> WARN
- `Error` -> ERROR
- `Fatal` -> FATAL

## API Endpoints

### Query Logs
```
GET /api/logs?level=ERROR&service=api&search=timeout&limit=50&skip=0
```

Query parameters:
- `level` - Filter by log level
- `service` - Filter by service name
- `start_time` - ISO 8601 timestamp for range start
- `end_time` - ISO 8601 timestamp for range end
- `search` - Full-text search in message
- `limit` - Number of results (max 1000)
- `skip` - Offset for pagination

### Get Log by ID
```
GET /api/logs/{id}
```

### Get Statistics
```
GET /api/stats
```

Returns counts by level and service.

### Health Check
```
GET /health
```

## Example Client (Python)

```python
import socket
import hmac
import hashlib
import json
from datetime import datetime

def send_log(host, port, secret, level, service, message, metadata=None):
    # Create payload
    payload = json.dumps({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "service": service,
        "message": message,
        "metadata": metadata or {}
    }).encode()
    
    # Generate HMAC signature
    signature = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).digest()
    
    # Send UDP packet
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(signature + payload, (host, port))
    sock.close()

# Usage
send_log(
    "localhost", 9514,
    "change-this-secret-key-in-production",
    "ERROR",
    "my-service",
    "Database connection failed",
    {"error_code": "DB_TIMEOUT"}
)
```

## Example Client (Rust)

```rust
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::net::UdpSocket;

fn send_log(host: &str, port: u16, secret: &str, payload: &[u8]) {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(payload);
    let signature = mac.finalize().into_bytes();

    let mut packet = signature.to_vec();
    packet.extend_from_slice(payload);

    let socket = UdpSocket::bind("0.0.0.0:0").unwrap();
    socket.send_to(&packet, format!("{}:{}", host, port)).unwrap();
}
```

## Example Client (C# / .NET with Serilog)

First, create a custom Serilog sink for Kartex:

```csharp
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting.Compact;

public class KartexUdpSink : ILogEventSink
{
    private readonly string _host;
    private readonly int _port;
    private readonly byte[] _secret;
    private readonly UdpClient _client;
    private readonly CompactJsonFormatter _formatter;

    public KartexUdpSink(string host, int port, string secret)
    {
        _host = host;
        _port = port;
        _secret = Encoding.UTF8.GetBytes(secret);
        _client = new UdpClient();
        _formatter = new CompactJsonFormatter();
    }

    public void Emit(LogEvent logEvent)
    {
        using var writer = new StringWriter();
        _formatter.Format(logEvent, writer);
        var payload = Encoding.UTF8.GetBytes(writer.ToString());

        // Generate HMAC-SHA256 signature
        using var hmac = new HMACSHA256(_secret);
        var signature = hmac.ComputeHash(payload);

        // Combine signature + payload
        var packet = new byte[signature.Length + payload.Length];
        Buffer.BlockCopy(signature, 0, packet, 0, signature.Length);
        Buffer.BlockCopy(payload, 0, packet, signature.Length, payload.Length);

        _client.Send(packet, packet.Length, _host, _port);
    }
}

// Extension method for easy configuration
public static class KartexSinkExtensions
{
    public static LoggerConfiguration KartexUdp(
        this LoggerSinkConfiguration config,
        string host = "localhost",
        int port = 9514,
        string secret = "your-secret")
    {
        return config.Sink(new KartexUdpSink(host, port, secret));
    }
}
```

Configure Serilog to use the Kartex sink:

```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Debug()
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Application", "MyApp")
    .WriteTo.KartexUdp(
        host: "localhost",
        port: 9514,
        secret: "change-this-secret-key-in-production")
    .CreateLogger();

// Usage
Log.Information("User {Username} logged in from {IpAddress}", "john.doe", "10.0.0.1");
Log.Error(exception, "Failed to process order {OrderId}", orderId);
```

## Configuration

### config.toml

```toml
[server]
udp_port = 9514           # UDP port for log ingestion
https_port = 8443         # HTTPS port for API and web UI
auth_secret = "secret"    # HMAC secret for UDP authentication
api_keys = ["key1"]       # Valid API keys for HTTPS endpoints

[mongodb]
connection_string = "mongodb://localhost:27017"
database_name = "kartex_logs"
collection_name = "logs"

[tls]
cert_path = "certs/cert.pem"
key_path = "certs/key.pem"

[logging]
level = "info"
retention_days = 30
```

## Development

```bash
# Run with debug logging
RUST_LOG=debug cargo run

# Run tests
cargo test

# Build release
cargo build --release

# Test client (standard format)
python test_client.py

# Test client (Serilog CLEF format)
python test_client.py --format serilog

# Test client (mixed format)
python test_client.py --format mixed
```

## License

MIT
