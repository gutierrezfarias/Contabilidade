namespace ContHub.NfeApi.Services;

public sealed class ForbiddenAccessException(string message) : Exception(message);
