using ContHub.NfeApi.Models;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class SerproDomainRulesTests
{
    [Fact]
    public void Fingerprint_does_not_return_raw_secret()
    {
        var fingerprint = SerproSecretProtector.Fingerprint("segredo-real", "pepper");

        Assert.NotEmpty(fingerprint);
        Assert.DoesNotContain("segredo-real", fingerprint);
        Assert.Equal(fingerprint, SerproSecretProtector.Fingerprint("segredo-real", "pepper"));
    }

    [Fact]
    public void ResolveMode_uses_direct_credentials_without_wallet_when_direct_is_ready()
    {
        var settings = Settings("direct_serpro", directEnabled: true);
        var managed = Credential("cont_hub", ready: true);
        var direct = Credential("contador", ready: true);

        var result = SerproDomainRules.ResolveMode(settings, managed, direct);

        Assert.Equal("direct_serpro", result.BillingMode);
        Assert.Equal("contador", result.CredentialOwner);
        Assert.True(result.CredentialsReady);
        Assert.False(result.WalletRequired);
    }

    [Fact]
    public void ResolveMode_blocks_direct_when_credentials_are_missing_and_fallback_is_disabled()
    {
        var settings = Settings("direct_serpro", directEnabled: true, fallback: false);
        var managed = Credential("cont_hub", ready: true);
        var direct = Credential("contador", ready: false);

        var result = SerproDomainRules.ResolveMode(settings, managed, direct);

        Assert.Equal("direct_serpro", result.BillingMode);
        Assert.False(result.CredentialsReady);
        Assert.Contains("fallback", result.BlockReason);
    }

    [Fact]
    public void ResolveMode_falls_back_to_managed_when_allowed()
    {
        var settings = Settings("direct_serpro", managedEnabled: true, directEnabled: true, fallback: true);
        var managed = Credential("cont_hub", ready: true);
        var direct = Credential("contador", ready: false);

        var result = SerproDomainRules.ResolveMode(settings, managed, direct);

        Assert.Equal("cont_hub_managed", result.BillingMode);
        Assert.True(result.CredentialsReady);
        Assert.True(result.WalletRequired);
    }

    [Fact]
    public void HasEnoughWalletBalance_considers_reserved_balance()
    {
        var wallet = new SerproWalletDto("org-1", 100, 70, "BRL", false, 0, 0, "active");

        Assert.True(SerproDomainRules.HasEnoughWalletBalance(wallet, 30));
        Assert.False(SerproDomainRules.HasEnoughWalletBalance(wallet, 31));
    }

    private static SerproOrganizationSettingsDto Settings(
        string mode,
        bool managedEnabled = false,
        bool directEnabled = false,
        bool fallback = false)
    {
        return new SerproOrganizationSettingsDto(
            "org-1",
            mode,
            mode,
            "homologacao",
            "active",
            managedEnabled,
            directEnabled,
            fallback,
            0,
            0,
            "",
            "");
    }

    private static SerproCredentialStatusDto Credential(string owner, bool ready)
    {
        return new SerproCredentialStatusDto(
            owner,
            "homologacao",
            ready ? "active" : "draft",
            ready,
            ready,
            ready ? "vault://secret" : "",
            false,
            "",
            "");
    }
}
