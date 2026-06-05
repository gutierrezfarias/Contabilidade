using System.Xml;
using System.Xml.Schema;

namespace ContHub.NfeApi.Services;

public sealed class NfeSchemaValidationService(IConfiguration configuration)
{
    private readonly string _schemasPath = configuration["Nfe:SchemasPath"] ?? "Schemas/NFe/v4.00";

    public IReadOnlyList<string> Validate(string xml, string schemaFileName)
    {
        var schemaPath = Path.Combine(AppContext.BaseDirectory, _schemasPath, schemaFileName);
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
}

