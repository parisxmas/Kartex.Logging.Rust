#!/usr/bin/env python3
"""
Test client for Kartex Logging Server
Sends test log messages via UDP with HMAC authentication

Supports both standard format and Serilog CLEF (Compact Log Event Format)
"""

import socket
import hmac
import hashlib
import json
import random
import time
import argparse
from datetime import datetime, timezone

# Configuration
HOST = "127.0.0.1"
PORT = 9514
SECRET = "change-this-secret-key-in-production"

# Standard format sample data
SERVICES = ["api-gateway", "user-service", "payment-service", "order-service", "notification-service"]
LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
LEVEL_WEIGHTS = [5, 15, 50, 20, 8, 2]  # Probability weights

# Serilog format sample data
SERILOG_CONTEXTS = [
    "MyApp.Controllers.UserController",
    "MyApp.Services.AuthService",
    "MyApp.Data.Repository",
    "MyApp.Middleware.ErrorHandler",
    "MyApp.Jobs.BackgroundWorker",
]
SERILOG_LEVELS = ["Verbose", "Debug", "Information", "Warning", "Error", "Fatal"]
SERILOG_LEVEL_WEIGHTS = [5, 15, 50, 20, 8, 2]

MESSAGES = {
    "TRACE": [
        "Entering function processRequest",
        "Exiting function validateToken",
        "Variable state: initialized",
    ],
    "DEBUG": [
        "Request payload: {user_id: 123}",
        "Cache hit for key: user:123",
        "Database query executed in 15ms",
    ],
    "INFO": [
        "Server started on port 8080",
        "User successfully authenticated",
        "Order processed successfully",
        "Payment confirmed for order #12345",
        "Email notification sent",
    ],
    "WARN": [
        "High memory usage detected: 85%",
        "Slow database query: 2500ms",
        "Rate limit approaching for client",
        "Deprecated API endpoint accessed",
    ],
    "ERROR": [
        "Database connection failed",
        "Failed to process payment: timeout",
        "Authentication failed: invalid token",
        "External API returned 500 error",
    ],
    "FATAL": [
        "Out of memory - shutting down",
        "Critical database corruption detected",
        "Unrecoverable system error",
    ],
}

# Serilog message templates (with property placeholders)
SERILOG_TEMPLATES = {
    "Verbose": [
        ("Entering method {MethodName}", {"MethodName": "ProcessRequest"}),
        ("Variable {VarName} = {VarValue}", {"VarName": "state", "VarValue": "initialized"}),
    ],
    "Debug": [
        ("Request from {ClientIp} with payload size {Size}", {"ClientIp": "192.168.1.100", "Size": 1024}),
        ("Cache {CacheResult} for key {CacheKey}", {"CacheResult": "HIT", "CacheKey": "user:123"}),
        ("Query executed in {ElapsedMs}ms", {"ElapsedMs": 15}),
    ],
    "Information": [
        ("User {Username} logged in from {IpAddress}", {"Username": "john.doe", "IpAddress": "10.0.0.1"}),
        ("Order {OrderId} processed successfully", {"OrderId": "ORD-12345"}),
        ("HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs}ms",
         {"Method": "GET", "Path": "/api/users", "StatusCode": 200, "ElapsedMs": 45}),
    ],
    "Warning": [
        ("Memory usage at {Percentage}%, threshold is {Threshold}%", {"Percentage": 85, "Threshold": 80}),
        ("Slow query detected: {QueryTime}ms for {QueryType}", {"QueryTime": 2500, "QueryType": "SELECT"}),
        ("Rate limit {Current}/{Max} for client {ClientId}", {"Current": 95, "Max": 100, "ClientId": "client-123"}),
    ],
    "Error": [
        ("Failed to connect to database {DbName}: {ErrorMessage}",
         {"DbName": "users_db", "ErrorMessage": "Connection timeout"}),
        ("Payment failed for order {OrderId}: {Reason}", {"OrderId": "ORD-999", "Reason": "Insufficient funds"}),
        ("Authentication failed for user {Username}: {Reason}", {"Username": "admin", "Reason": "Invalid token"}),
    ],
    "Fatal": [
        ("Out of memory: {UsedMb}MB / {TotalMb}MB", {"UsedMb": 7800, "TotalMb": 8000}),
        ("Unrecoverable error in {Component}: {Error}", {"Component": "CoreService", "Error": "Stack overflow"}),
    ],
}

SERILOG_EXCEPTIONS = [
    "System.NullReferenceException: Object reference not set to an instance of an object\n   at MyApp.Service.DoWork() in /src/Service.cs:line 42",
    "System.InvalidOperationException: Sequence contains no elements\n   at System.Linq.Enumerable.First[TSource](IEnumerable`1 source)\n   at MyApp.Repository.GetUser() in /src/Repository.cs:line 88",
    "System.TimeoutException: The operation has timed out.\n   at MyApp.HttpClient.SendAsync() in /src/HttpClient.cs:line 156",
]


def create_log_payload(level: str, service: str, message: str, metadata: dict = None):
    """Create a JSON log payload in standard format"""
    return json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "level": level,
        "service": service,
        "message": message,
        "metadata": metadata or {}
    }).encode()


def create_serilog_payload(level: str, source_context: str, message_template: str,
                           properties: dict = None, exception: str = None,
                           trace_id: str = None, span_id: str = None):
    """Create a JSON log payload in Serilog CLEF format"""
    # Render the message by substituting template placeholders
    rendered_message = message_template
    if properties:
        for key, value in properties.items():
            rendered_message = rendered_message.replace("{" + key + "}", str(value))

    payload = {
        "@t": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "@m": rendered_message,
        "@mt": message_template,
        "@l": level,
        "SourceContext": source_context,
    }

    # Add optional fields
    if exception:
        payload["@x"] = exception
    if trace_id:
        payload["@tr"] = trace_id
    if span_id:
        payload["@sp"] = span_id

    # Add event ID (hash of message template, as Serilog does)
    payload["@i"] = format(hash(message_template) & 0xFFFFFFFF, "08x")

    # Add properties
    if properties:
        payload.update(properties)

    return json.dumps(payload).encode()


def send_log(payload: bytes):
    """Send a log message with HMAC authentication"""
    # Generate HMAC-SHA256 signature
    signature = hmac.new(
        SECRET.encode(),
        payload,
        hashlib.sha256
    ).digest()
    
    # Create packet: [32-byte signature][payload]
    packet = signature + payload
    
    # Send via UDP
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(packet, (HOST, PORT))
    sock.close()


def generate_random_log():
    """Generate a random log entry in standard format"""
    level = random.choices(LEVELS, weights=LEVEL_WEIGHTS)[0]
    service = random.choice(SERVICES)
    message = random.choice(MESSAGES[level])

    # Add some random metadata
    metadata = {}
    if random.random() > 0.5:
        metadata["request_id"] = f"req-{random.randint(1000, 9999)}"
    if random.random() > 0.7:
        metadata["user_id"] = random.randint(1, 1000)
    if level in ["ERROR", "FATAL"]:
        metadata["error_code"] = f"ERR_{random.randint(100, 999)}"

    return level, service, message, metadata


def generate_random_serilog():
    """Generate a random log entry in Serilog CLEF format"""
    level = random.choices(SERILOG_LEVELS, weights=SERILOG_LEVEL_WEIGHTS)[0]
    source_context = random.choice(SERILOG_CONTEXTS)
    message_template, properties = random.choice(SERILOG_TEMPLATES[level])

    # Randomize some property values
    props = properties.copy()
    if "ElapsedMs" in props:
        props["ElapsedMs"] = random.randint(1, 500)
    if "Percentage" in props:
        props["Percentage"] = random.randint(70, 95)

    # Add trace context sometimes
    trace_id = None
    span_id = None
    if random.random() > 0.5:
        trace_id = f"{random.randint(0, 0xFFFFFFFFFFFFFFFF):016x}"
        span_id = f"{random.randint(0, 0xFFFFFFFF):08x}"

    # Add exception for Error/Fatal levels sometimes
    exception = None
    if level in ["Error", "Fatal"] and random.random() > 0.5:
        exception = random.choice(SERILOG_EXCEPTIONS)

    return level, source_context, message_template, props, exception, trace_id, span_id


def main():
    parser = argparse.ArgumentParser(description="Kartex Logging Server Test Client")
    parser.add_argument(
        "--format", "-f",
        choices=["standard", "serilog", "mixed"],
        default="standard",
        help="Log format to use: standard, serilog (CLEF), or mixed (default: standard)"
    )
    parser.add_argument(
        "--count", "-c",
        type=int,
        default=0,
        help="Number of logs to send (0 = infinite, default: 0)"
    )
    parser.add_argument(
        "--delay", "-d",
        type=float,
        default=0.5,
        help="Average delay between logs in seconds (default: 0.5)"
    )
    args = parser.parse_args()

    format_label = {
        "standard": "Standard Format",
        "serilog": "Serilog CLEF Format",
        "mixed": "Mixed Format (Standard + Serilog)"
    }

    print(f"Kartex Log Test Client")
    print(f"Sending logs to {HOST}:{PORT}")
    print(f"Format: {format_label[args.format]}")
    print("-" * 60)

    count = 0
    try:
        while args.count == 0 or count < args.count:
            # Determine format for this log
            use_serilog = (args.format == "serilog" or
                          (args.format == "mixed" and random.random() > 0.5))

            if use_serilog:
                level, ctx, template, props, exc, tr, sp = generate_random_serilog()
                payload = create_serilog_payload(level, ctx, template, props, exc, tr, sp)
                # Render message for display
                msg = template
                for k, v in props.items():
                    msg = msg.replace("{" + k + "}", str(v))
                print(f"[{count+1}] [SERILOG] {level:11} | {ctx:35} | {msg[:40]}")
            else:
                level, service, message, metadata = generate_random_log()
                payload = create_log_payload(level, service, message, metadata)
                print(f"[{count+1}] [STANDARD] {level:6} | {service:20} | {message[:50]}")

            send_log(payload)
            count += 1

            # Random delay between logs
            time.sleep(random.uniform(args.delay * 0.2, args.delay * 1.8))

    except KeyboardInterrupt:
        pass

    print(f"\nSent {count} log messages")


if __name__ == "__main__":
    main()
