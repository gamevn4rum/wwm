using System.Security.Cryptography;
using System.Text;

namespace Wwm.Core.Util;

/// <summary>
/// Change-detection hashing (PLAN §6): the sync hashes a normalized payload and
/// compares against the last hash held in Function Storage, so SQL is only woken
/// when data actually changed.
/// </summary>
public static class Hashing
{
    /// <summary>Lower-case hex SHA-256 of a UTF-8 string.</summary>
    public static string Sha256Hex(string payload)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
        return Convert.ToHexStringLower(bytes);
    }
}
