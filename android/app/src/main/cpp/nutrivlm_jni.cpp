// Moteur VLM local (MiniCPM-V & co) — llama.cpp + mtmd.
// Chargé UNIQUEMENT dans le processus « :vlm » (LocalVlmService) : un crash natif
// ou un manque de mémoire ne ferme jamais l'application principale.
#include <jni.h>
#include <android/log.h>
#include <mutex>
#include <string>
#include <vector>

#include "llama.h"
#include "mtmd.h"
#include "mtmd-helper.h"

#define TAG "NutriVlm"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

namespace {
std::mutex g_mutex;
llama_model *g_model = nullptr;
llama_context *g_ctx = nullptr;
mtmd_context *g_mtmd = nullptr;
std::string g_last_error;

void release_all() {
  if (g_mtmd) { mtmd_free(g_mtmd); g_mtmd = nullptr; }
  if (g_ctx) { llama_free(g_ctx); g_ctx = nullptr; }
  if (g_model) { llama_model_free(g_model); g_model = nullptr; }
}

std::string jstr(JNIEnv *env, jstring s) {
  if (!s) return {};
  const char *c = env->GetStringUTFChars(s, nullptr);
  std::string out(c ? c : "");
  if (c) env->ReleaseStringUTFChars(s, c);
  return out;
}

/** Applique le gabarit de conversation embarqué dans le GGUF (repli ChatML). */
std::string build_prompt(const std::string &system, const std::string &user) {
  const char *tmpl = llama_model_chat_template(g_model, nullptr);
  llama_chat_message msgs[2] = {{"system", system.c_str()}, {"user", user.c_str()}};
  std::vector<char> buf(system.size() + user.size() + 1024);
  int n = llama_chat_apply_template(tmpl, msgs, 2, true, buf.data(), (int32_t)buf.size());
  if (n > (int)buf.size()) {
    buf.resize(n + 1);
    n = llama_chat_apply_template(tmpl, msgs, 2, true, buf.data(), (int32_t)buf.size());
  }
  if (n < 0) {
    return "<|im_start|>system\n" + system + "<|im_end|>\n<|im_start|>user\n" + user +
           "<|im_end|>\n<|im_start|>assistant\n";
  }
  return std::string(buf.data(), n);
}
}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_nutriscan_app_vlm_NutriVlmNative_loadModels(JNIEnv *env, jclass, jstring jmodel, jstring jmmproj,
                                                      jint nThreads, jint nCtx) {
  std::lock_guard<std::mutex> lock(g_mutex);
  release_all();
  llama_backend_init();

  const std::string modelPath = jstr(env, jmodel);
  const std::string mmprojPath = jstr(env, jmmproj);

  llama_model_params mp = llama_model_default_params();
  mp.n_gpu_layers = 0;
  g_model = llama_model_load_from_file(modelPath.c_str(), mp);
  if (!g_model) { g_last_error = "Modèle GGUF illisible ou incompatible : " + modelPath; release_all(); return JNI_FALSE; }

  llama_context_params cp = llama_context_default_params();
  cp.n_ctx = nCtx > 0 ? nCtx : 4096;
  cp.n_batch = 512;
  cp.n_threads = nThreads > 0 ? nThreads : 4;
  cp.n_threads_batch = cp.n_threads;
  g_ctx = llama_init_from_model(g_model, cp);
  if (!g_ctx) { g_last_error = "Contexte d'inférence impossible (mémoire ?)"; release_all(); return JNI_FALSE; }

  mtmd_context_params mpp = mtmd_context_params_default();
  mpp.use_gpu = false;
  mpp.n_threads = cp.n_threads;
  mpp.print_timings = false;
  g_mtmd = mtmd_init_from_file(mmprojPath.c_str(), g_model, mpp);
  if (!g_mtmd) { g_last_error = "Projecteur visuel (mmproj) illisible ou incompatible : " + mmprojPath; release_all(); return JNI_FALSE; }

  LOGI("Modèles chargés (ctx=%d, threads=%d)", cp.n_ctx, cp.n_threads);
  g_last_error.clear();
  return JNI_TRUE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nutriscan_app_vlm_NutriVlmNative_analyze(JNIEnv *env, jclass, jbyteArray jimage, jstring jsystem,
                                                   jstring juser, jint maxTokens) {
  std::lock_guard<std::mutex> lock(g_mutex);
  if (!g_model || !g_ctx || !g_mtmd) { g_last_error = "Modèles non chargés"; return nullptr; }

  jsize len = env->GetArrayLength(jimage);
  std::vector<unsigned char> bytes(len);
  env->GetByteArrayRegion(jimage, 0, len, reinterpret_cast<jbyte *>(bytes.data()));

  mtmd_bitmap *bmp = mtmd_helper_bitmap_init_from_buf(g_mtmd, bytes.data(), bytes.size());
  if (!bmp) { g_last_error = "Image illisible"; return nullptr; }

  const std::string user = std::string(mtmd_default_marker()) + "\n" + jstr(env, juser);
  const std::string prompt = build_prompt(jstr(env, jsystem), user);

  llama_memory_clear(llama_get_memory(g_ctx), true);

  mtmd_input_chunks *chunks = mtmd_input_chunks_init();
  mtmd_input_text text;
  text.text = prompt.c_str();
  text.add_special = true;
  text.parse_special = true;
  const mtmd_bitmap *bitmaps[1] = {bmp};
  int32_t rc = mtmd_tokenize(g_mtmd, chunks, &text, bitmaps, 1);
  mtmd_bitmap_free(bmp);
  if (rc != 0) { mtmd_input_chunks_free(chunks); g_last_error = "Tokenisation multimodale impossible"; return nullptr; }

  llama_pos n_past = 0;
  if (mtmd_helper_eval_chunks(g_mtmd, g_ctx, chunks, 0, 0, 512, true, &n_past) != 0) {
    mtmd_input_chunks_free(chunks);
    g_last_error = "Évaluation de l'image impossible (mémoire ?)";
    return nullptr;
  }
  mtmd_input_chunks_free(chunks);

  // Décodage glouton (température 0) : sortie déterministe, JSON stable.
  llama_sampler *smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
  llama_sampler_chain_add(smpl, llama_sampler_init_greedy());
  const llama_vocab *vocab = llama_model_get_vocab(g_model);

  std::string out;
  char piece[256];
  for (int i = 0; i < (maxTokens > 0 ? maxTokens : 384); ++i) {
    llama_token id = llama_sampler_sample(smpl, g_ctx, -1);
    if (llama_vocab_is_eog(vocab, id)) break;
    int n = llama_token_to_piece(vocab, id, piece, sizeof(piece), 0, true);
    if (n > 0) out.append(piece, n);
    llama_batch b = llama_batch_get_one(&id, 1);
    if (llama_decode(g_ctx, b) != 0) break;
  }
  llama_sampler_free(smpl);
  return env->NewStringUTF(out.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_nutriscan_app_vlm_NutriVlmNative_unload(JNIEnv *, jclass) {
  std::lock_guard<std::mutex> lock(g_mutex);
  release_all();
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_nutriscan_app_vlm_NutriVlmNative_lastError(JNIEnv *env, jclass) {
  return env->NewStringUTF(g_last_error.c_str());
}
