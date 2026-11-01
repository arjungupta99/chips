package chat.chips.framecipher

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.jni.NativeArrayBuffer
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array
import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-GCM for the tunnel, in the platform's own cipher (ADR 0152): the Android half of
 * `FrameCipherModule.swift`, which says why. Synchronous, one call each way.
 */
class FrameCipherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChipsFrameCipher")

    // The ciphertext with its sixteen-byte tag after it, as WebCrypto (and javax.crypto) return it.
    Function("seal") { key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array, plaintext: Uint8Array ->
      arrayBuffer(cipher(Cipher.ENCRYPT_MODE, key, iv, additionalData).doFinal(bytesOf(plaintext)))
    }

    // Throws when the tag does not match, as WebCrypto does.
    Function("open") { key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array, sealed: Uint8Array ->
      if (sealed.byteLength < TAG_BYTES) throw TooShortException()
      arrayBuffer(cipher(Cipher.DECRYPT_MODE, key, iv, additionalData).doFinal(bytesOf(sealed)))
    }
  }
}

private const val TAG_BYTES = 16

private fun cipher(mode: Int, key: Uint8Array, iv: Uint8Array, additionalData: Uint8Array): Cipher {
  val made = Cipher.getInstance("AES/GCM/NoPadding")
  made.init(mode, SecretKeySpec(bytesOf(key), "AES"), GCMParameterSpec(TAG_BYTES * 8, bytesOf(iv)))
  if (additionalData.byteLength > 0) made.updateAAD(bytesOf(additionalData))
  return made
}

private fun bytesOf(array: Uint8Array): ByteArray {
  val out = ByteArray(array.byteLength)
  if (out.isNotEmpty()) array.read(out, 0, out.size)
  return out
}

private fun arrayBuffer(bytes: ByteArray): NativeArrayBuffer {
  val direct = ByteBuffer.allocateDirect(bytes.size)
  direct.put(bytes)
  direct.rewind()
  return NativeArrayBuffer.wrap(direct)
}

internal class TooShortException : CodedException("A sealed frame is at least its sixteen-byte tag")
