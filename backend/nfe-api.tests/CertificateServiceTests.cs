using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ContHub.NfeApi.Services;
using Xunit;

namespace ContHub.NfeApi.Tests;

public sealed class CertificateServiceTests
{
    [Fact]
    public void Validate_rejects_expired_certificate()
    {
        var service = new CertificateService();
        var pfx = CreatePfx(DateTimeOffset.UtcNow.AddYears(-2), DateTimeOffset.UtcNow.AddYears(-1));

        var result = service.ValidateA1Certificate(pfx, "123456");

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("vencido", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Validate_rejects_certificate_without_private_key()
    {
        var service = new CertificateService();
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=CONT HUB TESTE", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));
        var publicOnly = certificate.Export(X509ContentType.Cert);

        var result = service.ValidateA1Certificate(publicOnly, "");

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("chave privada", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Validate_rejects_wrong_password()
    {
        var service = new CertificateService();
        var pfx = CreatePfx(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddYears(1));

        var result = service.ValidateA1Certificate(pfx, "senha-errada");

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Contains("senha", StringComparison.OrdinalIgnoreCase));
    }

    private static byte[] CreatePfx(DateTimeOffset validFrom, DateTimeOffset validTo)
    {
        using var rsa = RSA.Create(2048);
        var request = new CertificateRequest("CN=12345678000190 CONT HUB TESTE", rsa, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(
            new X509EnhancedKeyUsageExtension(
                new OidCollection { new Oid("1.3.6.1.5.5.7.3.2") },
                false));
        using var certificate = request.CreateSelfSigned(validFrom, validTo);
        return certificate.Export(X509ContentType.Pfx, "123456");
    }
}
