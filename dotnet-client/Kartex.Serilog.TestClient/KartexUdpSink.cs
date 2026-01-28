using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using Serilog;
using Serilog.Configuration;
using Serilog.Core;
using Serilog.Events;
using Serilog.Formatting.Compact;

namespace Kartex.Serilog;

/// <summary>
/// Serilog sink that sends log events to Kartex Logging Server via UDP with HMAC-SHA256 authentication.
/// Uses Serilog's Compact Log Event Format (CLEF) which is natively supported by Kartex.
/// </summary>
public sealed class KartexUdpSink : ILogEventSink, IDisposable
{
    private readonly string _host;
    private readonly int _port;
    private readonly byte[] _secret;
    private readonly UdpClient _client;
    private readonly CompactJsonFormatter _formatter;
    private bool _disposed;

    /// <summary>
    /// Creates a new Kartex UDP sink.
    /// </summary>
    /// <param name="host">The Kartex server hostname or IP address.</param>
    /// <param name="port">The Kartex server UDP port (default: 9514).</param>
    /// <param name="secret">The HMAC-SHA256 secret for authentication.</param>
    public KartexUdpSink(string host, int port, string secret)
    {
        _host = host ?? throw new ArgumentNullException(nameof(host));
        _port = port;
        _secret = Encoding.UTF8.GetBytes(secret ?? throw new ArgumentNullException(nameof(secret)));
        _client = new UdpClient();
        _formatter = new CompactJsonFormatter();
    }

    /// <summary>
    /// Emit a log event to the Kartex server.
    /// </summary>
    public void Emit(LogEvent logEvent)
    {
        if (_disposed) return;

        try
        {
            // Format the log event as CLEF JSON
            using var writer = new StringWriter();
            _formatter.Format(logEvent, writer);
            var payload = Encoding.UTF8.GetBytes(writer.ToString());

            // Generate HMAC-SHA256 signature (32 bytes)
            using var hmac = new HMACSHA256(_secret);
            var signature = hmac.ComputeHash(payload);

            // Create packet: [32-byte signature][JSON payload]
            var packet = new byte[signature.Length + payload.Length];
            Buffer.BlockCopy(signature, 0, packet, 0, signature.Length);
            Buffer.BlockCopy(payload, 0, packet, signature.Length, payload.Length);

            // Send via UDP
            _client.Send(packet, packet.Length, _host, _port);
        }
        catch (Exception ex)
        {
            // Log to console as fallback - don't throw to avoid breaking the application
            Console.Error.WriteLine($"[KartexUdpSink] Failed to send log: {ex.Message}");
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _client.Dispose();
    }
}

/// <summary>
/// Extension methods for configuring the Kartex UDP sink.
/// </summary>
public static class KartexSinkExtensions
{
    /// <summary>
    /// Write log events to a Kartex Logging Server via UDP.
    /// </summary>
    /// <param name="loggerConfiguration">The logger sink configuration.</param>
    /// <param name="host">The Kartex server hostname or IP address (default: localhost).</param>
    /// <param name="port">The Kartex server UDP port (default: 9514).</param>
    /// <param name="secret">The HMAC-SHA256 secret for authentication.</param>
    /// <param name="restrictedToMinimumLevel">The minimum log level to send.</param>
    /// <returns>Logger configuration for method chaining.</returns>
    public static LoggerConfiguration KartexUdp(
        this LoggerSinkConfiguration loggerConfiguration,
        string host = "localhost",
        int port = 9514,
        string secret = "change-this-secret-key-in-production",
        LogEventLevel restrictedToMinimumLevel = LogEventLevel.Verbose)
    {
        return loggerConfiguration.Sink(
            new KartexUdpSink(host, port, secret),
            restrictedToMinimumLevel);
    }
}
