using Kartex.Serilog;
using Serilog;
using Serilog.Context;
using Serilog.Events;

// Configuration
const string KartexHost = "localhost";
const int KartexPort = 9514;
const string KartexSecret = "change-this-secret-key-in-production";

Console.WriteLine("╔═══════════════════════════════════════════════════════════╗");
Console.WriteLine("║          Kartex Serilog Test Client (.NET 10)             ║");
Console.WriteLine("╚═══════════════════════════════════════════════════════════╝");
Console.WriteLine();
Console.WriteLine($"Sending logs to {KartexHost}:{KartexPort}");
Console.WriteLine("Press Ctrl+C to stop\n");

// Configure Serilog with Kartex sink
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Verbose()
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Application", "Kartex.TestClient")
    .Enrich.WithProperty("Environment", "Development")
    .Enrich.WithProperty("MachineName", Environment.MachineName)
    .WriteTo.Console(
        outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}")
    .WriteTo.KartexUdp(
        host: KartexHost,
        port: KartexPort,
        secret: KartexSecret,
        restrictedToMinimumLevel: LogEventLevel.Verbose)
    .CreateLogger();

// Sample data for generating realistic logs
var users = new[] { "john.doe", "jane.smith", "bob.wilson", "alice.johnson", "charlie.brown" };
var endpoints = new[] { "/api/users", "/api/orders", "/api/products", "/api/auth/login", "/api/payments" };
var methods = new[] { "GET", "POST", "PUT", "DELETE" };
var statusCodes = new[] { 200, 201, 204, 400, 401, 403, 404, 500 };
var random = new Random();

// Cancellation token for graceful shutdown
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
    Console.WriteLine("\nShutting down...");
};

var count = 0;

try
{
    while (!cts.Token.IsCancellationRequested)
    {
        count++;
        var logType = random.Next(100);

        // Generate different types of log messages based on weighted random selection
        switch (logType)
        {
            case < 5: // 5% - Verbose/Trace
                GenerateVerboseLog(random);
                break;

            case < 20: // 15% - Debug
                GenerateDebugLog(random, users, endpoints);
                break;

            case < 70: // 50% - Information
                GenerateInfoLog(random, users, endpoints, methods, statusCodes);
                break;

            case < 90: // 20% - Warning
                GenerateWarningLog(random, endpoints);
                break;

            case < 98: // 8% - Error
                GenerateErrorLog(random, users, endpoints);
                break;

            default: // 2% - Fatal
                GenerateFatalLog(random);
                break;
        }

        // Random delay between logs (100ms - 1000ms)
        await Task.Delay(random.Next(100, 1000), cts.Token);
    }
}
catch (OperationCanceledException)
{
    // Expected when cancellation is requested
}
finally
{
    Console.WriteLine($"\nSent {count} log messages");
    await Log.CloseAndFlushAsync();
}

return;

// Log generation methods
void GenerateVerboseLog(Random rnd)
{
    var methods = new[] { "ProcessRequest", "ValidateToken", "SerializeResponse", "ParseInput" };
    var method = methods[rnd.Next(methods.Length)];

    Log.Verbose("Entering method {MethodName} with correlation {CorrelationId}",
        method,
        Guid.NewGuid().ToString("N")[..8]);
}

void GenerateDebugLog(Random rnd, string[] users, string[] endpoints)
{
    var debugTypes = rnd.Next(3);
    switch (debugTypes)
    {
        case 0:
            Log.Debug("Cache {CacheResult} for key {CacheKey}",
                rnd.Next(2) == 0 ? "HIT" : "MISS",
                $"user:{users[rnd.Next(users.Length)]}");
            break;
        case 1:
            Log.Debug("Database query executed in {ElapsedMs}ms for {QueryType}",
                rnd.Next(5, 100),
                rnd.Next(2) == 0 ? "SELECT" : "INSERT");
            break;
        default:
            Log.Debug("Request received for {Endpoint} from {ClientIp}",
                endpoints[rnd.Next(endpoints.Length)],
                $"192.168.1.{rnd.Next(1, 255)}");
            break;
    }
}

void GenerateInfoLog(Random rnd, string[] users, string[] endpoints, string[] methods, int[] statusCodes)
{
    var infoTypes = rnd.Next(4);
    switch (infoTypes)
    {
        case 0:
            var user = users[rnd.Next(users.Length)];
            Log.Information("User {Username} logged in from {IpAddress}",
                user,
                $"10.0.0.{rnd.Next(1, 255)}");
            break;
        case 1:
            Log.Information("Order {OrderId} processed successfully for customer {CustomerId}",
                $"ORD-{rnd.Next(10000, 99999)}",
                rnd.Next(1000, 9999));
            break;
        case 2:
            var method = methods[rnd.Next(methods.Length)];
            var endpoint = endpoints[rnd.Next(endpoints.Length)];
            var status = statusCodes[rnd.Next(statusCodes.Length)];
            var elapsed = rnd.Next(10, 500);

            using (LogContext.PushProperty("TraceId", Guid.NewGuid().ToString("N")))
            using (LogContext.PushProperty("SpanId", Guid.NewGuid().ToString("N")[..16]))
            {
                Log.Information("HTTP {Method} {Path} responded {StatusCode} in {ElapsedMs}ms",
                    method, endpoint, status, elapsed);
            }
            break;
        default:
            Log.Information("Background job {JobName} completed with {ItemCount} items processed",
                $"DataSync_{rnd.Next(1, 10)}",
                rnd.Next(10, 1000));
            break;
    }
}

void GenerateWarningLog(Random rnd, string[] endpoints)
{
    var warnTypes = rnd.Next(4);
    switch (warnTypes)
    {
        case 0:
            Log.Warning("Memory usage at {Percentage}%, approaching threshold of {Threshold}%",
                rnd.Next(75, 95),
                90);
            break;
        case 1:
            Log.Warning("Slow database query detected: {QueryTime}ms for {TableName}",
                rnd.Next(1000, 5000),
                $"table_{rnd.Next(1, 10)}");
            break;
        case 2:
            Log.Warning("Rate limit {Current}/{Max} for client {ClientId}",
                rnd.Next(80, 100),
                100,
                $"client-{rnd.Next(100, 999)}");
            break;
        default:
            Log.Warning("Deprecated API endpoint {Endpoint} accessed by {UserAgent}",
                endpoints[rnd.Next(endpoints.Length)],
                "Mozilla/5.0 (compatible; OldApp/1.0)");
            break;
    }
}

void GenerateErrorLog(Random rnd, string[] users, string[] endpoints)
{
    var errorTypes = rnd.Next(4);
    switch (errorTypes)
    {
        case 0:
            try
            {
                throw new InvalidOperationException("Connection pool exhausted");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Database connection failed for {DatabaseName}", "users_db");
            }
            break;
        case 1:
            try
            {
                throw new TimeoutException("Operation timed out after 30 seconds");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Payment processing failed for order {OrderId}", $"ORD-{rnd.Next(10000, 99999)}");
            }
            break;
        case 2:
            Log.Error("Authentication failed for user {Username}: {Reason}",
                users[rnd.Next(users.Length)],
                "Invalid credentials");
            break;
        default:
            try
            {
                throw new HttpRequestException("External service returned 503 Service Unavailable");
            }
            catch (Exception ex)
            {
                Log.Error(ex, "External API call to {Endpoint} failed", "https://api.external.com/data");
            }
            break;
    }
}

void GenerateFatalLog(Random rnd)
{
    var fatalTypes = rnd.Next(3);
    switch (fatalTypes)
    {
        case 0:
            try
            {
                throw new OutOfMemoryException("Insufficient memory to continue operation");
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "Critical memory exhaustion - used {UsedMb}MB / {TotalMb}MB",
                    rnd.Next(7500, 8000),
                    8000);
            }
            break;
        case 1:
            try
            {
                throw new InvalidOperationException("Data integrity check failed - possible corruption");
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "Database corruption detected in table {TableName}", "critical_data");
            }
            break;
        default:
            try
            {
                throw new ApplicationException("Unrecoverable system state");
            }
            catch (Exception ex)
            {
                Log.Fatal(ex, "System shutdown initiated due to {Reason}", "unrecoverable error");
            }
            break;
    }
}
