namespace ContHub.NfeApi.Services;

public sealed class NfeLogService(SupabaseNfeRepository repository)
{
    public Task SaveAsync(
        string organizationId,
        string companyId,
        string? documentId,
        string accessKey,
        string tipoEvento,
        string ambiente,
        string uf,
        string endpoint,
        string cstat,
        string xmotivo,
        bool sucesso,
        string erroTecnico,
        CancellationToken cancellationToken)
    {
        // Nao salve XML, certificado ou senha em logs. Apenas metadados fiscais/tecnicos.
        return repository.SaveLogAsync(
            organizationId,
            companyId,
            documentId,
            accessKey,
            tipoEvento,
            ambiente,
            uf,
            endpoint,
            cstat,
            xmotivo,
            sucesso,
            erroTecnico,
            cancellationToken);
    }
}

