package com.stockcheck.app.export

import net.lingala.zip4j.ZipFile
import net.lingala.zip4j.model.ZipParameters
import net.lingala.zip4j.model.enums.AesKeyStrength
import net.lingala.zip4j.model.enums.CompressionLevel
import net.lingala.zip4j.model.enums.EncryptionMethod
import java.io.File

/**
 * Wraps an exported file in an AES-256 encrypted archive.
 *
 * Neither format can carry a password of its own that means anything. A CSV
 * is plain text with no notion of encryption at all. An xlsx has sheet
 * protection, but that is a 16-bit hash free tools strip in seconds — it stops
 * an accidental edit and nothing more.
 *
 * The container can. Without the password the archive cannot be opened and
 * its contents cannot be read, and that is real cryptography rather than a
 * flag asking politely.
 *
 * What it does NOT do, because nothing can: stop someone who has the password
 * from extracting the file and editing their copy. A copy handed to another
 * person is theirs. What stays authoritative is the record in the app, and
 * the audit trail behind it.
 */
object EncryptedBundle {

    /**
     * Produces `<name>.zip` beside [source] containing it, encrypted with
     * [password], and deletes the plaintext original.
     *
     * Returns the archive. The original is removed rather than left in the
     * cache directory, where it would sit unprotected next to the very file
     * meant to protect it.
     */
    fun wrap(source: File, password: String): File {
        require(password.isNotBlank()) { "An export password is needed to encrypt the file." }

        val archive = File(source.parentFile, source.nameWithoutExtension + ".zip")
        if (archive.exists()) archive.delete()

        ZipFile(archive, password.toCharArray()).use { zip ->
            zip.addFile(
                source,
                ZipParameters().apply {
                    isEncryptFiles = true
                    // AES-256 rather than the legacy ZipCrypto, which is
                    // broken well enough to be worth avoiding entirely.
                    encryptionMethod = EncryptionMethod.AES
                    aesKeyStrength = AesKeyStrength.KEY_STRENGTH_256
                    compressionLevel = CompressionLevel.NORMAL
                    fileNameInZip = source.name
                },
            )
        }

        source.delete()
        return archive
    }
}
