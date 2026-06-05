using System.Security.Cryptography.X509Certificates;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class CertificateService
{
    public X509Certificate2 LoadA1Certificate(SupabaseCertificate certificate)
    {
        if (string.IsNullOrWhiteSpace(certificate.CertificateFileData))
        {
            throw new InvalidOperationException("Certificado PFX/P12 nao anexado.");
        }

        if (string.IsNullOrWhiteSpace(certificate.CertificatePassword))
        {
            throw new InvalidOperationException("Senha do certificado nao cadastrada.");
        }

        var base64 = certificate.CertificateFileData.Contains(',')
            ? certificate.CertificateFileData.Split(',').Last()
            : certificate.CertificateFileData;
        var bytes = Convert.FromBase64String(base64);

        return new X509Certificate2(
            bytes,
            certificate.CertificatePassword,
            X509KeyStorageFlags.MachineKeySet
            | X509KeyStorageFlags.Exportable
            | X509KeyStorageFlags.EphemeralKeySet);
    }
}

