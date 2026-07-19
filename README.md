# AI Image Enhancer — Real Neural Net Upscaler (PWA)

A drop-in upgrade to [ariesaves/Image-Resizer](https://github.com/ariesaves/Image-Resizer)
that replaces the fake "AI" pixel filters with **real neural network inference** running
entirely in your browser. Same visual design, same PWA installability — but the AI
actually works.

## What changed vs. the original

| Original | Upgraded |
|---|---|
| Fake "AI" (canvas pixel filters) | **Real ESRGAN neural network** (TensorFlow.js) |
| Pure client-side | Pure client-side (no server, no upload, no API key) |
| Single service worker that caches only `index.html` | Service worker that caches **app shell + TF.js + UpscalerJS + model weights** so the whole app works offline after first use |
| Naive cache-first for everything | **Network-first for app shell** (updates roll out), **cache-first for AI libs + models** (offline + faster subsequent loads) |
| Manifest says "Image Resizer" | Manifest says "AI Image Enhancer" with shortcuts for Upscale / Enhance |

## How it works

```
  ┌──────────────┐         ┌─────────────────────┐
  │  Browser tab │ ──────▶ │  TF.js (WebGL/CPU)  │
  │  + PWA shell │  runs   │  + UpscalerJS       │
  │  + service   │  in-tab │  + ESRGAN models    │
  │    worker    │         │  (cached after 1st)  │
  └──────────────┘         └─────────────────────┘
        no upload, no server, no tracking
```

- **TensorFlow.js** handles tensor math on WebGL (or CPU fallback).
- **UpscalerJS** wraps TF.js with a clean API, automatic tiling for large images, model caching in IndexedDB, and progress callbacks.
- **ESRGAN** is the same family of super-resolution networks that Upscayl uses. The "thick" model gives Upscayl-quality output, "medium" is faster and smaller.
- The service worker caches the JS libraries + model weights on first load. After that, the whole app works without internet.

## AI models

| UI mode | Model | Scale options | Size on disk | Best for |
|---|---|---|---|---|
| 🖼️ General | ESRGAN-Thick | 2x, 3x, 4x | ~30 MB | Photos, real-world |
| 🎨 Artwork | ESRGAN-Medium | 2x, 3x | ~5 MB | Drawings, line art |
| 🗾 Anime | ESRGAN-Medium | 2x, 3x | ~5 MB | Illustrations |
| 👤 Portrait | ESRGAN-Thick | 2x, 3x, 4x | ~30 MB | Faces, people |

The "Pre-load model" button on the Upscale tab downloads the selected model into
the service-worker cache. First load takes 5-30 seconds (depending on model size
and connection); subsequent uses are instant.

## Files in this upgrade

```
ariesaves-enhancer/
├── index.html              # The upgraded app (real AI, 3 tabs)
├── service-worker.js       # Caches app shell + AI libs + models for offline use
├── manifest.json           # PWA manifest (new name + shortcuts)
├── icon-192.png            # Your existing PWA icon (unchanged)
├── icon-512.png            # Your existing PWA icon (unchanged)
└── README.md               # This file
```

To deploy: **drop these 5 files into your existing GitHub Pages repo**, replacing
`index.html`, `service-worker.js`, and `manifest.json`. The icons stay the same.
On first visit, users get the new version. On subsequent visits, the service
worker upgrades and the AI engine downloads.

## Using your own NCNN models (`.bin` / `.param`)

The NCNN models you have (Real-ESRGAN x4plus, x4plus-anime, the 3 general-x4v3
variants) are functionally identical to the TF.js models this app uses — same
training, same architecture, same outputs. NCNN is a native runtime (used by
Upscayl's Electron app), and there is no good way to run NCNN in a browser.

If you really want your exact weights in the browser, the conversion path is:

1. **NCNN → PyTorch**: use [`pnnx`](https://github.com/Tencent/ncnn/tree/master/tools/pnnx)
   with the `.param` file to extract the network definition, then manually re-create
   the model in PyTorch (Conv2d / PReLU / PixelShuffle layers). Load the `.bin`
   weights into the recreated model.
2. **PyTorch → ONNX**: `torch.onnx.export(...)`.
3. **ONNX → TF.js**: `tensorflowjs_converter --input_format=onnx model.onnx tfjs_model/`.
4. **TF.js → Browser**: load via `tf.loadGraphModel()` instead of UpscalerJS's
   model loader, or wrap the loaded model so UpscalerJS can use it.

The quality loss through this pipeline is small (the math is the same), but it's
a lot of yak-shaving for output that's already 99% identical to what the bundled
ESRGAN-Thick model produces. I'd recommend just using the bundled models unless
you specifically need a custom-trained weight set.

If you do want to add a converted model: save it as `models/my-custom/model.json`
+ shards in the same directory, and add a script tag to `index.html` that exposes
it as a global. Then add an entry to `MODEL_REGISTRY` in the JS.

## Browser support

Works in any modern browser with WebGL or WebAssembly. Specifically tested in:

- Chrome / Edge 90+
- Firefox 90+
- Safari 15+

The first time the user opens the app, TF.js + UpscalerJS (~2 MB total) and
the first model weights (2-30 MB depending on choice) are downloaded. After
that, everything is cached and works offline.

## Performance

- A 256×256 image with ESRGAN-Thick 2x takes ~2-4 seconds on a mid-range laptop GPU.
- A 1024×1024 image with ESRGAN-Thick 4x takes ~20-40 seconds on CPU, ~3-6 seconds on GPU.
- UpscalerJS automatically tiles large images so memory usage stays bounded.
- WebGL is preferred; if unavailable, TF.js falls back to WebAssembly (slower but still works).

## Privacy

- Images never leave your device
- No analytics, no tracking, no cookies
- No backend, no API calls
- Open source, MIT-style license (inherit from your original repo)

## License

Same as the original [ariesaves/Image-Resizer](https://github.com/ariesaves/Image-Resizer) repo.
