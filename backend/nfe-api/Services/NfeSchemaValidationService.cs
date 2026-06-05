using System.Xml;
using System.Xml.Schema;

namespace ContHub.NfeApi.Services;

public sealed class NfeSchemaValidationService(IConfiguration configuration)
{
    private readonly string _schemasPath = configuration["Nfe:SchemasPath"] ?? "Schemas/NFe/v4.00";
    private static readonly string[] RequiredSchemas =
    [
        "enviNFe_v4.00.xsd",
        "consReciNFe_v4.00.xsd",
        "consSitNFe_v4.00.xsd",
        "inutNFe_v4.00.xsd",
        "leiauteNFe_v4.00.xsd",
        "nfe_v4.00.xsd",
        "DFeTiposBasicos_v1.00.xsd",
        "tiposBasico_v4.00.xsd",
        "xmldsig-core-schema_v1.01.xsd",
        "envEventoCancNFe_v1.00.xsd"
    ];

    public IReadOnlyList<string> MissingRequiredSchemas()
    {
        return RequiredSchemas
            .Where(schema => !File.Exists(SchemaPath(schema)))
            .Select(schema => $"{_schemasPath}/{schema}")
            .ToList();
    }

    public IReadOnlyList<string> Validate(string xml, string schemaFileName)
    {
        var schemaPath = SchemaPath(schemaFileName);
        if (!File.Exists(schemaPath))
        {
            return [$"Schema XSD nao encontrado: {_schemasPath}/{schemaFileName}. Baixe os schemas oficiais da NF-e 4.00 antes de transmitir."];
        }

        var errors = new List<string>();
        var settings = new XmlReaderSettings
        {
            ValidationType = ValidationType.Schema,
            DtdProcessing = DtdProcessing.Prohibit
        };
        settings.Schemas.Add(null, schemaPath);
        settings.ValidationEventHandler += (_, args) => errors.Add(args.Message);

        using var stringReader = new StringReader(xml);
        using var reader = XmlReader.Create(stringReader, settings);
        while (reader.Read())
        {
        }

        return errors;
    }

    private string SchemaPath(string schemaFileName) =>
        Path.Combine(AppContext.BaseDirectory, _schemasPath, schemaFileName);
}
