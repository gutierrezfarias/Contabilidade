using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public interface IAccountingIntegrationProvider
{
    string Provider { get; }
    Task<AccountingProviderConnectionResult> TestConnectionAsync(
        AccountingIntegrationDto integration,
        CancellationToken cancellationToken);
    Task<AccountingProviderSyncResult> SyncAsync(
        AccountingProviderSyncRequest request,
        AccountingIntegrationDto integration,
        string userId,
        CancellationToken cancellationToken);
}

public sealed class ManualImportProvider(SupabaseAccountingRepository repository) : IAccountingIntegrationProvider
{
    public string Provider => "manual";

    public Task<AccountingProviderConnectionResult> TestConnectionAsync(
        AccountingIntegrationDto integration,
        CancellationToken cancellationToken)
    {
        return Task.FromResult(new AccountingProviderConnectionResult
        {
            Ok = true,
            Provider = Provider,
            Status = "available",
            Message = $"Integracao manual '{integration.Name}' pronta para importar CSV ou JSON.",
            RecommendedAction = "Use o assistente de importacao manual para carregar arquivos exportados do sistema contabil."
        });
    }

    public async Task<AccountingProviderSyncResult> SyncAsync(
        AccountingProviderSyncRequest request,
        AccountingIntegrationDto integration,
        string userId,
        CancellationToken cancellationToken)
    {
        var correlationId = Guid.NewGuid().ToString("N");
        var syncRunId = await repository.CreateSyncRunAsync(
            request.OrganizationId,
            request.IntegrationId,
            "",
            Provider,
            request.SyncType,
            correlationId,
            userId,
            cancellationToken);

        await repository.CompleteSyncRunAsync(
            syncRunId,
            "completed",
            "Integracao manual nao executa busca externa. Importe arquivos para criar registros.",
            0,
            0,
            0,
            0,
            0,
            0,
            cancellationToken);

        return new AccountingProviderSyncResult
        {
            Ok = true,
            SyncRunId = syncRunId,
            Status = "completed",
            Message = "Sincronizacao manual registrada. Nenhuma chamada externa foi feita."
        };
    }
}

public sealed class NetSpeedProvider(SupabaseAccountingRepository repository) : IAccountingIntegrationProvider
{
    public string Provider => "netspeed";

    public Task<AccountingProviderConnectionResult> TestConnectionAsync(
        AccountingIntegrationDto integration,
        CancellationToken cancellationToken)
    {
        var hasEndpoint = !string.IsNullOrWhiteSpace(integration.BaseUrl)
            && integration.ConnectionType is "api" or "webservice";

        return Task.FromResult(new AccountingProviderConnectionResult
        {
            Ok = hasEndpoint,
            Provider = Provider,
            Status = hasEndpoint ? "configured_pending_contract" : "not_configured",
            Message = hasEndpoint
                ? "Endpoint informado. A chamada real depende da documentacao oficial da NetSpeed."
                : "NetSpeed sem API oficial configurada. Use FileImport/Manual ate obter documentacao.",
            RecommendedAction = "Confirme com a NetSpeed se ha API REST, Web Service, homologacao, limites e permissao de integracao."
        });
    }

    public async Task<AccountingProviderSyncResult> SyncAsync(
        AccountingProviderSyncRequest request,
        AccountingIntegrationDto integration,
        string userId,
        CancellationToken cancellationToken)
    {
        var correlationId = Guid.NewGuid().ToString("N");
        var syncRunId = await repository.CreateSyncRunAsync(
            request.OrganizationId,
            request.IntegrationId,
            "",
            Provider,
            request.SyncType,
            correlationId,
            userId,
            cancellationToken);

        await repository.CompleteSyncRunAsync(
            syncRunId,
            "failed",
            "NetSpeedProvider criado, mas sem endpoint oficial/documentado. Nenhuma chamada externa foi executada.",
            0,
            0,
            0,
            0,
            0,
            1,
            cancellationToken);

        return new AccountingProviderSyncResult
        {
            Ok = false,
            SyncRunId = syncRunId,
            Status = "not_configured",
            Message = "NetSpeed ainda depende de documentacao oficial de integracao."
        };
    }
}

public sealed class AccountingProviderRegistry(IEnumerable<IAccountingIntegrationProvider> providers)
{
    public IAccountingIntegrationProvider Resolve(string provider)
    {
        return providers.FirstOrDefault(item => item.Provider.Equals(provider, StringComparison.OrdinalIgnoreCase))
            ?? providers.First(item => item.Provider == "manual");
    }
}
