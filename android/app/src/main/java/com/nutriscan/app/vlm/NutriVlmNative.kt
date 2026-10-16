package com.nutriscan.app.vlm

/** Liaison JNI vers libnutrivlm.so — à n'utiliser QUE dans LocalVlmService (processus :vlm). */
object NutriVlmNative {
    init { System.loadLibrary("nutrivlm") }

    @JvmStatic external fun loadModels(modelPath: String, mmprojPath: String, nThreads: Int, nCtx: Int, useGpu: Boolean): Boolean
    @JvmStatic external fun analyze(image: ByteArray, system: String, user: String, maxTokens: Int): String?
    @JvmStatic external fun unload()
    @JvmStatic external fun lastError(): String
    /** "vulkan" si le GPU est réellement utilisé, sinon "cpu". */
    @JvmStatic external fun backend(): String
    /** Vrai si le préfixe du prompt (consignes) venait du cache lors de la dernière analyse. */
    @JvmStatic external fun lastPrefixCached(): Boolean
    @JvmStatic external fun lastPromptTokens(): Int
}
