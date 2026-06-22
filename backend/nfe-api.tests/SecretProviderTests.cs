using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class SecretProviderTests
{
    [Fact]
    public void GetOptional_returns_missing_without_exposing_secret_value()
    {
        var key = UniqueKey();
        Environment.SetEnvironmentVariable(key, null);
        var provider = new EnvironmentSecretProvider();

        var result = provider.GetOptional(key);

        Assert.False(result.Found);
        Assert.Equal("", result.Value);
    }

    [Fact]
    public void GetRequired_fails_with_secret_name_but_without_secret_value()
    {
        var key = UniqueKey();
        Environment.SetEnvironmentVariable(key, null);
        var provider = new EnvironmentSecretProvider();

        var error = Assert.Throws<InvalidOperationException>(() => provider.GetRequired(key));

        Assert.Contains(key, error.Message);
        Assert.DoesNotContain("service_role", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("jwt", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void GetRequired_returns_configured_value_to_backend_only()
    {
        var key = UniqueKey();
        Environment.SetEnvironmentVariable(key, "secret-value");
        var provider = new EnvironmentSecretProvider();

        var result = provider.GetRequired(key);

        Assert.True(result.Found);
        Assert.Equal("secret-value", result.Value);
    }

    private static string UniqueKey() => $"CONT_HUB_TEST_SECRET_{Guid.NewGuid():N}";
}
