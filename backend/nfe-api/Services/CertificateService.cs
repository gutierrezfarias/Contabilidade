using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class CertificateService
{
    public X509Certificate2 LoadA1Certificate(SupabaseCertificate certificate)
    {
        if (string.IsNullOrWhiteSpace(certificate.CertificatePassword))
        {
            throw new InvalidOperationException("Senha do certificado nao cadastrada.");
        }

        return LoadA1Certificate(ReadPfxBytes(certificate), certificate.CertificatePassword);
    }

    public X509Certificate2 LoadA1Certificate(byte[] bytes, string password)
    {
        return new X509Certificate2(
            bytes,
            password,
            X509KeyStorageFlags.MachineKeySet
            | X509KeyStorageFlags.Exportable
            | X509KeyStorageFlags.EphemeralKeySet);
    }

    public CertificateValidationResult ValidateA1Certificate(SupabaseCertificate certificate) =>
        ValidateA1Certificate(ReadPfxBytes(certificate), certificate.CertificatePassword);

    public CertificateValidationResult ValidateA1Certificate(byte[] bytes, string password)
    {
        X509Certificate2 certificate;
        try
        {
            certificate = LoadA1Certificate(bytes, password);
        }
        catch (CryptographicException)
        {
            return new CertificateValidationResult(
                false,
                ["Nao foi possivel abrir o certificado. Confirme se o arquivo e a senha estao corretos."],
                "",
                "",
                DateTimeOffset.MinValue,
                DateTimeOffset.MinValue);
        }

        using (certificate)
        {
            var errors = new List<string>();
            var now = DateTimeOffset.UtcNow;

            if (!certificate.HasPrivateKey)
            {
                errors.Add("Certificado sem chave privada.");
            }

            if (certificate.NotBefore.ToUniversalTime() > now.UtcDateTime)
            {
                errors.Add("Certificado ainda nao esta valido.");
            }

            if (certificate.NotAfter.ToUniversalTime() <= now.UtcDateTime)
            {
                errors.Add("Certificado vencido.");
            }

            if (!AllowsClientAuthentication(certificate))
            {
                errors.Add("Certificado nao permite autenticacao de cliente.");
            }

            return new CertificateValidationResult(
                errors.Count == 0,
                errors,
                certificate.Subject,
                ExtractCnpj(certificate),
                new DateTimeOffset(certificate.NotBefore),
                new DateTimeOffset(certificate.NotAfter));
        }
    }

    private static byte[] ReadPfxBytes(SupabaseCertificate certificate)
    {
        if (string.IsNullOrWhiteSpace(certificate.CertificateFileData))
        {
            throw new InvalidOperationException("Certificado PFX/P12 nao anexado.");
        }

        try
        {
            var base64 = certificate.CertificateFileData.Contains(',')
                ? certificate.CertificateFileData.Split(',').Last()
                : certificate.CertificateFileData;
            return Convert.FromBase64String(base64);
        }
        catch (FormatException)
        {
            throw new InvalidOperationException("Arquivo do certificado invalido. Envie um PFX/P12 valido.");
        }
    }

    private static bool AllowsClientAuthentication(X509Certificate2 certificate)
    {
        var eku = certificate.Extensions.OfType<X509EnhancedKeyUsageExtension>().FirstOrDefault();
        if (eku is null)
        {
            return true;
        }

        return eku.EnhancedKeyUsages
            .Cast<Oid>()
            .Any(oid => oid.Value == "1.3.6.1.5.5.7.3.2");
    }

    private static string ExtractCnpj(X509Certificate2 certificate)
    {
        var values = new[]
        {
            certificate.Subject,
            certificate.Issuer,
            certificate.GetNameInfo(X509NameType.SimpleName, false)
        };

        return values
            .Select(value => NfeText.Digits(value))
            .Select(digits => digits.Length >= 14 ? digits[^14..] : "")
            .FirstOrDefault(value => value.Length == 14)
            ?? "";
    }
}

public sealed record CertificateValidationResult(
    bool IsValid,
    IReadOnlyList<string> Errors,
    string Subject,
    string Cnpj,
    DateTimeOffset ValidFrom,
    DateTimeOffset ValidTo);
