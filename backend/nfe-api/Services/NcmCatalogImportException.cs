namespace ContHub.NfeApi.Services;

public sealed class NcmCatalogImportException(
    string code,
    string detail,
    string receivedContentType = "",
    int statusCode = StatusCodes.Status400BadRequest) : Exception(detail)
{
    public string Code { get; } = code;
    public string Detail { get; } = detail;
    public string ReceivedContentType { get; } = receivedContentType;
    public int StatusCode { get; } = statusCode;
}
