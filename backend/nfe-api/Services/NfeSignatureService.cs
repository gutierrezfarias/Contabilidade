using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Xml;
using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class NfeSignatureService
{
    public NfeSignedXml SignInfNfe(string xml, X509Certificate2 certificate, string accessKey)
    {
        return SignElement(xml, certificate, "infNFe", $"NFe{accessKey}");
    }

    public NfeSignedXml SignElement(string xml, X509Certificate2 certificate, string elementName, string referenceId)
    {
        var document = new XmlDocument
        {
            PreserveWhitespace = true
        };
        document.LoadXml(xml);

        var signedXml = new SignedXml(document)
        {
            SigningKey = certificate.GetRSAPrivateKey()
        };

        var reference = new Reference($"#{referenceId}");
        reference.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        reference.AddTransform(new XmlDsigC14NTransform());
        reference.DigestMethod = SignedXml.XmlDsigSHA1Url;

        signedXml.AddReference(reference);
        signedXml.SignedInfo!.CanonicalizationMethod = SignedXml.XmlDsigC14NTransformUrl;
        signedXml.SignedInfo.SignatureMethod = SignedXml.XmlDsigRSASHA1Url;

        var keyInfo = new KeyInfo();
        keyInfo.AddClause(new KeyInfoX509Data(certificate));
        signedXml.KeyInfo = keyInfo;
        signedXml.ComputeSignature();

        var signature = signedXml.GetXml();
        var target = document.GetElementsByTagName(elementName)[0]
            ?? throw new InvalidOperationException($"Tag {elementName} nao encontrada para assinatura.");
        target.ParentNode?.InsertAfter(document.ImportNode(signature, true), target);

        return new NfeSignedXml
        {
            AccessKey = referenceId.StartsWith("NFe", StringComparison.OrdinalIgnoreCase)
                ? referenceId[3..]
                : referenceId,
            SignedXml = document.OuterXml
        };
    }
}
