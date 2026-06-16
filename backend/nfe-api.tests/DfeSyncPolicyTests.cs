using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class DfeSyncPolicyTests
{
    [Fact]
    public void NormalizeMaxCycles_keeps_summary_at_one_and_limits_complete_to_eight()
    {
        Assert.Equal(1, DfeSyncPolicy.NormalizeMaxCycles(1));
        Assert.Equal(8, DfeSyncPolicy.NormalizeMaxCycles(8));
        Assert.Equal(8, DfeSyncPolicy.NormalizeMaxCycles(99));
        Assert.Equal(DfeSyncPolicy.DefaultMaxCycles, DfeSyncPolicy.NormalizeMaxCycles(0));
    }

    [Fact]
    public void MustStopAfterResponse_stops_immediately_on_137_and_656()
    {
        Assert.True(DfeSyncPolicy.MustStopAfterResponse("137", 0, "000000000001219", "000000000001219"));
        Assert.True(DfeSyncPolicy.MustStopAfterResponse("656", 0, "000000000000000", "000000000000000"));
    }

    [Fact]
    public void MustStopAfterResponse_stops_when_ultimo_nsu_reaches_max_nsu()
    {
        Assert.True(DfeSyncPolicy.MustStopAfterResponse("138", 3, "123", "000000000000123"));
        Assert.False(DfeSyncPolicy.MustStopAfterResponse("138", 3, "000000000000123", "000000000000999"));
    }

    [Fact]
    public void NextAllowedAfterResponse_applies_one_hour_after_137_or_656()
    {
        var now = new DateTimeOffset(2026, 6, 16, 10, 0, 0, TimeSpan.Zero);

        Assert.Equal(now.AddHours(1), DfeSyncPolicy.NextAllowedAfterResponse("137", 0, "1", "1", now));
        Assert.Equal(now.AddHours(1), DfeSyncPolicy.NextAllowedAfterResponse("656", 0, "1", "1", now));
    }

    [Fact]
    public void KeepPreviousNsu_keeps_state_for_consumption_abuse_and_service_unavailable()
    {
        Assert.True(DfeSyncPolicy.KeepPreviousNsu("656"));
        Assert.True(DfeSyncPolicy.KeepPreviousNsu("108"));
        Assert.True(DfeSyncPolicy.KeepPreviousNsu("109"));
        Assert.False(DfeSyncPolicy.KeepPreviousNsu("138"));
    }

    [Fact]
    public void PreserveValidMaxNsu_does_not_reduce_existing_max_to_zero()
    {
        Assert.Equal("000000000001500", DfeSyncPolicy.PreserveValidMaxNsu("000000000001500", "000000000000000"));
        Assert.Equal("000000000001700", DfeSyncPolicy.PreserveValidMaxNsu("000000000001500", "000000000001700"));
    }

    [Fact]
    public void HasSuspiciousNsuState_flags_last_nsu_greater_than_max_nsu()
    {
        Assert.True(DfeSyncPolicy.HasSuspiciousNsuState("000000000001219", "000000000000000"));
        Assert.True(DfeSyncPolicy.HasSuspiciousNsuState("000000000001220", "000000000001219"));
        Assert.False(DfeSyncPolicy.HasSuspiciousNsuState("000000000001219", "000000000001219"));
    }

    [Fact]
    public void ExistingXmlIsComplete_detects_integral_existing_xml()
    {
        var existing = new DfeDocument
        {
            HasFullXml = true,
            XmlHash = "hash-1",
            XmlStoragePath = "org/client/xml.xml"
        };
        var incoming = new DfeDocumentWrite
        {
            HasFullXml = true,
            XmlHash = "hash-1"
        };

        Assert.True(DfeSyncPolicy.ExistingXmlIsComplete(existing, incoming));
        Assert.False(DfeSyncPolicy.ExistingXmlIsComplete(existing with { XmlHash = "hash-2" }, incoming));
    }
}
