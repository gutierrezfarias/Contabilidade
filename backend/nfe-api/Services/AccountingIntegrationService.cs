using ContHub.NfeApi.Models;

namespace ContHub.NfeApi.Services;

public sealed class AccountingIntegrationService(
    SupabaseNfeRepository nfeRepository,
    SupabaseAccountingRepository accountingRepository,
    AccountingProviderRegistry providerRegistry)
{
    public async Task<List<AccountingIntegrationDto>> ListIntegrationsAsync(
        string organizationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListIntegrationsAsync(organizationId, cancellationToken);
    }

    public async Task<AccountingIntegrationDto> GetIntegrationAsync(
        string organizationId,
        string integrationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.GetIntegrationAsync(organizationId, integrationId, cancellationToken);
    }

    public async Task<AccountingIntegrationDto> CreateIntegrationAsync(
        AccountingIntegrationInput input,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(input.OrganizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.CreateIntegrationAsync(input, userId, cancellationToken);
    }

    public async Task<AccountingIntegrationDto> UpdateIntegrationAsync(
        string organizationId,
        string integrationId,
        AccountingIntegrationInput input,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.UpdateIntegrationAsync(organizationId, integrationId, input, userId, cancellationToken);
    }

    public async Task DeleteIntegrationAsync(
        string organizationId,
        string integrationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        await accountingRepository.SoftDeleteIntegrationAsync(organizationId, integrationId, userId, cancellationToken);
    }

    public async Task<AccountingProviderConnectionResult> TestConnectionAsync(
        string organizationId,
        string integrationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        var integration = await accountingRepository.GetIntegrationAsync(organizationId, integrationId, cancellationToken);
        return await providerRegistry.Resolve(integration.Provider).TestConnectionAsync(integration, cancellationToken);
    }

    public async Task<AccountingProviderSyncResult> SyncAsync(
        AccountingProviderSyncRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(request.OrganizationId, authorizationHeader, cancellationToken);
        var integration = await accountingRepository.GetIntegrationAsync(
            request.OrganizationId,
            request.IntegrationId,
            cancellationToken);
        return await providerRegistry.Resolve(integration.Provider).SyncAsync(
            request,
            integration,
            userId,
            cancellationToken);
    }

    public async Task<List<AccountingIntegrationClientDto>> ListLinkedClientsAsync(
        string organizationId,
        string integrationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListLinkedClientsAsync(organizationId, integrationId, cancellationToken);
    }

    public async Task<AccountingIntegrationClientDto> LinkClientAsync(
        string integrationId,
        AccountingIntegrationClientInput input,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(input.OrganizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.LinkClientAsync(integrationId, input, userId, cancellationToken);
    }

    public async Task UnlinkClientAsync(
        string organizationId,
        string integrationId,
        string linkId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        await accountingRepository.UnlinkClientAsync(organizationId, integrationId, linkId, cancellationToken);
    }

    public async Task<List<AccountingSyncRunDto>> ListSyncRunsAsync(
        string organizationId,
        string integrationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListSyncRunsAsync(organizationId, integrationId, cancellationToken);
    }

    public async Task<AccountingImportPreviewResult> PreviewImportAsync(
        AccountingImportPreviewRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(request.OrganizationId, authorizationHeader, cancellationToken);
        var preview = AccountingImportParser.Preview(request);
        var batchId = await accountingRepository.CreateImportBatchAsync(
            request,
            preview,
            AccountingImportParser.HashContent(request.Content),
            userId,
            cancellationToken);

        await accountingRepository.SaveImportErrorsAsync(
            request.OrganizationId,
            batchId,
            preview.Errors,
            cancellationToken);

        return preview with { BatchId = batchId };
    }

    public async Task<AccountingImportConfirmResult> ConfirmImportAsync(
        AccountingImportConfirmRequest request,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        var userId = await EnsureAccessAsync(request.OrganizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ConfirmImportBatchAsync(
            request.OrganizationId,
            request.BatchId,
            userId,
            cancellationToken);
    }

    public async Task<List<AccountingImportError>> ListImportErrorsAsync(
        string organizationId,
        string batchId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListImportErrorsAsync(organizationId, batchId, cancellationToken);
    }

    public async Task<List<AccountingTaxRecordDto>> ListTaxRecordsAsync(
        string organizationId,
        string? clientId,
        string? competence,
        string? status,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListTaxRecordsAsync(organizationId, clientId, competence, status, cancellationToken);
    }

    public async Task<List<AccountingObligationDto>> ListObligationsAsync(
        string organizationId,
        string? clientId,
        string? competence,
        string? status,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListObligationsAsync(organizationId, clientId, competence, status, cancellationToken);
    }

    public async Task<List<System.Text.Json.JsonElement>> ListGenericRecordsAsync(
        string recordType,
        string organizationId,
        string? clientId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        await EnsureAccessAsync(organizationId, authorizationHeader, cancellationToken);
        return await accountingRepository.ListGenericRecordsAsync(recordType, organizationId, clientId, cancellationToken);
    }

    private async Task<string> EnsureAccessAsync(
        string organizationId,
        string authorizationHeader,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(organizationId))
        {
            throw new InvalidOperationException("Organizacao obrigatoria.");
        }

        var userId = await nfeRepository.RequireUserAsync(authorizationHeader, cancellationToken);
        await nfeRepository.EnsureOrganizationAccessAsync(userId, organizationId, cancellationToken);
        return userId;
    }
}
