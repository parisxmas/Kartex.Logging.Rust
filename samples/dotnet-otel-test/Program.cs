using System.Diagnostics;
using Microsoft.Extensions.Logging;
using OpenTelemetry;
using OpenTelemetry.Logs;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

// Configuration
var otlpEndpoint = Environment.GetEnvironmentVariable("OTEL_EXPORTER_OTLP_ENDPOINT")
    ?? "http://localhost:4317";
var serviceName = Environment.GetEnvironmentVariable("OTEL_SERVICE_NAME")
    ?? "dotnet-otel-test";

Console.WriteLine("OpenTelemetry Test Application (.NET 10)");
Console.WriteLine("========================================");
Console.WriteLine($"OTLP Endpoint: {otlpEndpoint}");
Console.WriteLine($"Service Name: {serviceName}");
Console.WriteLine();

// Create resource attributes
var resourceBuilder = ResourceBuilder.CreateDefault()
    .AddService(serviceName: serviceName, serviceVersion: "1.0.0")
    .AddAttributes(new Dictionary<string, object>
    {
        ["deployment.environment"] = "development",
        ["host.name"] = Environment.MachineName
    });

// Create ActivitySource for tracing
var activitySource = new ActivitySource(serviceName);

// Setup tracing
using var tracerProvider = Sdk.CreateTracerProviderBuilder()
    .SetResourceBuilder(resourceBuilder)
    .AddSource(serviceName)
    .AddHttpClientInstrumentation()
    .AddOtlpExporter(options =>
    {
        options.Endpoint = new Uri(otlpEndpoint);
        options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.Grpc;
    })
    .AddConsoleExporter()
    .Build();

// Setup logging with OTLP export
using var loggerFactory = LoggerFactory.Create(builder =>
{
    builder.AddOpenTelemetry(logging =>
    {
        logging.SetResourceBuilder(resourceBuilder);
        logging.AddOtlpExporter(options =>
        {
            options.Endpoint = new Uri(otlpEndpoint);
            options.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.Grpc;
        });
        logging.AddConsoleExporter();
    });
    builder.SetMinimumLevel(LogLevel.Trace);
});

var logger = loggerFactory.CreateLogger("DotnetOtelTest");

Console.WriteLine("Starting test scenarios...");
Console.WriteLine();

// Test 1: Simple trace with logs
await RunSimpleTraceTest(activitySource, logger);

// Test 2: Nested spans
await RunNestedSpansTest(activitySource, logger);

// Test 3: Error scenario
await RunErrorScenarioTest(activitySource, logger);

// Test 4: HTTP client trace
await RunHttpClientTest(activitySource, logger);

// Test 5: Batch processing simulation
await RunBatchProcessingTest(activitySource, logger);

Console.WriteLine();
Console.WriteLine("All tests completed. Press Enter to exit...");
Console.ReadLine();

// Test implementations
static async Task RunSimpleTraceTest(ActivitySource activitySource, ILogger logger)
{
    Console.WriteLine("Test 1: Simple trace with logs");

    using var activity = activitySource.StartActivity("SimpleOperation", ActivityKind.Internal);
    activity?.SetTag("test.name", "simple-trace");
    activity?.SetTag("test.iteration", 1);

    logger.LogInformation("Starting simple operation");

    await Task.Delay(100);

    logger.LogDebug("Processing step 1");
    await Task.Delay(50);

    logger.LogDebug("Processing step 2");
    await Task.Delay(50);

    logger.LogInformation("Simple operation completed successfully");

    activity?.SetStatus(ActivityStatusCode.Ok);

    Console.WriteLine("  - Completed");
}

static async Task RunNestedSpansTest(ActivitySource activitySource, ILogger logger)
{
    Console.WriteLine("Test 2: Nested spans");

    using var parentActivity = activitySource.StartActivity("ParentOperation", ActivityKind.Server);
    parentActivity?.SetTag("operation.type", "parent");

    logger.LogInformation("Starting parent operation with trace_id={TraceId}",
        parentActivity?.TraceId.ToString());

    // Child span 1
    using (var childActivity1 = activitySource.StartActivity("ChildOperation1", ActivityKind.Internal))
    {
        childActivity1?.SetTag("operation.type", "child");
        childActivity1?.SetTag("child.index", 1);

        logger.LogDebug("Executing child operation 1");
        await Task.Delay(100);

        // Grandchild span
        using (var grandchildActivity = activitySource.StartActivity("GrandchildOperation", ActivityKind.Internal))
        {
            grandchildActivity?.SetTag("operation.type", "grandchild");
            logger.LogTrace("Deep nested operation");
            await Task.Delay(50);
        }

        childActivity1?.SetStatus(ActivityStatusCode.Ok);
    }

    // Child span 2
    using (var childActivity2 = activitySource.StartActivity("ChildOperation2", ActivityKind.Internal))
    {
        childActivity2?.SetTag("operation.type", "child");
        childActivity2?.SetTag("child.index", 2);

        logger.LogDebug("Executing child operation 2");
        await Task.Delay(75);

        childActivity2?.SetStatus(ActivityStatusCode.Ok);
    }

    logger.LogInformation("Parent operation completed");
    parentActivity?.SetStatus(ActivityStatusCode.Ok);

    Console.WriteLine("  - Completed");
}

static async Task RunErrorScenarioTest(ActivitySource activitySource, ILogger logger)
{
    Console.WriteLine("Test 3: Error scenario");

    using var activity = activitySource.StartActivity("ErrorOperation", ActivityKind.Internal);
    activity?.SetTag("test.name", "error-scenario");

    logger.LogInformation("Starting operation that will fail");

    await Task.Delay(50);

    try
    {
        throw new InvalidOperationException("Simulated error for testing");
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Operation failed with error: {ErrorMessage}", ex.Message);

        activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
        activity?.AddException(ex);
        activity?.SetTag("error", true);
        activity?.SetTag("error.type", ex.GetType().Name);
    }

    Console.WriteLine("  - Completed (with simulated error)");
}

static async Task RunHttpClientTest(ActivitySource activitySource, ILogger logger)
{
    Console.WriteLine("Test 4: HTTP client trace");

    using var activity = activitySource.StartActivity("HttpClientOperation", ActivityKind.Client);
    activity?.SetTag("test.name", "http-client");

    using var httpClient = new HttpClient();

    try
    {
        logger.LogInformation("Making HTTP request to httpbin.org");

        var response = await httpClient.GetAsync("https://httpbin.org/get");

        activity?.SetTag("http.status_code", (int)response.StatusCode);

        logger.LogInformation("HTTP request completed with status {StatusCode}", response.StatusCode);

        activity?.SetStatus(ActivityStatusCode.Ok);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "HTTP request failed: {Message}", ex.Message);
        activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
    }

    Console.WriteLine("  - Completed");
}

static async Task RunBatchProcessingTest(ActivitySource activitySource, ILogger logger)
{
    Console.WriteLine("Test 5: Batch processing simulation");

    using var batchActivity = activitySource.StartActivity("BatchProcessing", ActivityKind.Internal);
    batchActivity?.SetTag("batch.size", 5);

    logger.LogInformation("Starting batch processing of {BatchSize} items", 5);

    var random = new Random();

    for (int i = 0; i < 5; i++)
    {
        using var itemActivity = activitySource.StartActivity("ProcessItem", ActivityKind.Internal);
        itemActivity?.SetTag("item.index", i);
        itemActivity?.SetTag("item.id", Guid.NewGuid().ToString());

        var processingTime = random.Next(50, 150);

        logger.LogDebug("Processing item {ItemIndex} (estimated time: {ProcessingTime}ms)", i, processingTime);

        await Task.Delay(processingTime);

        if (random.NextDouble() < 0.3)
        {
            logger.LogWarning("Item {ItemIndex} took longer than expected", i);
        }

        itemActivity?.SetStatus(ActivityStatusCode.Ok);
    }

    logger.LogInformation("Batch processing completed");
    batchActivity?.SetStatus(ActivityStatusCode.Ok);

    Console.WriteLine("  - Completed");
}
